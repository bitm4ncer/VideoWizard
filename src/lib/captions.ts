import { mapWordsToOutput, type VideoSegment } from "./renderplan.js";
import type { TranscriptWord } from "./providers/transcript.js";

/** Eine fertige Untertitelzeile mit Zeiten auf der Ausgabeachse. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Die bindenden Zeilenregeln aus dem Brief: 32 Zeichen und 2 s je Zeile. */
const MAX_CHARS = 32;
const MAX_SECONDS = 2;

/**
 * Fasst Woerter zu Untertitelzeilen: Eine Zeile waechst, solange sie zusammen
 * hoechstens maxChars Zeichen und hoechstens maxSeconds Sekunden umfasst; sonst
 * beginnt eine neue Zeile. Die Woerter liegen bereits auf der Ausgabeachse,
 * `offset` verschiebt die fertigen Zeilen um den Blockversatz. Leere Woerter
 * und leere Zeilen entfallen.
 */
export function toCues(
  words: TranscriptWord[],
  offset: number,
  opts: { maxChars?: number; maxSeconds?: number } = {},
): Cue[] {
  const maxChars = opts.maxChars ?? MAX_CHARS;
  const maxSeconds = opts.maxSeconds ?? MAX_SECONDS;
  const cues: Cue[] = [];
  let lineStart = 0;
  let lineEnd = 0;
  let lineText = "";

  const flush = (): void => {
    if (lineText === "") return;
    cues.push({
      start: Number((lineStart + offset).toFixed(3)),
      end: Number((lineEnd + offset).toFixed(3)),
      text: lineText,
    });
  };

  for (const word of words) {
    const text = word.text.trim();
    if (text === "") continue;
    const candidate = lineText === "" ? text : `${lineText} ${text}`;
    const fits = lineText !== "" && candidate.length <= maxChars &&
      word.end - lineStart <= maxSeconds;
    if (fits) {
      lineText = candidate;
      lineEnd = word.end;
    } else {
      flush();
      lineStart = word.start;
      lineEnd = word.end;
      lineText = text;
    }
  }
  flush();
  return cues;
}

/**
 * Alle Cues des Render-Plans auf der Ausgabeachse: Die Bloecke laufen in ihrer
 * Reihenfolge hintereinander, der Versatz ist die Summe der Dauern davor.
 * Nur take-Bloecke tragen Woerter; eine Quelle ohne Wortdatei bleibt ohne Cues.
 */
export function planCaptions(
  video: VideoSegment[],
  wordsBySource: ReadonlyMap<string, TranscriptWord[]>,
): Cue[] {
  const cues: Cue[] = [];
  let offset = 0;
  for (const segment of video) {
    if (segment.kind === "take") {
      const words = wordsBySource.get(segment.sourceId);
      if (words !== undefined && words.length > 0) {
        cues.push(...toCues(mapWordsToOutput(segment, words), offset));
      }
    }
    offset = Number((offset + segment.duration).toFixed(3));
  }
  return cues;
}

/** Eine ASS-Zeit als h:mm:ss.cc, wie der Standard sie liest. */
function assTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100));
  const centis = total % 100;
  const secs = Math.floor(total / 100) % 60;
  const mins = Math.floor(total / 6000) % 60;
  const hours = Math.floor(total / 360000);
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${hours}:${two(mins)}:${two(secs)}.${two(centis)}`;
}

/**
 * Text fuer eine ASS-Zeile entschaerfen: `{` und `}` wuerden eine
 * Uebersteuerung oeffnen und werden zu Klammern; ein Umbruch im Text wird `\N`.
 */
function assText(text: string): string {
  return text
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r\n|\r|\n/g, "\\N");
}

/**
 * Baut die ASS-Datei: Kopf mit Aufloesung, ein Stil `Default` und je Cue eine
 * Dialogue-Zeile. Schriftgroesse und unterer Rand sind Richtwerte aus der
 * Safe-Zone, keine Messwerte; der Kopf sagt das.
 */
export function buildAss(
  cues: Cue[],
  opts: { width: number; height: number },
): string {
  const fontsize = Math.round(opts.height * 0.045);
  const marginV = Math.round(opts.height * 0.12);
  const lines: string[] = [
    "[Script Info]",
    "; Stilwerte sind Richtwerte aus der Safe-Zone, keine Messwerte.",
    "; Schriftgroesse = Hoehe * 0.045, Rand unten = Hoehe * 0.12.",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${opts.width}`,
    `PlayResY: ${opts.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Als Schrift Arial: plattformuebliche Vorgabe, ersetzbar im Rezept.
    `Style: Default,Arial,${fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,` +
      `0,0,0,0,100,100,0,0,1,3,0,2,0,0,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const cue of cues) {
    lines.push(
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${assText(cue.text)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
