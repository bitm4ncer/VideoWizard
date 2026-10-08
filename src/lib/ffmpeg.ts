import { spawn } from "node:child_process";

/** Ergebnis eines externen Programms. */
export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Wie ein externes Programm ausgefuehrt wird. Im Test wird dieser Aufruf
 * eingehakt, damit kein echtes ffmpeg und kein echtes ffprobe noetig sind.
 */
export type RunFn = (bin: string, args: string[]) => Promise<RunResult>;

/** Die einzige Stelle, die einen Prozess startet. */
const spawnRun: RunFn = (bin, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: string) => {
      stdout += data;
    });
    child.stderr.on("data", (data: string) => {
      stderr += data;
    });
    child.on("error", (error) => {
      reject(new Error(`${bin} liess sich nicht starten: ${error.message}`, { cause: error }));
    });
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });

/** Der vollstaendige Befehl fuer Fehlermeldungen. */
function commandLine(bin: string, args: string[]): string {
  return [bin, ...args].join(" ");
}

/** Die letzten Zeilen der Ausgabe; ffmpeg schreibt viel, das Ende zaehlt. */
function tail(text: string, lines = 12): string {
  return text.trim().split("\n").slice(-lines).join("\n");
}

export interface ProbeResult {
  width: number;
  height: number;
  fps: number;
  duration: number;
  codec: string;
  hasAudio: boolean;
}

/** "30000/1001" wird zu 29.97002997. Ungueltige Angaben ergeben 0. */
function parseFps(rFrameRate: string): number {
  const [numText, denText] = rFrameRate.split("/");
  const num = Number(numText);
  const den = Number(denText ?? "1");
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

/** Die Felder, die die festgelegten ffprobe-Abfragen liefern. */
interface ProbeJson {
  streams?: Array<{
    width?: number;
    height?: number;
    r_frame_rate?: string;
    codec_name?: string;
  }>;
  format?: { duration?: string };
}

/** Fuehrt eine ffprobe-Abfrage aus und liest ihr JSON. */
async function probeJson(args: string[], run: RunFn): Promise<ProbeJson> {
  const result = await run("ffprobe", args);
  if (result.code !== 0) {
    throw new Error(
      `ffprobe scheiterte (Exit ${result.code}): ${commandLine("ffprobe", args)}\n` +
      tail(result.stderr),
    );
  }
  try {
    return JSON.parse(result.stdout) as ProbeJson;
  } catch (error) {
    throw new Error(
      `ffprobe lieferte kein gueltiges JSON: ${commandLine("ffprobe", args)}\n` +
      tail(result.stdout),
      { cause: error },
    );
  }
}

/**
 * Liest Bildformat, Dauer und Tonspur einer Datei. Gelesen wird JSON, nicht
 * die Textausgabe: Textausgaben sind bruchanfaellig, JSON ist eindeutig.
 *
 * Die festgelegte Abfrage waehlt mit `-select_streams v:0` nur die Bildspur;
 * ob eine Tonspur da ist, beantwortet eine zweite kleine Abfrage im selben
 * JSON-Stil.
 */
export async function probe(file: string, run: RunFn = spawnRun): Promise<ProbeResult> {
  const video = await probeJson([
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,codec_name",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ], run);

  const stream = video.streams?.[0];
  if (stream === undefined) {
    throw new Error(`${file} enthaelt keine Bildspur`);
  }

  const audio = await probeJson([
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=codec_name",
    "-of", "json",
    file,
  ], run);

  const duration = Number(video.format?.duration ?? 0);
  return {
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps: parseFps(stream.r_frame_rate ?? "0/0"),
    duration: Number.isFinite(duration) ? duration : 0,
    codec: stream.codec_name ?? "unbekannt",
    hasAudio: (audio.streams?.length ?? 0) > 0,
  };
}

/**
 * Fuehrt ffmpeg aus und liefert die Fehlerausgabe zurueck.
 * ffmpeg schreibt seinen Fortschritt grundsaetzlich nach stderr, das ist kein
 * Fehler. Scheitert der Lauf, nennt der Fehler den Befehl und das Ende der
 * Ausgabe.
 */
export async function runFfmpeg(args: string[], run: RunFn = spawnRun): Promise<string> {
  const full = ["-hide_banner", "-nostdin", ...args];
  const result = await run("ffmpeg", full);
  if (result.code !== 0) {
    throw new Error(
      `ffmpeg scheiterte (Exit ${result.code}): ${commandLine("ffmpeg", full)}\n` +
      tail(result.stderr),
    );
  }
  return result.stderr;
}
