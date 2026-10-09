import { computeFit } from "./fit.js";
import { blockStatus } from "./plan.js";
import type { BlockKind, Format, Music, Outro, Project } from "./types.js";

/** Ein Bildabschnitt des Render-Plans: was geschnitten und gehalten wird. */
export interface VideoSegment {
  blockId: string;
  kind: BlockKind;
  /** Pfad relativ zum Projektordner. */
  sourceFile: string;
  /** Verbleibende Bereiche der Quelle, absolute Zeiten. */
  ranges: Array<[number, number]>;
  /** Nur bei kind === "still": Zeitpunkt des gehaltenen Frames. */
  freezeAt: number | null;
  speed: number;
  freeze: number;
  duration: number;
}

/** Ein Tonabschnitt des Render-Plans: die Stimme eines Blocks samt Pause. */
export interface AudioSegment {
  blockId: string;
  /** Pfad relativ zum Projektordner. */
  file: string;
  duration: number;
  pauseAfter: number;
}

/** Die ausfuehrbare Fassung der Projektdatei fuer den Render. */
export interface RenderPlan {
  format: Format;
  video: VideoSegment[];
  audio: AudioSegment[];
  music: Music | null;
  outro: Outro | null;
  warnings: string[];
}

/** Aus den Schnitten die verbleibenden Bereiche der Quelle machen. */
function remainingRanges(
  from: number, to: number, cuts: Array<[number, number]>,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let cursor = from;
  for (const [a, b] of cuts) {
    if (a > cursor) ranges.push([Number(cursor.toFixed(3)), Number(a.toFixed(3))]);
    cursor = Math.max(cursor, b);
  }
  if (to > cursor) ranges.push([Number(cursor.toFixed(3)), Number(to.toFixed(3))]);
  return ranges.filter(([a, b]) => b - a > 0.001);
}

/**
 * Uebersetzt die Projektdatei in einen ausfuehrbaren Render-Plan.
 * Bloecke ohne Text oder Ton lassen den Lauf abbrechen, ausser sie werden
 * ausdruecklich erlaubt; dann fallen sie mit einer Warnung heraus. Ueberlaenge
 * bricht ebenso ab, ausser sie wird ausdruecklich erlaubt. Reine Funktion
 * ohne Dateizugriff: die Existenz von Musik und Outro prueft erst der Render.
 */
export function buildRenderPlan(
  project: Project,
  opts: { allowOverflow?: boolean; allowIncomplete?: boolean } = {},
): RenderPlan {
  const warnings: string[] = [];
  const video: VideoSegment[] = [];
  const audio: AudioSegment[] = [];
  const overflowing: string[] = [];
  const incomplete: string[] = [];
  const sourceById = new Map(project.sources.map((source) => [source.id, source]));

  for (const block of project.blocks) {
    const tts = block.tts;
    if (blockStatus(block) !== "ok" || tts === undefined) {
      incomplete.push(block.id);
      if (opts.allowIncomplete !== true) continue;
      warnings.push(
        `Block ${block.id} ist noch nicht fertig (Text oder Ton fehlt) und wird ausgelassen.`,
      );
      continue;
    }

    const source = sourceById.get(block.source_id);
    if (source === undefined) {
      throw new Error(`Block ${block.id} verweist auf die unbekannte Quelle ${block.source_id}.`);
    }

    const fit = computeFit(block, tts.duration);
    if (fit.fit === "overflow") {
      overflowing.push(block.id);
      if (opts.allowOverflow !== true) continue;
      warnings.push(`Block ${block.id} hat Ueberlaenge und wird trotzdem gerendert.`);
    }

    video.push({
      blockId: block.id,
      kind: block.kind,
      sourceFile: source.file,
      ranges: block.kind === "take"
        ? remainingRanges(block.source_in, fit.effectiveOut, fit.cuts)
        : [],
      freezeAt: block.kind === "still" ? (block.freeze_at ?? block.source_in) : null,
      // computeFit rundet nicht auf drei Stellen; die Zwischenformate tun es.
      speed: Number(fit.speed.toFixed(3)),
      freeze: Number(fit.freeze.toFixed(3)),
      duration: Number(fit.targetDuration.toFixed(3)),
    });
    audio.push({
      blockId: block.id,
      file: tts.file,
      duration: tts.duration,
      pauseAfter: block.pause_after,
    });
  }

  if (incomplete.length > 0 && opts.allowIncomplete !== true) {
    throw new Error(
      `Unfertige Bloecke: ${incomplete.join(", ")}. ` +
      "Vertone die Bloecke zuerst oder rendere bewusst ohne sie. " +
      "Zum bewussten Ignorieren allowIncomplete setzen.",
    );
  }

  if (overflowing.length > 0 && opts.allowOverflow !== true) {
    throw new Error(
      `Ueberlaenge bei: ${overflowing.join(", ")}. ` +
      "Kuerze das Skript oder erweitere die Blockgrenze. " +
      "Zum bewussten Ignorieren allowOverflow setzen.",
    );
  }

  return {
    format: project.format,
    video,
    audio,
    music: project.audio?.music ?? null,
    outro: project.outro ?? null,
    warnings,
  };
}
