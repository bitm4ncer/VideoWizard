import { describe, expect, it } from "vitest";
import { buildAss, planCaptions, toCues } from "../src/lib/captions.js";
import type { TranscriptWord } from "../src/lib/providers/transcript.js";
import type { VideoSegment } from "../src/lib/renderplan.js";

/** Ein Bildabschnitt; Abweichungen kommen ueber over. */
function segment(over: Partial<VideoSegment> = {}): VideoSegment {
  return {
    blockId: "b001",
    kind: "take",
    sourceId: "s01",
    sourceFile: "sources/s01/raw.mp4",
    ranges: [[0, 10]],
    freezeAt: null,
    speed: 1,
    freeze: 0,
    duration: 10,
    ...over,
  };
}

describe("toCues", () => {
  it("fasst Woerter zu Zeilen von hoechstens 32 Zeichen und 2 s", () => {
    const words: TranscriptWord[] = [
      { start: 0, end: 0.4, text: "Hallo" },
      { start: 0.5, end: 0.9, text: "du" },
      { start: 1.0, end: 1.4, text: "wie" },
      { start: 1.5, end: 1.9, text: "geht" },
      { start: 2.0, end: 2.6, text: "es" },
      { start: 2.7, end: 3.0, text: "ist" },
      { start: 3.1, end: 3.5, text: "abcdefghijklmnopqrstuvwxy" },
      { start: 3.6, end: 4.0, text: "noch" },
      { start: 4.1, end: 4.2, text: " " },
    ];

    // "es" beginnt 2,6 s nach dem Start der ersten Zeile und bricht sie;
    // "abcdefghijklmnopqrstuvwxy" fuellt die zweite Zeile auf genau 32 Zeichen;
    // "noch" sprengt die Laengengrenze, der leere Wortrest entfaellt.
    expect(toCues(words, 0)).toEqual([
      { start: 0, end: 1.9, text: "Hallo du wie geht" },
      { start: 2, end: 3.5, text: "es ist abcdefghijklmnopqrstuvwxy" },
      { start: 3.6, end: 4, text: "noch" },
    ]);
  });

  it("verschiebt jede Zeile um den Versatz", () => {
    const words: TranscriptWord[] = [
      { start: 1, end: 1.5, text: "Hallo" },
      { start: 1.6, end: 2.0, text: "Welt" },
    ];

    expect(toCues(words, 10)).toEqual([
      { start: 11, end: 12, text: "Hallo Welt" },
    ]);
  });

  it("erzeugt aus leeren Woertern keine Zeilen", () => {
    expect(toCues([{ start: 0, end: 1, text: "  " }], 0)).toEqual([]);
  });
});

describe("planCaptions", () => {
  it("legt die Cues der Bloecke hintereinander auf die Ausgabeachse", () => {
    const video: VideoSegment[] = [
      segment({ blockId: "b001", ranges: [[0, 4]], duration: 4 }),
      segment({ blockId: "b002", kind: "still", ranges: [], duration: 2 }),
      segment({ blockId: "b003", sourceId: "s02", ranges: [[0, 4]], duration: 4 }),
    ];
    const words = new Map<string, TranscriptWord[]>([
      ["s01", [{ start: 1, end: 2, text: "eins" }]],
      ["s02", [{ start: 1, end: 2, text: "zwei" }]],
    ]);

    // Der still-Block traegt keine Woerter, seine Dauer zaehlt aber fuer den
    // Versatz des naechsten Blocks.
    expect(planCaptions(video, words)).toEqual([
      { start: 1, end: 2, text: "eins" },
      { start: 7, end: 8, text: "zwei" },
    ]);
  });

  it("laesst Bloecke ohne Wortzeiten ohne Cues", () => {
    const video: VideoSegment[] = [segment({ ranges: [[0, 4]], duration: 4 })];

    expect(planCaptions(video, new Map())).toEqual([]);
  });
});

describe("buildAss", () => {
  it("baut Kopf, Stil und Ereignisse mit maskiertem Text", () => {
    const ass = buildAss([
      { start: 1.25, end: 2.5, text: "Hallo {Welt}\nneu" },
      { start: 65.12, end: 66, text: "Zweite Zeile" },
    ], { width: 1080, height: 1920 });

    expect(ass).toContain("[Script Info]");
    expect(ass).toMatch(/Safe-Zone/);
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("[V4+ Styles]");

    // Schriftgroesse round(1920 * 0.045) = 86, unterer Rand round(1920 * 0.12) = 230.
    const stil = ass.split("\n").find((line) => line.startsWith("Style: Default,"));
    expect(stil).toBeDefined();
    expect(stil).toContain("Default,Arial,86");
    expect(stil).toContain(",2,0,0,230,1");

    expect(ass).toContain(
      "Dialogue: 0,0:00:01.25,0:00:02.50,Default,,0,0,0,,Hallo (Welt)\\Nneu",
    );
    expect(ass).toContain(
      "Dialogue: 0,0:01:05.12,0:01:06.00,Default,,0,0,0,,Zweite Zeile",
    );
  });
});
