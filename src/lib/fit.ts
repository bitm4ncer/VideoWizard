import type { Block, Fit } from "./types.js";

/** Die letzten Sekundenbruchteile eines Blocks werden nie weggeschnitten */
export const TAIL_GUARD = 0.15;
/** Ab dieser Ueberlaenge greift kein automatischer Notbehelf mehr */
export const OVERFLOW_LIMIT = 1.25;
/** Langsamer als das wird das Bild nicht abgespielt */
export const MIN_SPEED = 0.9;

export interface FitResult {
  fit: Fit;
  /** Verhaeltnis von Stimmdauer zu Bilddauer */
  ratio: number;
  /** Bereiche der Quelle, die entfallen, absolute Zeiten */
  cuts: Array<[number, number]>;
  /** Effektives Blockende nach einer Kuerzung hinten */
  effectiveOut: number;
  /** 1 = normal, kleiner = verlangsamt */
  speed: number;
  /** Sekunden gehaltener Endframe */
  freeze: number;
  /** Laenge, die der Block im fertigen Video einnimmt */
  targetDuration: number;
}

/**
 * Blockende, bei dem nach Abzug der Schnitte genau die Zieldauer uebrig bleibt.
 * Reichen die Pausen nicht aus, landet das Ende vor ihnen. Die Schnitte
 * entfallen dann ersatzlos und duerfen nicht mitgerechnet werden.
 */
function keepUntil(from: number, cuts: Array<[number, number]>, target: number): number {
  let kept = 0;
  let cursor = from;
  for (const [start, end] of cuts) {
    const gap = start - cursor;
    if (kept + gap >= target) return cursor + (target - kept);
    kept += gap;
    cursor = Math.max(cursor, end);
  }
  return cursor + (target - kept);
}

/**
 * Bringt Bilddauer und Stimmdauer eines Blocks zur Deckung.
 * Regeln nach Spec 7. Bloecke der Art still folgen immer der Stimme.
 */
export function computeFit(block: Block, ttsDuration: number): FitResult {
  const targetDuration = ttsDuration + block.pause_after;

  if (block.kind !== "take") {
    return {
      fit: "none", ratio: 1, cuts: [], effectiveOut: block.source_out,
      speed: 1, freeze: 0, targetDuration,
    };
  }

  const videoDuration = block.source_out - block.source_in;
  const ratio = videoDuration > 0 ? targetDuration / videoDuration : Number.POSITIVE_INFINITY;

  if (ratio > OVERFLOW_LIMIT) {
    return {
      fit: "overflow", ratio, cuts: [], effectiveOut: block.source_out,
      speed: 1, freeze: 0, targetDuration,
    };
  }

  if (ratio >= 1) {
    const speed = Math.max(MIN_SPEED, videoDuration / targetDuration);
    const stretched = videoDuration / speed;
    return {
      fit: "hold", ratio, cuts: [], effectiveOut: block.source_out,
      speed, freeze: Math.max(0, targetDuration - stretched), targetDuration,
    };
  }

  // Kuerzen: zuerst die laengsten Pausen, danach hinten abschneiden
  let needed = videoDuration - targetDuration;
  const cutLimit = block.source_out - TAIL_GUARD;
  const usable = block.silences
    .map(([a, b]) => [Math.max(a, block.source_in), Math.min(b, cutLimit)] as [number, number])
    .filter(([a, b]) => b - a > 0.01)
    .sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));

  const chosen: Array<[number, number]> = [];
  for (const [from, to] of usable) {
    if (needed <= 0.001) break;
    const available = to - from;
    const take = Math.min(available, needed);
    // Teilschnitte nehmen das Ende der Pause, der Sprecheinsatz bleibt unberuehrt
    chosen.push([Number((to - take).toFixed(3)), Number(to.toFixed(3))]);
    needed -= take;
  }
  chosen.sort((x, y) => x[0] - y[0]);

  const effectiveOut = Number(
    Math.min(block.source_out, keepUntil(block.source_in, chosen, targetDuration)).toFixed(3),
  );
  // Was hinter dem Blockende liegt, schneidet nichts mehr weg
  const cuts = chosen
    .map(([a, b]) => [a, Math.min(b, effectiveOut)] as [number, number])
    .filter(([a, b]) => b - a > 0.001);

  return { fit: "trim", ratio, cuts, effectiveOut, speed: 1, freeze: 0, targetDuration };
}
