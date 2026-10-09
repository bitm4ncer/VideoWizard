import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { runFfmpeg } from "./ffmpeg.js";
import { projectPaths } from "./paths.js";
import { loadProject } from "./project.js";
import type { Stats } from "node:fs";
import type { RunFn } from "./ffmpeg.js";
import type { Block, Project } from "./types.js";
import type { TranscriptWord } from "./providers/transcript.js";

/**
 * Der Einweg-Hand-off nach Diffusion Studio: aus einem VideoWizard-Projekt
 * wird ein DS-Projektordner (JSX). Die DS-Konventionen stammen aus der
 * installierten Doku (JSX-Referenz der App), nicht aus Vermutungen: eine
 * Szene je Block, absolute Medienpfade, Wortzeiten als Untertiteldatei.
 */

/** Die Medien einer Handoff-Fassung; alle Pfade absolut mit Schraegstrichen. */
export interface HandoffMedia {
  /** Je Block-ID das Bild: der Film der Quelle bei take, das PNG bei still. */
  pictures: Map<string, string>;
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
 * Baut die index.tsx: je Block eine Szene, die erste aktiv (sonst oeffnet DS
 * auf einer leeren Timeline). take wird ein video, das per sourceIn/sourceOut
 * auf den Quellbereich getrimmt ist; start bleibt 0, damit Bild, Ton und
 * Untertitel auf der Szenenachse zusammenpassen. Der Quellton ist stumm, weil
 * der Schnittplan ihn nicht uebernimmt. still ein image des extrahierten
 * Frames, dazu audio und captions, wo Medien vorliegen. Overlays sind in v1
 * ausgenommen.
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
    if (block.kind === "take") {
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

/**
 * Die Wortzeiten eines take-Blocks als SRT auf der Szenenachse: nur Woerter,
 * die den Blockbereich beruehren, verschoben um source_in und an den Raendern
 * gekuerzt. Ohne Woerter im Bereich kommt null zurueck.
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

  const lines: string[] = [];
  cues.forEach((cue, index) => {
    lines.push(String(index + 1), `${srtTime(cue.start)} --> ${srtTime(cue.end)}`, cue.text, "");
  });
  return lines.join("\n");
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

/** Das README des Hand-offs: die Einweg-Regel, der Oeffnen-Hinweis, v1-Grenzen. */
function buildReadme(project: Project, target: string): string {
  return [
    `# Hand-off: ${project.title}`,
    "",
    "Einweg: nach dem Hand-off ist Diffusion Studio fuer dieses Projekt der Master; " +
    "`project.json` bleibt Schnittplan-Snapshot.",
    "",
    `Oeffnen: \`diffusion open ${posixPath(target)}\` oder den Ordner in der App oeffnen.`,
    "",
    "Nicht uebernommen (v1): Overlays des Schnittplans.",
    "",
  ].join("\n");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
 * belegter Zielordner wird verweigert, nur mit force ersetzt. Standbilder
 * werden per ffmpeg extrahiert; Wortzeiten werden zu SRT-Dateien. Fehlen die
 * Wortzeiten, wird gewarnt und ohne Untertitel gebaut, kein Fehler.
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
  const root = projectPaths(projectDir).dir;
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  for (const block of project.blocks) {
    if (!sources.has(block.source_id)) {
      throw new Error(`Block ${block.id} verweist auf die unbekannte Quelle ${block.source_id}.`);
    }
  }

  const target = resolve(out);
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
      audio: new Map(),
      captions: new Map(),
    };

    // Standbilder zuerst: erst die extrahierten Frames machen aus einem
    // still-Block ein bildfaehiges <image>.
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
      }
      if (block.tts !== undefined) {
        media.audio.set(block.id, posixPath(resolve(root, block.tts.file)));
      }
    }

    // Wortzeiten: je take-Block eine eigene SRT auf der Szenenachse. Die
    // Wortdatei jeder Quelle wird einmal gelesen.
    const wordsBySource = new Map<string, TranscriptWord[]>();
    let captionFiles = 0;
    for (const block of project.blocks) {
      if (block.kind !== "take") continue;
      let words = wordsBySource.get(block.source_id);
      if (words === undefined) {
        words = await loadWords(root, block.source_id);
        wordsBySource.set(block.source_id, words);
      }
      const srt = srtForBlock(block, words);
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
