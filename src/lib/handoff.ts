import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { toCues } from "./captions.js";
import { runFfmpeg } from "./ffmpeg.js";
import { computeFit } from "./fit.js";
import { projectPaths } from "./paths.js";
import { loadProject } from "./project.js";
import { mapWordsToOutput, remainingRanges } from "./renderplan.js";
import type { Stats } from "node:fs";
import type { RunFn } from "./ffmpeg.js";
import type { FitResult } from "./fit.js";
import type { VideoSegment } from "./renderplan.js";
import type { Block, Project } from "./types.js";
import type { TranscriptWord } from "./providers/transcript.js";

/**
 * Der Einweg-Hand-off nach Diffusion Studio: aus einem VideoWizard-Projekt
 * wird ein DS-Projektordner (JSX). Die DS-Konventionen stammen aus der
 * installierten Doku (JSX-Referenz der App), nicht aus Vermutungen: eine
 * Szene je Block, absolute Medienpfade, Wortzeiten als Untertiteldatei.
 * Folgt ein take-Block der Sync-Logik des Renderers (computeFit,
 * unabhaengig vom gespeicherten fit-Etikett), spiegelt der Aufbau den
 * Render-Plan: behaltene Bereiche als getrimmte Videos in einer sequence,
 * Haltebilder als extrahierte Frames, Captions auf der Ausgangsachse.
 */

/** Die Medien einer Handoff-Fassung; alle Pfade absolut mit Schraegstrichen. */
export interface HandoffMedia {
  /** Je Block-ID das Bild: der Film der Quelle bei take, das PNG bei still. */
  pictures: Map<string, string>;
  /** Je Block-ID das extrahierte Haltebild; fehlt ohne fit hold mit Halteanteil. */
  holds: Map<string, string>;
  /** Je Block-ID die Tondatei der Vertonung; fehlt bei Bloecken ohne tts.file. */
  audio: Map<string, string>;
  /** Je Block-ID die Untertiteldatei; fehlt ohne Wortzeiten im Blockbereich. */
  captions: Map<string, string>;
}

/** Eingehakte Abhaengigkeiten fuer den Test; ohne sie laeuft echter ffmpeg-Prozess. */
export interface HandoffDeps {
  run?: RunFn;
  force?: boolean;
}

/** Ziel im Projekt: ein eigener Ordner, damit der Hand-off nichts anderes beruehrt. */
export function handoffDir(projectDir: string): string {
  return join(resolve(projectDir), "handoff", "diffusion-studio");
}

/** JSX liest Pfade mit Schraegstrich; Windows liefert Backslashes. */
function posixPath(path: string): string {
  return path.split(sep).join("/");
}

/** Eine Zahl wie im JSX: hoechstens drei Nachkommastellen, keine Exponentialform. */
function num(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** Ein Attributwert als JSX-Zeichenkette; JSON.stringify entschaerft Anfuehrungszeichen. */
function attr(value: string): string {
  return JSON.stringify(value);
}

/**
 * Ein Standbild hat keine Quellzeit zum Trimmen; es steht so lange wie seine
 * Stimme, ohne Vertonung so lange wie das Blockfenster.
 */
function stillDuration(block: Block): number {
  if (block.tts !== undefined) return block.tts.duration + block.pause_after;
  return Math.max(0, block.source_out - block.source_in);
}

/**
 * Das Fit-Ergebnis eines Blocks, wie der Render-Plan es bildet: fuer
 * take-Bloecke mit Text und Vertonung, unabhaengig vom gespeicherten
 * fit-Etikett (segment.ts schreibt "none" in neue Bloecke). Bloecke, die der
 * Renderer ohne Sync ueberspringt, liefern null; fuer sie bleibt das
 * Altverhalten ueber das Blockfenster.
 */
function fitForBlock(block: Block): FitResult | null {
  if (block.kind !== "take" || block.text === undefined || block.tts === undefined) return null;
  return computeFit(block, block.tts.duration);
}

/**
 * Die Bildwerte eines fit-treuen Blocks in der Form des Render-Plans: die
 * Bereiche aus der Bereichsfunktion des Renderers, Tempo, Halteanteil und
 * Zieldauer mit denselben gerundeten Werten wie dort. `mapWordsToOutput`
 * liest Bereiche und Tempo, damit die Captions auf derselben Achse liegen.
 */
function fitSegment(block: Block, fit: FitResult, sourceFile: string): VideoSegment {
  return {
    blockId: block.id,
    kind: block.kind,
    sourceId: block.source_id,
    sourceFile,
    ranges: remainingRanges(block.source_in, fit.effectiveOut, fit.cuts),
    freezeAt: null,
    speed: Number(fit.speed.toFixed(3)),
    freeze: Number(fit.freeze.toFixed(3)),
    duration: Number(fit.targetDuration.toFixed(3)),
  };
}

/**
 * Baut die index.tsx: je Block eine Szene, die erste aktiv (sonst oeffnet DS
 * auf einer leeren Timeline). Ein take-Block mit Text und Vertonung wird
 * eine sequence nach dem computeFit-Ergebnis des Renderers, unabhaengig vom
 * gespeicherten fit-Etikett: je behaltenem Bereich ein stummes, per
 * sourceIn/sourceOut getrimmtes video mit explizitem start auf der
 * Ausgangsachse, dazu das extrahierte Haltebild als image bis zur Zieldauer;
 * die sequence endet auf der Zieldauer der Sync-Logik. Ueberlaenge behalten
 * dabei das volle Bildfenster und die Zieldauer. Ohne Sync (kein Text oder
 * keine Vertonung) bleibt es beim einen video ueber das Blockfenster. Der
 * Quellton ist stumm, weil der Schnittplan ihn nicht uebernimmt. still ein
 * image des extrahierten Frames, dazu audio und captions, wo Medien
 * vorliegen. Overlays sind in v1 ausgenommen.
 */
export function buildIndexTsx(project: Project, media: HandoffMedia): string {
  const { width, height } = project.format;
  const lines: string[] = [
    "export default function Project() {",
    "  return (",
    '    <stage background="#161616">',
  ];

  project.blocks.forEach((block, index) => {
    const active = index === 0 ? " active" : "";
    const picture = media.pictures.get(block.id);
    if (picture === undefined) {
      throw new Error(`Hand-off fuer Block ${block.id}: der Bildpfad fehlt.`);
    }
    lines.push(
      `      <scene id=${attr(block.id)} width={${width}} height={${height}} ` +
      `fill="black"${active}>`,
    );
    const fit = fitForBlock(block);
    if (fit !== null) {
      const segment = fitSegment(block, fit, picture);
      if (segment.ranges.length === 0) {
        throw new Error(
          `Hand-off fuer Block ${block.id}: kein verbleibender Bildbereich.`,
        );
      }
      lines.push(
        `        <sequence id=${attr(`${block.id}-sequence`)} ` +
        `end={${num(segment.duration)}}>`,
      );
      // Die Doku verlangt je Kind einen expliziten start; das Tempo traegt
      // nur ein verlangsamter Block.
      let start = 0;
      segment.ranges.forEach(([from, to], rangeIndex) => {
        const rate = Math.abs(segment.speed - 1) > 0.001
          ? ` playbackRate={${num(segment.speed)}}`
          : "";
        lines.push(
          `          <video id=${attr(`${block.id}-video-${rangeIndex + 1}`)} ` +
          `src=${attr(picture)} sourceIn={${num(from)}} sourceOut={${num(to)}} ` +
          `start={${num(start)}}${rate} width={${width}} height={${height}} muted />`,
        );
        start += to - from;
      });
      // Halteanteil wie tpad im Renderer: nur oberhalb der Schwelle.
      if (segment.freeze > 0.001) {
        const hold = media.holds.get(block.id);
        if (hold === undefined) {
          throw new Error(`Hand-off fuer Block ${block.id}: der Halteframe fehlt.`);
        }
        lines.push(
          `          <image id=${attr(`${block.id}-hold`)} src=${attr(hold)} ` +
          `start={${num(segment.duration - segment.freeze)}} ` +
          `end={${num(segment.duration)}} width={${width}} height={${height}} />`,
        );
      }
      lines.push("        </sequence>");
    } else if (block.kind === "take") {
      lines.push(
        `        <video id=${attr(`${block.id}-video`)} src=${attr(picture)} ` +
        `sourceIn={${num(block.source_in)}} sourceOut={${num(block.source_out)}} ` +
        `width={${width}} height={${height}} muted />`,
      );
    } else {
      lines.push(
        `        <image id=${attr(`${block.id}-image`)} src=${attr(picture)} ` +
        `end={${num(stillDuration(block))}} width={${width}} height={${height}} />`,
      );
    }
    const audio = media.audio.get(block.id);
    if (audio !== undefined) {
      lines.push(`        <audio id=${attr(`${block.id}-audio`)} src=${attr(audio)} />`);
    }
    const captions = media.captions.get(block.id);
    if (captions !== undefined) {
      lines.push(
        `        <captions id=${attr(`${block.id}-captions`)} src=${attr(captions)} ` +
        `preset="classic" />`,
      );
    }
    lines.push("      </scene>");
  });

  lines.push("    </stage>", "  );", "}", "");
  return lines.join("\n");
}

/**
 * Die package.json des Hand-offs: nur name, displayName und main. projectId,
 * Scripts und devDependencies setzt die DS-App beim Oeffnen selbst; erfundene
 * Felder wuerden dort nur kollidieren.
 */
export function buildPackageJson(project: Project): string {
  const pkg = {
    name: project.id,
    displayName: project.title,
    main: "index.tsx",
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/** Eine SRT-Zeit als hh:mm:ss,mmm, wie der Standard sie liest. */
function srtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const millis = total % 1000;
  const secs = Math.floor(total / 1000) % 60;
  const mins = Math.floor(total / 60000) % 60;
  const hours = Math.floor(total / 3600000);
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${two(hours)}:${two(mins)}:${two(secs)},${String(millis).padStart(3, "0")}`;
}

/** Die fertigen Cues als SRT; beide Wege, mit und ohne Fit, schreiben so. */
function cuesToSrt(cues: Array<{ start: number; end: number; text: string }>): string {
  const lines: string[] = [];
  cues.forEach((cue, index) => {
    lines.push(String(index + 1), `${srtTime(cue.start)} --> ${srtTime(cue.end)}`, cue.text, "");
  });
  return lines.join("\n");
}

/**
 * Die Wortzeiten eines take-Blocks ohne Sync-Ergebnis (kein Text oder keine
 * Vertonung) als SRT auf der Szenenachse: nur Woerter, die den Blockbereich
 * beruehren, verschoben um source_in und an den Raendern gekuerzt. Ohne
 * Woerter im Bereich kommt null zurueck.
 */
function srtForBlock(block: Block, words: TranscriptWord[]): string | null {
  const from = block.source_in;
  const to = block.source_out;
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (const word of words) {
    const wordText = word.text.trim();
    if (wordText === "") continue;
    const start = Math.max(word.start, from);
    const end = Math.min(word.end, to);
    if (end - start <= 0) continue;
    cues.push({
      start: Number((start - from).toFixed(3)),
      end: Number((end - from).toFixed(3)),
      text: wordText,
    });
  }
  if (cues.length === 0) return null;
  return cuesToSrt(cues);
}

/**
 * Die Wortzeiten eines fit-treuen take-Blocks als SRT auf der Ausgangsachse:
 * dieselbe Abbildung wie der ASS-Render (mapWordsToOutput, toCues). Was in
 * einem entfernten Schnitt liegt, belegt keine Zeit mehr, und kein Cue
 * reicht ueber den Schnittpunkt hinaus. Ohne Woerter im Bereich kommt null
 * zurueck.
 */
function srtForFit(
  block: Block, fit: FitResult, words: TranscriptWord[], sourceFile: string,
): string | null {
  const segment = fitSegment(block, fit, sourceFile);
  const cues = toCues(mapWordsToOutput(segment, words), 0);
  if (cues.length === 0) return null;
  return cuesToSrt(cues);
}

/**
 * Die Wortzeiten einer Quelle. Fehlt die Datei, bleibt die Quelle ohne
 * Untertitel; eine kaputte Datei ist ein Fehler, kein stiller Ausfall.
 */
async function loadWords(projectDir: string, sourceId: string): Promise<TranscriptWord[]> {
  const file = join(projectPaths(projectDir).sourcesDir, sourceId, "words.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Wortdatei ist kein gueltiges JSON: ${file}`, { cause: error });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Wortdatei ist keine Liste: ${file}`);
  }
  return parsed as TranscriptWord[];
}

/** Das README des Hand-offs: die Einweg-Regel, der Oeffnen-Hinweis, die Grenzen. */
function buildReadme(project: Project, target: string): string {
  const overflowing = project.blocks
    .filter((block) => fitForBlock(block)?.fit === "overflow")
    .map((block) => block.id);
  const lines = [
    `# Hand-off: ${project.title}`,
    "",
    "Einweg: nach dem Hand-off ist Diffusion Studio fuer dieses Projekt der Master; " +
    "`project.json` bleibt Schnittplan-Snapshot.",
    "",
    `Oeffnen: \`diffusion open ${posixPath(target)}\` oder den Ordner in der App oeffnen.`,
    "",
    "Uebernommen: Schnittfenster je Block, Fit-Schnitte der Sync-Logik " +
    "(getrimmte Bereiche, Haltebilder) und Captions auf der Ausgangsachse.",
    "",
    "Nicht uebernommen (v1): Overlays des Schnittplans, Musik, Outro.",
    "",
  ];
  if (overflowing.length > 0) {
    lines.push(
      `Warnung: Ueberlaenge bei ${overflowing.join(", ")}; das Bildfenster bleibt wie ` +
      "gewaehlt, der Ton laeuft gegebenenfalls laenger als das Bild.",
      "",
    );
  }
  return lines.join("\n");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ob ein Pfad im anderen liegt; Gleichheit zaehlt als "in". Windows
 * vergleicht Pfade ohne Ruecksicht auf Gross- und Kleinschreibung.
 */
function isInside(path: string, parent: string): boolean {
  const normalize = (value: string): string =>
    process.platform === "win32" ? value.toLowerCase() : value;
  const child = normalize(path);
  const base = normalize(parent);
  const prefix = base.endsWith(sep) ? base : base + sep;
  return child === base || child.startsWith(prefix);
}

/** Der Zustand des Ziels: fehlt, leer oder belegt (auch als Datei). */
async function targetState(path: string): Promise<"missing" | "empty" | "full"> {
  let info: Stats;
  try {
    info = await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
  if (!info.isDirectory()) return "full";
  return (await readdir(path)).length === 0 ? "empty" : "full";
}

/**
 * Baut den Diffusion-Studio-Ordner. Erst im Temp-Ordner daneben, dann als
 * Ganzes an seinen Platz: ein Fehler hinterlaesst keinen Mischzustand. Ein
 * belegter Zielordner wird verweigert, nur mit force ersetzt. Ziele im
 * Projekt selbst oder in seinen Medienquellen lehnt er immer ab. Standbilder
 * und die Haltebilder der Bloecke mit Halteanteil werden per ffmpeg
 * extrahiert; Wortzeiten werden zu SRT-Dateien. Fehlen die Wortzeiten, wird
 * gewarnt und ohne Untertitel gebaut, kein Fehler.
 */
export async function renderHandoff(
  projectDir: string,
  out: string,
  deps: HandoffDeps = {},
): Promise<{ index: string; files: string[] }> {
  const project = await loadProject(projectDir);
  if (project.sources.length === 0) {
    throw new Error("Hand-off nicht moeglich: das Projekt hat keine Quellen.");
  }
  if (project.blocks.length === 0) {
    throw new Error("Hand-off nicht moeglich: das Projekt hat keine Bloecke.");
  }
  const paths = projectPaths(projectDir);
  const root = paths.dir;
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  for (const block of project.blocks) {
    if (!sources.has(block.source_id)) {
      throw new Error(`Block ${block.id} verweist auf die unbekannte Quelle ${block.source_id}.`);
    }
  }

  const target = resolve(out);
  // Ein Ziel, das das Projekt umfasst, das Projekt selbst oder seine Medien
  // ist, wuerde beim Ersetzen die einzigen Medienkopien loeschen; das ist ein
  // Bedienfehler, kein force-Fall. Der Schutz greift vor jedem Loeschen.
  if (target === root || isInside(root, target)) {
    throw new Error(
      `Ziel ist das Projekt selbst oder ein Ordner darueber: ${target}. ` +
      "Bitte einen Zielordner ausserhalb waehlen.",
    );
  }
  if (isInside(target, paths.sourcesDir) || isInside(target, join(root, "audio"))) {
    throw new Error(
      `Ziel liegt in den Projektmedien (sources oder audio): ${target}. ` +
      "Bitte einen Zielordner ausserhalb waehlen.",
    );
  }
  const state = await targetState(target);
  if (state === "full" && deps.force !== true) {
    throw new Error(`Zielordner ist nicht leer: ${target}. Nur mit --force ersetzen.`);
  }

  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const temp = join(parent, `.handoff-tmp-${process.pid}-${randomUUID()}`);
  const relative: string[] = [];
  const finalPath = (rel: string): string => join(target, ...rel.split("/"));

  try {
    await mkdir(join(temp, "media"), { recursive: true });
    await mkdir(join(temp, "captions"), { recursive: true });

    const media: HandoffMedia = {
      pictures: new Map(),
      holds: new Map(),
      audio: new Map(),
      captions: new Map(),
    };

    // Standbilder und Haltebilder zuerst: erst die extrahierten Frames machen
    // aus einem still-Block ein bildfaehiges <image> und aus einem Block mit
    // Halteanteil das Haltebild am Ende des gespielten Bildes.
    for (const block of project.blocks) {
      const source = sources.get(block.source_id);
      if (source === undefined) continue; // oben bereits geprueft
      const sourceFile = resolve(root, source.file);
      if (block.kind === "still") {
        const rel = `media/${block.id}.png`;
        const at = block.freeze_at ?? block.source_in;
        try {
          await runFfmpeg(
            ["-y", "-ss", String(at), "-i", sourceFile, "-frames:v", "1", join(temp, rel)],
            deps.run,
          );
        } catch (error) {
          throw new Error(
            `Standbild ${block.id} liess sich nicht extrahieren: ${errorText(error)}`,
            { cause: error },
          );
        }
        // Im JSX steht der spaetere Zielpfad, nicht der Temp-Pfad: das
        // Projekt wird nach dem Umbenennen geoeffnet.
        media.pictures.set(block.id, posixPath(finalPath(rel)));
        relative.push(rel);
      } else {
        media.pictures.set(block.id, posixPath(sourceFile));
        const fit = fitForBlock(block);
        if (fit !== null) {
          const segment = fitSegment(block, fit, sourceFile);
          // Halteanteil wie tpad im Renderer: nur oberhalb der Schwelle.
          if (segment.freeze > 0.001) {
            const rel = `media/${block.id}-hold.png`;
            try {
              await runFfmpeg(
                [
                  "-y", "-ss", String(fit.effectiveOut), "-i", sourceFile,
                  "-frames:v", "1", join(temp, rel),
                ],
                deps.run,
              );
            } catch (error) {
              throw new Error(
                `Halteframe ${block.id} liess sich nicht extrahieren: ${errorText(error)}`,
                { cause: error },
              );
            }
            media.holds.set(block.id, posixPath(finalPath(rel)));
            relative.push(rel);
          }
        }
      }
      if (block.tts !== undefined) {
        media.audio.set(block.id, posixPath(resolve(root, block.tts.file)));
      }
    }

    // Wortzeiten: je take-Block eine eigene SRT. Fit-treue Bloecke folgen
    // der Ausgangsachse des Renderers, alle anderen dem alten Blockfenster.
    // Die Wortdatei jeder Quelle wird einmal gelesen.
    const wordsBySource = new Map<string, TranscriptWord[]>();
    let captionFiles = 0;
    for (const block of project.blocks) {
      if (block.kind !== "take") continue;
      const source = sources.get(block.source_id);
      if (source === undefined) continue; // oben bereits geprueft
      let words = wordsBySource.get(block.source_id);
      if (words === undefined) {
        words = await loadWords(root, block.source_id);
        wordsBySource.set(block.source_id, words);
      }
      const fit = fitForBlock(block);
      const srt = fit !== null
        ? srtForFit(block, fit, words, resolve(root, source.file))
        : srtForBlock(block, words);
      if (srt === null) continue;
      const rel = `captions/${block.id}.srt`;
      await writeFile(join(temp, rel), srt, "utf8");
      media.captions.set(block.id, posixPath(finalPath(rel)));
      relative.push(rel);
      captionFiles += 1;
    }
    if (captionFiles === 0 && project.blocks.some((block) => block.kind === "take")) {
      console.warn("Warnung: Keine Wortzeiten gefunden; Untertitel werden ausgelassen.");
    }

    const indexFile = join(temp, "index.tsx");
    await writeFile(indexFile, buildIndexTsx(project, media), "utf8");
    relative.push("index.tsx");
    await writeFile(join(temp, "package.json"), buildPackageJson(project), "utf8");
    relative.push("package.json");
    await writeFile(join(temp, "README.md"), buildReadme(project, target), "utf8");
    relative.push("README.md");

    if (state !== "missing") {
      await rm(target, { recursive: true, force: true });
    }
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const files = relative
    .map((path) => join(target, ...path.split("/")))
    .sort();
  return { index: join(target, "index.tsx"), files };
}
