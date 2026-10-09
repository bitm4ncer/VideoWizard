import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { probe, runFfmpeg, spawnRun, type RunFn } from "./ffmpeg.js";

/**
 * Die Messnachschau nach dem Render: `vz review` prueft die neueste Ausgabe
 * gegen den Plan und schreibt `review.md` daneben. Alles hier ist Messung und
 * Bericht; nichts blockiert einen Lauf.
 */

/** Vorgabe der Mischung, wenn das Projekt keinen Wert setzt; wie im Render. */
export const DEFAULT_MASTER_LUFS = -14;

/** Die Toleranzen der Nachschau; sie stehen so auch im Bericht. */
const DURATION_TOLERANCE = 0.5;
const LOUDNESS_TOLERANCE = 1;

/** Bildmessung: schwarze Fenster ab 0,5 s, Standbilder ab 2 s. */
const PICTURE_FILTER = "blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=2";

/** Die gemessenen Werte einer Ausgabe. */
export interface ReviewMeasurements {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  blackRanges: Array<[number, number]>;
  freezeRanges: Array<[number, number]>;
  integratedLufs: number | null;
  captionsPresent: boolean;
}

/** Nur ENOENT gilt als "fehlt"; andere Fehler reicht der Aufrufer weiter. */
async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Liest Zeitbereiche aus der ffmpeg-Ausgabe, etwa `black_start`/`black_end`
 * und `freeze_start`/`freeze_end`. Die Suche ist tolerant: fremde und kaputte
 * Zeilen werden uebersprungen, ein Anfang ohne Ende verfaellt. Geworfen wird
 * nie; fehlt alles, bleibt die Liste leer.
 */
export function parseRanges(
  text: string,
  startKey: string,
  endKey: string,
): Array<[number, number]> {
  const number = String.raw`(-?\d+(?:\.\d+)?)`;
  const pattern = new RegExp(
    `${escapeRegExp(startKey)}\\s*:\\s*${number}|${escapeRegExp(endKey)}\\s*:\\s*${number}`,
    "g",
  );
  const ranges: Array<[number, number]> = [];
  let pending: number | null = null;
  for (const match of text.matchAll(pattern)) {
    const start = match[1];
    const end = match[2];
    if (start !== undefined) {
      pending = Number(start);
    } else if (end !== undefined && pending !== null) {
      ranges.push([pending, Number(end)]);
      pending = null;
    }
  }
  return ranges;
}

/**
 * Liest die integrierte Lautheit aus der ebur128-Zusammenfassung. ffmpeg
 * schreibt waehrend des Laufs Fortschrittszeilen und am Ende die
 * Zusammenfassung; der letzte Treffer ist der gueltige Wert. Fehlt jede
 * Zeile, gibt es null.
 */
export function parseLoudness(stderr: string): number | null {
  const pattern = /\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g;
  let found: number | null = null;
  for (const match of stderr.matchAll(pattern)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) found = value;
  }
  return found;
}

/** Sonderdateien im Ausgabeordner; sie sind keine Ausgabe und zaehlen nie. */
const SPECIAL_FILES = new Set(["captions.ass", "project.snapshot.json"]);

/** Die neueste Ausgabedatei nach Zeitstempel; ohne Kandidaten null. */
export function latestOutput(files: Array<{ name: string; mtimeMs: number }>): string | null {
  let newest: { name: string; mtimeMs: number } | null = null;
  for (const file of files) {
    if (SPECIAL_FILES.has(file.name)) continue;
    if (newest === null || file.mtimeMs > newest.mtimeMs) newest = file;
  }
  return newest?.name ?? null;
}

/**
 * Misst eine Ausgabe: Format und Dauer per ffprobe, schwarze und stehende
 * Fenster per ffmpeg, die integrierte Lautheit per ebur128. `captionsExpected`
 * sagt, ob Untertitel zum Soll gehoeren; nur dann wird `captions.ass` neben
 * der Ausgabe geprueft. Ohne Erwartung bleibt nichts zu bemaengeln und
 * `captionsPresent` gilt als erfuellt.
 */
export async function analyzeOutput(
  output: string,
  opts: { captionsExpected: boolean },
  run: RunFn = spawnRun,
): Promise<ReviewMeasurements> {
  const probed = await probe(output, run);
  const picture = await runFfmpeg([
    "-i", output,
    "-vf", PICTURE_FILTER,
    "-an", "-f", "null", "-",
  ], run);
  const loudness = await runFfmpeg([
    "-i", output,
    "-af", "ebur128",
    "-f", "null", "-",
  ], run);
  const captionsPresent = opts.captionsExpected === true
    ? await fileExists(join(dirname(output), "captions.ass"))
    : true;

  return {
    duration: probed.duration,
    width: probed.width,
    height: probed.height,
    fps: probed.fps,
    hasAudio: probed.hasAudio,
    blackRanges: parseRanges(picture, "black_start", "black_end"),
    freezeRanges: parseRanges(picture, "freeze_start", "freeze_end"),
    integratedLufs: parseLoudness(loudness),
    captionsPresent,
  };
}

/** Sekunden mit zwei Nachkommastellen, wie die uebrigen Messwerte. */
function seconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

/**
 * Die Befunde zu einer Messung: Dauerabweichung ueber 0,5 s, Lautheit
 * ausserhalb 1 LU, jedes Schwarzfenster und fehlende Untertitel. Eine nicht
 * messbare Lautheit ist kein Befund; der Bericht weist sie als solche aus.
 */
export function findingsFor(
  m: ReviewMeasurements,
  plannedDuration: number,
  masterLufs: number,
): string[] {
  const findings: string[] = [];
  const deviation = m.duration - plannedDuration;
  if (Math.abs(deviation) > DURATION_TOLERANCE) {
    findings.push(
      `Dauer weicht ab: ${seconds(m.duration)} gemessen, ${seconds(plannedDuration)} geplant ` +
      `(Abweichung ${seconds(Math.abs(deviation))}, Toleranz ${seconds(DURATION_TOLERANCE)}).`,
    );
  }
  if (m.integratedLufs !== null &&
      Math.abs(m.integratedLufs - masterLufs) > LOUDNESS_TOLERANCE) {
    findings.push(
      `Lautheit weicht ab: ${m.integratedLufs.toFixed(1)} LUFS gemessen, ` +
      `${masterLufs} LUFS geplant (Toleranz ${LOUDNESS_TOLERANCE} LU).`,
    );
  }
  for (const [start, end] of m.blackRanges) {
    findings.push(
      `Schwarzfenster: ${seconds(start)} bis ${seconds(end)} (${seconds(end - start)}).`,
    );
  }
  if (!m.captionsPresent) {
    findings.push("Untertitel fehlen: captions.ass liegt nicht neben der Ausgabe.");
  }
  return findings;
}

/** Zeitbereiche als lesbare Liste; ohne Bereiche steht "keine". */
function rangeList(ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return "keine";
  return ranges
    .map(([start, end]) => `${seconds(start)} bis ${seconds(end)} (${seconds(end - start)})`)
    .join("; ");
}

/**
 * Das Messprotokoll als Markdown: Messwerte, Toleranzen, Befunde und Datum.
 * Deutsch, wie die uebrigen Berichte des Projekts; die Werte stammen alle aus
 * einer Messung, nichts ist geschaetzt.
 */
export function renderReviewMarkdown(
  m: ReviewMeasurements,
  plannedDuration: number,
  masterLufs: number,
  findings: string[],
  date: string,
): string {
  const loudness = m.integratedLufs === null
    ? "nicht messbar"
    : `${m.integratedLufs.toFixed(1)} LUFS`;
  return [
    "# Review: Messnachschau",
    "",
    `*Datum: ${date}*`,
    "",
    "## Messwerte",
    "",
    `- Dauer: ${seconds(m.duration)} (geplant ${seconds(plannedDuration)}, ` +
    `Toleranz ${seconds(DURATION_TOLERANCE)})`,
    `- Format: ${m.width}x${m.height}, ${m.fps} fps`,
    `- Tonspur: ${m.hasAudio ? "vorhanden" : "fehlt"}`,
    `- Lautheit: ${loudness} (Soll ${masterLufs} LUFS, Toleranz ${LOUDNESS_TOLERANCE} LU)`,
    `- Schwarzfenster: ${rangeList(m.blackRanges)}`,
    `- Standbildfenster: ${rangeList(m.freezeRanges)}`,
    `- Untertitel: ${m.captionsPresent ? "vorhanden (captions.ass)" : "fehlen (captions.ass)"}`,
    "",
    "## Befunde",
    "",
    ...(findings.length === 0 ? ["Keine Befunde."] : findings.map((finding) => `- ${finding}`)),
    "",
    "## Toleranzen",
    "",
    `- Dauer: ${seconds(DURATION_TOLERANCE)} gegen die Summe der Blockdauern aus dem Renderplan`,
    `- Lautheit: ${LOUDNESS_TOLERANCE} LU um ${masterLufs} LUFS`,
    "- Schwarzfenster: gemeldet ab 0.5 s Dauer (blackdetect, pix_th 0.10)",
    "- Standbildfenster: gemeldet ab 2 s Dauer (freezedetect, -60 dB)",
    "",
  ].join("\n");
}
