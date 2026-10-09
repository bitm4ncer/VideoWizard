import { describe, expect, it } from "vitest";
import type { TranscriptWord } from "../src/lib/providers/transcript.js";
import { buildBlocks, nextBlockId } from "../src/lib/segment.js";

/** Woerter der Laenge eine Sekunde von `from` bis `to`. */
function words(from: number, to: number): TranscriptWord[] {
  const result: TranscriptWord[] = [];
  for (let time = from; time < to; time += 1) {
    result.push({ start: time, end: time + 1, text: `w${time}` });
  }
  return result;
}

/** Woerter der Laenge eine Sekunde fuer jeden Bereich; dazwischen liegen Pausen. */
function wordsIn(segments: Array<[number, number]>): TranscriptWord[] {
  const result: TranscriptWord[] = [];
  for (const [from, to] of segments) {
    for (let time = from; time < to; time += 1) {
      result.push({ start: time, end: Math.min(time + 1, to), text: `w${time}` });
    }
  }
  return result;
}

/** Die Blocklaenge, gerundet auf Millisekunden wie source_in und source_out. */
function lengthOf(block: { source_in: number; source_out: number }): number {
  return Number((block.source_out - block.source_in).toFixed(3));
}

describe("buildBlocks", () => {
  it("schneidet bevorzugt an einer Pause ab 0,6 s", () => {
    // Die kurze Pause liegt naeher am Ziel, zaehlt aber nicht als Grenze.
    const blocks = buildBlocks(
      words(0, 40),
      [
        [11.5, 11.9],
        [15, 16],
      ],
      { sourceId: "s01", existingIds: [] },
    );

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0]!.source_out).toBe(15.5);
    expect(blocks[1]!.source_in).toBe(15.5);
  });

  it("waehlt unter mehreren Pausen ab 0,6 s die naechste zur Zielgroesse", () => {
    const blocks = buildBlocks(
      words(0, 40),
      [
        [7, 8.2],
        [13.5, 14.5],
      ],
      { sourceId: "s01", existingIds: [] },
    );

    expect(blocks[0]!.source_out).toBe(14);
  });

  it("haelt die harten Grenzen 3 bis 25 s ein", () => {
    const blocks = buildBlocks(
      words(0, 70),
      [
        [4, 4.8],
        [9, 9.8],
        [29, 29.8],
        [53, 53.8],
      ],
      { sourceId: "s01", existingIds: [] },
    );

    expect(blocks.map((block) => block.source_out)).toEqual([9.4, 29.4, 53.4, 70]);
    const lengths = blocks.map(lengthOf);
    expect(lengths).toEqual([9.4, 20, 24, 16.6]);
    for (const length of lengths) {
      expect(length).toBeLessThanOrEqual(25);
    }
    // Kuerzer als drei Sekunden darf nur der letzte Block sein.
    for (const length of lengths.slice(0, -1)) {
      expect(length).toBeGreaterThanOrEqual(3);
    }
  });

  it("laesst nur den letzten Block unter drei Sekunden zu", () => {
    const blocks = buildBlocks(words(0, 2), [], { sourceId: "s01", existingIds: [] });

    expect(blocks.length).toBe(1);
    expect(blocks[0]!.source_in).toBe(0);
    expect(blocks[0]!.source_out).toBe(2);
  });

  it("nimmt ohne Pause ab 0,6 s die groesste Pause im Fenster", () => {
    const blocks = buildBlocks(
      words(0, 40),
      [
        [6, 6.2],
        [20, 20.55],
      ],
      { sourceId: "s01", existingIds: [] },
    );

    expect(blocks[0]!.source_out).toBe(20.275);
  });

  it("schneidet ohne Pause im Fenster hart bei 25 s und setzt einen Hinweis", () => {
    const blocks = buildBlocks(words(0, 40), [], { sourceId: "s01", existingIds: [] });

    expect(blocks[0]!.source_out).toBe(25);
    expect(blocks[0]!.flags!.some((entry) => entry.includes("25"))).toBe(true);
    expect(blocks[0]!.flags!.some((entry) => entry.includes("keine Pause"))).toBe(true);
    expect(blocks[1]!.flags).toEqual([]);
    expect(blocks[1]!.source_out).toBe(40);
  });

  it("setzt 0,7 an einer Kapitelgrenze, 0,35 sonst und 0 im letzten Block", () => {
    const blocks = buildBlocks(
      words(0, 40),
      [
        [9, 11],
        [20, 21],
      ],
      { sourceId: "s01", existingIds: [] },
    );

    expect(blocks.map((block) => block.pause_after)).toEqual([0.7, 0.35, 0]);
  });

  it("deckt die Woerter lueckenlos ab und beschneidet die Pausen auf den Block", () => {
    const transcript = wordsIn([
      [0, 9],
      [11, 20],
      [21, 40],
    ]);
    const blocks = buildBlocks(transcript, [
      [9, 11],
      [20, 21],
    ], { sourceId: "s01", existingIds: [] });

    expect(blocks.map((block) => [block.source_in, block.source_out])).toEqual([
      [0, 10],
      [10, 20.5],
      [20.5, 40],
    ]);
    expect(blocks[0]!.silences).toEqual([[9, 10]]);
    expect(blocks[1]!.silences).toEqual([
      [10, 11],
      [20, 20.5],
    ]);
    expect(blocks[2]!.silences).toEqual([[20.5, 21]]);

    for (const word of transcript) {
      const found = blocks.find(
        (block) => block.source_in <= word.start && word.end <= block.source_out,
      );
      expect(found, `Wort ${word.text} nicht abgedeckt`).toBeDefined();
    }
  });

  it("wirft nicht, wenn ein Wort in einer Pause liegt", () => {
    const transcript: TranscriptWord[] = [
      ...wordsIn([[0, 9]]),
      { start: 9.4, end: 9.8, text: "im-pause" },
      ...wordsIn([[11, 40]]),
    ];

    const blocks = buildBlocks(transcript, [[9, 11]], { sourceId: "s01", existingIds: [] });

    expect(blocks[0]!.source_out).toBe(10);
    expect(blocks[0]!.text).toContain("im-pause");
  });

  it("vergibt Kennungen ab der hoechsten vorhandenen", () => {
    const blocks = buildBlocks(words(0, 30), [[9, 11]], {
      sourceId: "s01",
      existingIds: ["b004", "x1"],
    });

    expect(blocks.map((block) => block.id)).toEqual(["b005", "b006"]);
  });

  it("fuellt Art, Fit, Overlays, Quelle und den getrimmten Text", () => {
    const blocks = buildBlocks(
      [
        { start: 0, end: 1, text: "  Hallo " },
        { start: 1, end: 2, text: "Welt  " },
      ],
      [],
      { sourceId: "s07", existingIds: [] },
    );

    expect(blocks.length).toBe(1);
    const block = blocks[0]!;
    expect(block.kind).toBe("take");
    expect(block.fit).toBe("none");
    expect(block.overlays).toEqual([]);
    expect(block.source_id).toBe("s07");
    expect(block.text).toBe("Hallo Welt");
    expect(block.pause_after).toBe(0);
    expect(block.chapter).toBeUndefined();
  });

  it("liefert ohne Woerter keine Bloecke", () => {
    expect(buildBlocks([], [], { sourceId: "s01", existingIds: [] })).toEqual([]);
  });
});

describe("nextBlockId", () => {
  it("zaehlt von der hoechsten vorhandenen Kennung hoch", () => {
    expect(nextBlockId([])).toBe("b001");
    expect(nextBlockId(["b001", "b002"])).toBe("b003");
    expect(nextBlockId(["b007", "b003", "b005"])).toBe("b008");
    expect(nextBlockId(["b999"])).toBe("b1000");
  });

  it("ignoriert fremde Formen", () => {
    expect(nextBlockId(["x9", "take-1", "b", "b1", "b001x", "b00a"])).toBe("b001");
  });
});
