import type { TranscriptWord } from "./providers/transcript.js";
import type { Block } from "./types.js";

/**
 * Segmentierung: teilt die Woerter einer Quelle an Pausen in Bloecke. Die
 * Funktionen sind rein; nur `detectSilences` in silence.ts ruft ffmpeg.
 *
 * Die Werte (Zielgroesse, harte Grenzen, Pausenschwellen) stammen aus der
 * VideoPipeline und sind dort erprobt.
 */

/** Angestrebte Blocklaenge: ein bis drei Saetze (VideoPipeline-Wert). */
const TARGET_BLOCK = 12;
/** Harte Grenzen der Blocklaenge in Sekunden (VideoPipeline-Werte). */
const MIN_BLOCK = 3;
const MAX_BLOCK = 25;
/** Ab dieser Pausenlaenge ist eine Pause eine Blockgrenze (VideoPipeline-Wert). */
const PAUSE_MIN = 0.6;
/** Ab dieser Pausenlaenge gilt die Grenze als Kapitelwechsel (VideoPipeline-Wert). */
const CHAPTER_MIN = 1.5;
/** Stille nach einem Block; an einer Kapitelgrenze mehr (VideoPipeline-Werte). */
const PAUSE_DEFAULT = 0.35;
const PAUSE_CHAPTER = 0.7;
/** Nur Pausenreste laenger als das zaehlen als Pause im Block (VideoPipeline-Wert). */
const CLIP_MIN = 0.1;

/** Optionen der Segmentierung. */
export interface SegmentOptions {
  /** Kennung der Quelle, aus der die Bloecke stammen. */
  sourceId: string;
  /** Vorhandene Blockkennungen; die neuen zaehlen danach hoch. */
  existingIds: string[];
}

/** Eine Pause als Paar [start, end] in Sekunden. */
type Pause = [number, number];

const middle = ([start, end]: Pause): number => start + (end - start) / 2;
const length = ([start, end]: Pause): number => end - start;

/** Die Pause, deren Mitte der Zielgroesse am naechsten liegt. */
function closestToPause(pauses: Pause[], target: number): Pause | undefined {
  let best: Pause | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const pause of pauses) {
    const distance = Math.abs(middle(pause) - target);
    if (distance < bestDistance) {
      best = pause;
      bestDistance = distance;
    }
  }
  return best;
}

/** Die laengste Pause; bei Gleichstand gewinnt die erste. */
function longestPause(pauses: Pause[]): Pause | undefined {
  let best: Pause | undefined;
  for (const pause of pauses) {
    if (best === undefined || length(pause) > length(best)) best = pause;
  }
  return best;
}

/** Die erprobte Form einer Blockkennung: b plus mindestens drei Ziffern. */
const BLOCK_ID = /^b(\d{3,})$/;

/**
 * Die naechste freie Blockkennung: die hoechste vorhandene plus eins, sonst
 * "b001". Formen, die nicht dem erprobten Muster entsprechen, zaehlen nicht
 * mit.
 */
export function nextBlockId(existing: string[]): string {
  let highest = 0;
  for (const id of existing) {
    const match = BLOCK_ID.exec(id);
    if (match?.[1] === undefined) continue;
    const value = Number(match[1]);
    if (value > highest) highest = value;
  }
  return `b${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Teilt die Woerter einer Quelle in Bloecke.
 *
 * Die Grenze liegt bevorzugt in der Mitte einer Pause ab 0,6 s, nahe der
 * Zielgroesse von 12 s. Gibt es im Fenster 3 bis 25 s keine solche Pause,
 * gewinnt die groesste Pause im Fenster; gibt es gar keine, wird hart bei
 * 25 s geschnitten und ein Hinweis in `flags` abgelegt. Eine Pause ab 1,5 s
 * gilt als Kapitelgrenze und erhoeht `pause_after` des Blocks davor.
 *
 * Die Grenzen sind hart: kein Block dauert laenger als 25 s oder (ausser am
 * Ende) kuerzer als 3 s. `source_in` und `source_out` schliessen lueckenlos
 * aneinander an; der letzte Block endet am letzten Wort. `text` ist der
 * getrimmte Transkripttext der enthaltenen Woerter.
 */
export function buildBlocks(
  words: TranscriptWord[],
  silences: Pause[],
  opts: SegmentOptions,
): Block[] {
  const first = words[0];
  const last = words[words.length - 1];
  if (first === undefined || last === undefined) return [];

  const blocks: Block[] = [];
  // Etwas Vorlauf, damit das erste Wort nicht am Rand klebt (VideoPipeline).
  let start = Math.max(0, first.start - 0.2);
  let counter = Number(nextBlockId(opts.existingIds).slice(1));

  while (start < last.end - 0.05) {
    const windowStart = start + MIN_BLOCK;
    const windowEnd = Math.min(start + MAX_BLOCK, last.end);
    const target = start + TARGET_BLOCK;
    const flags: string[] = [];

    let boundary: number;
    let chapterBreak = false;

    if (last.end - start <= MAX_BLOCK) {
      // Der Rest passt in einen Block; als letzter darf er auch kuerzer als
      // drei Sekunden sein.
      boundary = last.end;
    } else {
      const inWindow = silences.filter((pause) => {
        const at = middle(pause);
        return at >= windowStart && at <= windowEnd;
      });
      const strong = inWindow.filter((pause) => length(pause) >= PAUSE_MIN);
      const chosen = closestToPause(strong, target) ?? longestPause(inWindow);
      if (chosen === undefined) {
        boundary = windowEnd;
        flags.push(`Harter Schnitt bei ${MAX_BLOCK} s: keine Pause im Fenster`);
      } else {
        boundary = middle(chosen);
        chapterBreak = length(chosen) >= CHAPTER_MIN;
      }
    }

    const isLast = boundary >= last.end - 0.001;
    const inRange = words.filter((word) => word.start >= start && word.start < boundary);
    const clipped: Pause[] = silences
      .map(([from, to]): Pause => [Math.max(from, start), Math.min(to, boundary)])
      .filter(([from, to]) => to - from > CLIP_MIN);

    blocks.push({
      id: `b${String(counter).padStart(3, "0")}`,
      kind: "take",
      source_id: opts.sourceId,
      source_in: Number(start.toFixed(3)),
      source_out: Number(boundary.toFixed(3)),
      silences: clipped,
      text: inRange.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim(),
      pause_after: isLast ? 0 : chapterBreak ? PAUSE_CHAPTER : PAUSE_DEFAULT,
      fit: "none",
      flags,
      overlays: [],
    });

    counter += 1;
    start = boundary;
  }

  return blocks;
}
