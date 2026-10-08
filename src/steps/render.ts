import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { probe, runFfmpeg } from "../lib/ffmpeg.js";
import {
  concatListLine, musicMixFilter, outroFilter, segmentFilter, voiceFilter,
} from "../lib/ffargs.js";
import { buildRenderPlan, type RenderPlan, type VideoSegment } from "../lib/renderplan.js";
import { loadProject } from "../lib/project.js";
import { projectPaths } from "../lib/paths.js";
import type { RunFn } from "../lib/ffmpeg.js";
import type { Format } from "../lib/types.js";

/** Zwischenclips und die fertige Tonspur liegen hier (bewaehrt in der VideoPipeline). */
const CACHE_DIR = join(".cache", "render");
/** Der Ergebnisordner; fertige Videos werden nie ueberschrieben. */
const OUT_DIR = "out";

/**
 * Die Vorgaben aus dem Ruling, an echtem Material erprobt (brand.json der
 * VideoPipeline). Fehlende Projektangaben fallen darauf zurueck.
 */
const DEFAULT_VOICE_LUFS = -16;
const DEFAULT_MASTER_LUFS = -14;
const DEFAULT_MUSIC_GAIN_DB = -22;
const DEFAULT_DUCK_DB = -12;
const DEFAULT_CROSSFADE = 0.5;

/** Zwischenformate: yuv420p mit geraden Kanten; final wird einmal encodiert. */
const INTERMEDIATE = [
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-an",
];

/** Endlauf: NVENC, bei Fehlschlag die bewaehrte libx264-Fassung. */
function finalVideoArgs(useNvenc: boolean): string[] {
  return useNvenc
    ? ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0", "-pix_fmt", "yuv420p"]
    : ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p"];
}

/** Bestehende Videos werden nie ueberschrieben, der Name bekommt eine laufende Nummer. */
export function nextOutputName(existing: string[], projectId: string): string {
  const escaped = projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-(\\d+)\\.mp4$`);
  let max = 0;
  for (const name of existing) {
    const match = pattern.exec(name);
    if (match?.[1] !== undefined) {
      const n = Number.parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `${projectId}-${String(max + 1).padStart(2, "0")}.mp4`;
}

/** Nur ENOENT gilt als "fehlt"; andere Fehler reicht der Aufrufer als Fehler weiter. */
async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Einen Block als Zwischenclip rendern; still haelt einen einzelnen Frame. */
async function renderSegment(
  projectDir: string, segment: VideoSegment, cacheDir: string, format: Format, run: RunFn | undefined,
): Promise<string> {
  const target = join(cacheDir, `seg-${segment.blockId}.mp4`);

  if (segment.kind === "still") {
    const frame = join(cacheDir, `frame-${segment.blockId}.png`);
    const source = resolve(projectDir, segment.sourceFile);
    await runFfmpeg([
      "-y", "-ss", String(segment.freezeAt ?? 0), "-i", source, "-frames:v", "1", frame,
    ], run);
    await runFfmpeg([
      "-y", "-loop", "1", "-t", String(segment.duration), "-i", frame,
      "-vf", `fps=${format.fps}`, ...INTERMEDIATE, target,
    ], run);
    return target;
  }

  const source = resolve(projectDir, segment.sourceFile);
  await runFfmpeg([
    "-y", "-i", source,
    "-filter_complex", segmentFilter(segment, format.fps),
    "-map", "[vout]", ...INTERMEDIATE, target,
  ], run);
  return target;
}

/** Die Sprachspur: jeder Block auf Stimme plus Pause, danach auf den Projektpegel. */
async function renderVoiceTrack(
  plan: RenderPlan, projectDir: string, cacheDir: string, voiceLufs: number,
  run: RunFn | undefined,
): Promise<string> {
  const target = join(cacheDir, "vo.wav");
  const inputs = plan.audio.flatMap((segment) => ["-i", resolve(projectDir, segment.file)]);
  const filter = `${voiceFilter(plan.audio)};[voraw]loudnorm=I=${voiceLufs}:TP=-1.5:LRA=11,aresample=48000[voout]`;
  await runFfmpeg([
    "-y", ...inputs, "-filter_complex", filter,
    "-map", "[voout]", "-c:a", "pcm_s16le", "-ac", "2", target,
  ], run);
  return target;
}

/**
 * Bringt das Outro einmalig auf das Projektformat und legt es im Cache ab.
 * Liegt es schon passend im Cache, wird es wiederverwendet.
 */
async function normalisedOutro(
  source: string, format: Format, cacheDir: string, run: RunFn | undefined,
): Promise<string> {
  const target = join(cacheDir, `outro-${format.width}x${format.height}-${format.fps.toFixed(3)}.mp4`);
  try {
    const existing = await probe(target, run);
    if (existing.width === format.width && Math.abs(existing.fps - format.fps) < 0.01) {
      return target;
    }
  } catch {
    // Noch nicht im Cache, wird jetzt erzeugt.
  }
  await runFfmpeg([
    "-y", "-i", source,
    "-vf", `scale=${format.width}:${format.height}:flags=lanczos,fps=${format.fps}`,
    ...INTERMEDIATE.filter((arg) => arg !== "-an"),
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
    target,
  ], run);
  return target;
}

/** Schalter des Render-Laufs. */
export interface RenderOptions {
  /** Ueberlaenge bewusst rendern statt abzubrechen. */
  allowOverflow?: boolean;
}

/**
 * Eingehakte Fassungen fuer den Test; ohne sie laeuft echter
 * ffmpeg- und ffprobe-Prozess.
 */
export interface RenderDeps {
  run?: RunFn;
}

/**
 * Fuehrt den Render-Plan aus: Bloecke schneiden, zusammenfuegen, Ton mischen,
 * Outro anhaengen. Vor dem Schreiben wird die Projektdatei daneben gesichert.
 * Eine fehlende Musikdatei bricht ab, bevor etwas laeuft; ein fehlendes Outro
 * wird nur gemeldet und der Lauf rendert ohne Outro.
 */
export async function renderProject(
  projectDir: string,
  opts: RenderOptions = {},
  deps: RenderDeps = {},
): Promise<string> {
  const { run } = deps;
  const project = await loadProject(projectDir);
  const plan = buildRenderPlan(project, opts);
  for (const warning of plan.warnings) console.warn(`Warnung: ${warning}`);
  if (plan.video.length === 0) {
    throw new Error("Es gibt keinen fertigen Block zum Rendern.");
  }
  if (plan.format.width % 2 !== 0 || plan.format.height % 2 !== 0) {
    throw new Error(
      `Projektformat ${plan.format.width}x${plan.format.height} hat ungerade Kanten; ` +
      "yuv420p braucht gerade Kanten.",
    );
  }

  // Musik: konfiguriert und die Datei fehlt, bricht ab, bevor etwas geschrieben wird.
  const music = plan.music;
  let musicFile: string | null = null;
  if (music !== null) {
    musicFile = resolve(projectDir, music.file);
    if (!(await fileExists(musicFile))) {
      throw new Error(`Musikdatei fehlt: ${music.file}`);
    }
  }

  // Outro: konfiguriert und die Datei fehlt, rendert ohne Outro und sagt das.
  const outro = plan.outro;
  let outroFile: string | null = null;
  if (outro !== null) {
    const file = resolve(projectDir, outro.file);
    if (await fileExists(file)) {
      outroFile = file;
    } else {
      console.warn(`Warnung: Outro fehlt (${outro.file}); der Lauf rendert ohne Outro.`);
    }
  }

  const cacheDir = join(projectDir, CACHE_DIR);
  const outDir = join(projectDir, OUT_DIR);
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  // 1. Bloecke einzeln rendern
  const files: string[] = [];
  for (const segment of plan.video) {
    files.push(await renderSegment(projectDir, segment, cacheDir, plan.format, run));
  }

  // 2. Zusammenfuegen. Die concat-Liste braucht absolute Pfade: ffmpeg loest
  //    Eintraege sonst gegen den Ordner der Listendatei auf und sucht sie doppelt.
  const listFile = join(cacheDir, "segments.txt");
  const lines = files.map((file) => concatListLine(resolve(file)));
  await writeFile(listFile, `${lines.join("\n")}\n`, "utf8");
  const videoOnly = join(cacheDir, "video.mp4");
  // Neu kodieren statt kopieren: eine reine Kopie uebernimmt die Zeitstempel der
  // Einzelstuecke, und daran bricht spaeter das Ueberblenden zum Outro. xfade
  // liefert dann nur das Hauptvideo zurueck und der Ton endet zu frueh.
  await runFfmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", `fps=${plan.format.fps}`, ...INTERMEDIATE, videoOnly,
  ], run);

  // 3. Sprachspur
  const voiceLufs = project.audio?.voice_lufs ?? DEFAULT_VOICE_LUFS;
  const masterLufs = project.audio?.master_lufs ?? DEFAULT_MASTER_LUFS;
  const voice = await renderVoiceTrack(plan, projectDir, cacheDir, voiceLufs, run);

  // 4. Ton fertig mischen
  const audioFinal = join(cacheDir, "audio.wav");
  if (music !== null && musicFile !== null) {
    await runFfmpeg([
      "-y", "-i", voice, "-stream_loop", "-1", "-i", musicFile,
      "-filter_complex", musicMixFilter({
        gainDb: music.gain_db ?? DEFAULT_MUSIC_GAIN_DB,
        duckDb: music.duck_db ?? DEFAULT_DUCK_DB,
        masterLufs,
      }),
      "-map", "[aout]", "-shortest", "-c:a", "pcm_s16le", "-ac", "2", audioFinal,
    ], run);
  } else {
    await runFfmpeg([
      "-y", "-i", voice,
      "-af", `loudnorm=I=${masterLufs}:TP=-1.5:LRA=11`,
      "-c:a", "pcm_s16le", "-ac", "2", audioFinal,
    ], run);
  }

  // 5. Bild und Ton verbinden
  const main = join(cacheDir, "main.mp4");
  await runFfmpeg([
    "-y", "-i", videoOnly, "-i", audioFinal,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", main,
  ], run);

  // 6. Outro anhaengen und final encodieren
  const existing = await readdir(outDir).catch(() => [] as string[]);
  const outputName = nextOutputName(existing, project.id);
  const output = join(outDir, outputName);

  const base = ["-y", "-i", main];
  if (outro !== null && outroFile !== null) {
    const normalisiert = await normalisedOutro(outroFile, plan.format, cacheDir, run);
    const mainInfo = await probe(main, run);
    const crossfade = outro.crossfade ?? DEFAULT_CROSSFADE;
    base.push(
      "-i", normalisiert,
      "-filter_complex", outroFilter(mainInfo.duration, crossfade),
      "-map", "[v]", "-map", "[a]",
    );
  }
  base.push("-c:a", "aac", "-b:a", "256k", "-ar", "48000");

  try {
    await runFfmpeg([...base, ...finalVideoArgs(true), output], run);
  } catch {
    console.warn("Warnung: NVENC nicht verfuegbar, weiche auf libx264 aus.");
    await runFfmpeg([...base, ...finalVideoArgs(false), output], run);
  }

  // 7. Projektstand neben das Ergebnis sichern
  const { projectFile } = projectPaths(projectDir);
  await copyFile(projectFile, join(outDir, "project.snapshot.json"));

  return output;
}
