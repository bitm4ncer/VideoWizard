import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { probe, probeDuration, runFfmpeg, spawnRun, type RunFn } from "./ffmpeg.js";
import { DEFAULT_CROSSFADE } from "./renderplan.js";
import type { Outro } from "./types.js";

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

/**
 * Wie das konfigurierte Outro in die geplante Dauer eingegangen ist. Fehlt
 * das Outro oder ist es nicht messbar, bleibt es draussen; der Text sagt das
 * in Bericht und Befund.
 */
export interface OutroNote {
  /** true: die gemessene Outrodauer steckt in der geplanten Dauer. */
  included: boolean;
  /** Ein Satz fuer Bericht und Befund. */
  text: string;
}

/** Was der Aufrufer weiss und die Messung allein nicht hergibt. */
export interface ReviewOptions {
  /** Untertitel waren fuer diesen Lauf erwartet (--captions). */
  captionsExpected?: boolean;
  /** Wie das Outro in die geplante Dauer einging; null ohne Outro. */
  outro?: OutroNote | null;
}

/** Die geplante Dauer eines Renders samt Hinweis zum Outro. */
export interface PlannedDuration {
  seconds: number;
  outro: OutroNote | null;
}

/**
 * Der Teil des Renderplans, der in die geplante Dauer eingeht; bewusst
 * schmal, damit Tests ihn ohne den ganzen Plan bauen koennen.
 */
export interface PlannedDurationPlan {
  video: Array<{ duration: number }>;
  outro: Outro | null;
}

/** Sekunden mit zwei Nachkommastellen, wie die uebrigen Messwerte. */
function seconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

/**
 * Die geplante Dauer eines Renders: die Summe der Blockdauern plus die
 * gemessene Outrodauer minus die Ueberblendung, dieselbe Rechnung wie beim
 * Anhaengen des Outros in `src/steps/render.ts`. Ist das Outro konfiguriert,
 * aber fehlt die Datei oder ist sie nicht messbar, bleibt es draussen und
 * der Hinweis sagt das.
 */
export async function plannedDurationOf(
  plan: PlannedDurationPlan,
  projectDir: string,
  run?: RunFn,
): Promise<PlannedDuration> {
  const blockSeconds = plan.video.reduce((sum, segment) => sum + segment.duration, 0);
  const outro = plan.outro;
  if (outro === null) return { seconds: blockSeconds, outro: null };

  const crossfade = outro.crossfade ?? DEFAULT_CROSSFADE;
  try {
    const duration = await probeDuration(resolve(projectDir, outro.file), run);
    return {
      seconds: blockSeconds + Math.max(0, duration - crossfade),
      outro: {
        included: true,
        text:
          `Outro eingerechnet: ${seconds(duration)} minus ` +
          `${seconds(crossfade)} Ueberblendung.`,
      },
    };
  } catch {
    return {
      seconds: blockSeconds,
      outro: {
        included: false,
        text:
          `Outro nicht eingerechnet: ${outro.file} fehlt oder ist ` +
          "nicht messbar.",
      },
    };
  }
}

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
 * Fenster per ffmpeg, die integrierte Lautheit per ebur128, dazu die
 * Anwesenheit von `captions.ass` neben der Ausgabe. Untertitel werden immer
 * gemessen; ob fehlende ein Befund sind, entscheidet `findingsFor` ueber
 * `captionsExpected`.
 */
export async function analyzeOutput(
  output: string,
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
  const captionsPresent = await fileExists(join(dirname(output), "captions.ass"));

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

/**
 * Die Befunde zu einer Messung: Dauerabweichung ueber 0,5 s, Lautheit
 * ausserhalb 1 LU, jedes Schwarzfenster und fehlende Untertitel, letztere
 * nur wenn sie ausdruecklich erwartet waren (--captions). Ist ein
 * konfiguriertes Outro nicht in die geplante Dauer eingegangen, sagt der
 * Dauerbefund das. Eine nicht messbare Lautheit ist kein Befund; der Bericht
 * weist sie als solche aus.
 */
export function findingsFor(
  m: ReviewMeasurements,
  plannedDuration: number,
  masterLufs: number,
  opts: ReviewOptions = {},
): string[] {
  const findings: string[] = [];
  const outro = opts.outro ?? null;
  const deviation = m.duration - plannedDuration;
  if (Math.abs(deviation) > DURATION_TOLERANCE) {
    const excluded = outro !== null && !outro.included ? ` ${outro.text}` : "";
    findings.push(
      `Dauer weicht ab: ${seconds(m.duration)} gemessen, ${seconds(plannedDuration)} geplant ` +
      `(Abweichung ${seconds(Math.abs(deviation))}, Toleranz ${seconds(DURATION_TOLERANCE)}).` +
      excluded,
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
  if (opts.captionsExpected === true && !m.captionsPresent) {
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
 * einer Messung, nichts ist geschaetzt. Die Untertitel stehen immer als
 * Messung im Bericht; erwartet sind sie nur mit `captionsExpected`. Ein
 * konfiguriertes Outro wird als eingerechnet oder nicht eingerechnet
 * ausgewiesen.
 */
export function renderReviewMarkdown(
  m: ReviewMeasurements,
  plannedDuration: number,
  masterLufs: number,
  findings: string[],
  date: string,
  opts: ReviewOptions = {},
): string {
  const outro = opts.outro ?? null;
  const loudness = m.integratedLufs === null
    ? "nicht messbar"
    : `${m.integratedLufs.toFixed(1)} LUFS`;
  const captions = m.captionsPresent
    ? "vorhanden (captions.ass)"
    : "fehlen (captions.ass)";
  const captionsExpected = opts.captionsExpected === true ? "erwartet" : "nicht erwartet";
  const durationSource = outro === null
    ? "gegen die Summe der Blockdauern aus dem Renderplan"
    : outro.included
      ? "gegen die Summe der Blockdauern plus Outro minus Ueberblendung aus dem Renderplan"
      : "gegen die Summe der Blockdauern aus dem Renderplan; " +
        "das konfigurierte Outro ist nicht eingerechnet";
  return [
    "# Review: Messnachschau",
    "",
    `*Datum: ${date}*`,
    "",
    "## Messwerte",
    "",
    `- Dauer: ${seconds(m.duration)} (geplant ${seconds(plannedDuration)}, ` +
    `Toleranz ${seconds(DURATION_TOLERANCE)})`,
    ...(outro === null ? [] : [`- ${outro.text}`]),
    `- Format: ${m.width}x${m.height}, ${m.fps} fps`,
    `- Tonspur: ${m.hasAudio ? "vorhanden" : "fehlt"}`,
    `- Lautheit: ${loudness} (Soll ${masterLufs} LUFS, Toleranz ${LOUDNESS_TOLERANCE} LU)`,
    `- Schwarzfenster: ${rangeList(m.blackRanges)}`,
    `- Standbildfenster: ${rangeList(m.freezeRanges)}`,
    `- Untertitel: ${captions}, ${captionsExpected}`,
    "",
    "## Befunde",
    "",
    ...(findings.length === 0 ? ["Keine Befunde."] : findings.map((finding) => `- ${finding}`)),
    "",
    "## Toleranzen",
    "",
    `- Dauer: ${seconds(DURATION_TOLERANCE)} ${durationSource}`,
    `- Lautheit: ${LOUDNESS_TOLERANCE} LU um ${masterLufs} LUFS`,
    "- Schwarzfenster: gemeldet ab 0.5 s Dauer (blackdetect, pix_th 0.10)",
    "- Standbildfenster: gemeldet ab 2 s Dauer (freezedetect, -60 dB)",
    "",
  ].join("\n");
}
