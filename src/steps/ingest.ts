import { createHash } from "node:crypto";
import { copyFile, mkdir, open, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { localIsoDate } from "../lib/dates.js";
import { probe, runFfmpeg } from "../lib/ffmpeg.js";
import { projectPaths } from "../lib/paths.js";
import { loadProject, saveProject } from "../lib/project.js";
import type { ProbeResult, RunFn } from "../lib/ffmpeg.js";
import type { Format, Project, Source } from "../lib/types.js";

/**
 * Eingehakte Fassungen fuer den Test; ohne sie laeuft echter
 * ffmpeg- und ffprobe-Prozess und die aktuelle lokale Zeit.
 */
export interface IngestDeps {
  run?: RunFn;
  /** Feste Uhr fuer den Test; ohne sie gilt die aktuelle lokale Zeit. */
  now?: Date;
}

/**
 * Bildraten gelten als gleich, wenn sie sich um weniger als das unterscheiden
 * (bewaehrt in der VideoPipeline). Aufloesungen muessen exakt passen.
 */
const FPS_TOLERANCE = 0.01;

/** Fuer die Pruefsumme werden hoechstens die ersten 8 MB gelesen. */
const CHECKSUM_BYTES = 8 * 1024 * 1024;

/**
 * Fingerabdruck aus Dateigroesse und den ersten 8 MB, gekuerzt auf 32 Zeichen
 * (wie in der VideoPipeline). Reicht, um Vertauschungen zu erkennen; auch die
 * Quellenpruefung vor dem Render rechnet damit.
 */
export async function sourceChecksum(file: string): Promise<string> {
  const info = await stat(file);
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(Math.min(CHECKSUM_BYTES, info.size));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return createHash("sha256")
      .update(String(info.size))
      .update(buffer.subarray(0, offset))
      .digest("hex")
      .slice(0, 32);
  } finally {
    await handle.close();
  }
}

/**
 * Prueft je Quelle, ob die abgelegte Datei noch zur gespeicherten Pruefsumme
 * passt. Der Render ruft das vor dem Plan auf, damit kein Schnitt auf
 * getauschtem Material sitzt; bei Abweichung bricht der Lauf mit Kennung,
 * Beschriftung und Pfad der Quelle ab.
 */
export async function verifySources(projectDir: string): Promise<void> {
  const project = await loadProject(projectDir);
  for (const source of project.sources) {
    const file = join(projectDir, source.file);
    let current: string;
    try {
      current = await sourceChecksum(file);
    } catch (error) {
      throw new Error(
        `Quelle ${source.id} (${source.label}) fehlt: ${source.file}`,
        { cause: error },
      );
    }
    if (current !== source.checksum) {
      throw new Error(
        `Quelle ${source.id} (${source.label}) hat sich geaendert: ${source.file}. ` +
        "Der Schnitt wuerde auf falschem Material sitzen; bitte neu einlesen.",
      );
    }
  }
}

/** Fortlaufende Kennung wie in der VideoPipeline: s01, s02, ... */
function nextSourceId(project: Project): string {
  let max = 0;
  for (const source of project.sources) {
    const number = Number.parseInt(source.id.slice(1), 10);
    if (Number.isFinite(number) && number > max) max = number;
  }
  return `s${String(max + 1).padStart(2, "0")}`;
}

/** Weichen Bildrate oder Aufloesung vom Projektformat ab? */
function needsNormalisation(info: ProbeResult, target: Format): boolean {
  return (
    Math.abs(info.fps - target.fps) > FPS_TOLERANCE ||
    info.width !== target.width ||
    info.height !== target.height
  );
}

/**
 * Liest eine Aufnahme ein: Quelle pruefen, einmalig auf das Projektformat
 * bringen, Ton als WAV und Standbilder ablegen. Eine Quelle ohne Tonspur oder
 * ohne brauchbares Bildformat wird abgelehnt, bevor irgendetwas angelegt
 * wird. Die erste Quelle setzt das Projektformat, jede weitere folgt ihm;
 * deshalb gehoert die Hauptquelle zuerst eingelesen. Fehlt ein Label, gilt
 * der Dateiname.
 */
export async function ingest(
  projectDir: string,
  videoPath: string,
  label: string,
  deps: IngestDeps = {},
): Promise<Source> {
  const project = await loadProject(projectDir);
  const info = await probe(videoPath, deps.run);

  // Ohne Ton scheitert spaeter die WAV-Ablage; ohne brauchbares Bildformat
  // wuerde bei der ersten Quelle ein unbrauchbares Projektformat entstehen.
  if (!info.hasAudio) {
    throw new Error(`Die Quelle hat keine Tonspur: ${videoPath}`);
  }
  if (info.fps <= 0 || info.width <= 0 || info.height <= 0) {
    throw new Error(
      `Die Quelle liefert kein brauchbares Bildformat: ${videoPath} ` +
      `(${info.width}x${info.height}, ${info.fps} fps)`,
    );
  }

  const paths = projectPaths(projectDir);
  const id = nextSourceId(project);
  const dir = join(paths.sourcesDir, id);
  await mkdir(join(dir, "frames"), { recursive: true });

  const isFirst = project.sources.length === 0;
  const normalized = !isFirst && needsNormalisation(info, project.format);
  const target = join(dir, "raw.mp4");

  if (isFirst) {
    project.format = { fps: info.fps, width: info.width, height: info.height };
  }

  if (normalized) {
    await runFfmpeg([
      "-y", "-i", videoPath,
      "-vf", `scale=${project.format.width}:${project.format.height}:flags=lanczos,fps=${project.format.fps}`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "16",
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
      target,
    ], deps.run);
  } else {
    await copyFile(videoPath, target);
  }

  await runFfmpeg(
    ["-y", "-i", target, "-vn", "-ac", "1", "-ar", "48000", join(dir, "source.wav")],
    deps.run,
  );
  await runFfmpeg(
    // yuvj420p ist der volle Wertebereich, den JPEG nativ fuehrt. Ohne die
    // Angabe bricht der mjpeg-Encoder bei begrenztem yuv420p ab, wenn die
    // Quelle so kurz ist, dass fps=1/10 kein Standbild liefert.
    ["-y", "-i", target, "-vf", "fps=1/10", "-pix_fmt", "yuvj420p", "-q:v", "4",
      join(dir, "frames", "t%04d.jpg")],
    deps.run,
  );

  const finalInfo = await probe(target, deps.run);
  const source: Source = {
    id,
    label: label || basename(videoPath),
    file: `sources/${id}/raw.mp4`,
    added: localIsoDate(deps.now),
    duration: finalInfo.duration,
    checksum: await sourceChecksum(target),
    normalized,
  };

  project.sources.push(source);
  await saveProject(projectDir, project);
  return source;
}
