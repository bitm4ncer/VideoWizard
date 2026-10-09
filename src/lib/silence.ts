import { runFfmpeg, type RunFn } from "./ffmpeg.js";

/**
 * Pausenerkennung: liest die `silencedetect`-Ausgabe von ffmpeg und findet
 * die Pausen einer Tonspur. Filter und Schwelle sind die erprobten Werte der
 * VideoPipeline: `noise=-32dB:d=0.35`.
 */

/** Einhakbare Abhaengigkeiten; im Test wird `run` ersetzt. */
export interface SilenceDeps {
  run?: RunFn;
}

/** Der erprobte Filter aus der VideoPipeline. */
const SILENCE_FILTER = "silencedetect=noise=-32dB:d=0.35";

const START = /silence_start:\s*(-?\d+(?:\.\d+)?)/;
const END = /silence_end:\s*(-?\d+(?:\.\d+)?)/;

/**
 * Liest die Pausenpaare aus der Fehlerausgabe von ffmpeg. Erwartet wird ein
 * `silence_start` gefolgt von einem `silence_end`; ein Start ohne Ende am
 * Protokollende entfaellt. Die Werte sind Sekunden mit Dezimalpunkt und
 * werden bei 0 begrenzt.
 */
export function parseSilences(log: string): Array<[number, number]> {
  const silences: Array<[number, number]> = [];
  let open: number | null = null;

  for (const line of log.split("\n")) {
    const start = START.exec(line);
    if (start?.[1] !== undefined) {
      open = Math.max(0, Number(start[1]));
      continue;
    }
    const end = END.exec(line);
    if (end?.[1] !== undefined && open !== null) {
      silences.push([open, Math.max(0, Number(end[1]))]);
      open = null;
    }
  }

  return silences;
}

/**
 * Laesst ffmpeg die Pausen einer Tonspur finden. `silencedetect` schreibt
 * seinen Bericht nach stderr; genau den liest der Aufruf zurueck.
 */
export async function detectSilences(
  audioFile: string,
  deps: SilenceDeps = {},
): Promise<Array<[number, number]>> {
  const stderr = await runFfmpeg(
    [
      "-i", audioFile,
      "-af", SILENCE_FILTER,
      "-f", "null", "-",
    ],
    deps.run,
  );
  return parseSilences(stderr);
}
