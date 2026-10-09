import { describe, expect, it } from "vitest";
import { ttsHash } from "../src/lib/hash.js";
import { CURRENT_SCHEMA } from "../src/lib/project.js";
import { addBlock, blockById, blockStatus, moveBlock, removeBlock, sourceById } from "../src/lib/plan.js";
import type { Block, Project, Source } from "../src/lib/types.js";

/** Ein Block mit allen Pflichtfeldern; Abweichungen kommen ueber over. */
function block(over: Partial<Block> = {}): Block {
  return {
    id: "b001",
    kind: "take",
    source_id: "s01",
    source_in: 0,
    source_out: 10,
    silences: [],
    pause_after: 0.35,
    fit: "none",
    overlays: [],
    ...over,
  };
}

/** Ein Projekt mit den uebergebenen Bloecken. */
function projekt(blocks: Block[] = []): Project {
  return {
    schema: CURRENT_SCHEMA,
    id: "2026-10_mein-short",
    title: "Mein Short",
    format: { fps: 30, width: 1080, height: 1920 },
    language: { recorded: "de", output: "en" },
    sources: [],
    blocks,
    capabilities: {},
    delivery: { targets: ["youtube-shorts", "tiktok"] },
  };
}

/** Die Kennungen in Array-Reihenfolge, fuer knappe Erwartungen. */
function ids(project: Project): string[] {
  return project.blocks.map((entry) => entry.id);
}

/** Eine fertige Vertonung, wie sie `vz voice` spaeter schreibt. */
function tts(): NonNullable<Block["tts"]> {
  return {
    file: "audio/tts/b001.wav",
    duration: 1.2,
    hash: "abc123",
    generated_at: "2026-10-08T12:00:00Z",
  };
}

describe("addBlock", () => {
  it("haengt den Block hinten an", () => {
    const project = projekt([block({ id: "b001" })]);
    const zweiter = block({ id: "b002" });
    addBlock(project, zweiter);
    expect(ids(project)).toEqual(["b001", "b002"]);
    // Der Block selbst wird eingesetzt, keine Kopie.
    expect(project.blocks[1]).toBe(zweiter);
  });

  it("wirft bei doppelter Kennung mit dem Namen und laesst die Liste unberuehrt", () => {
    const project = projekt([block({ id: "b001" })]);
    expect(() => addBlock(project, block({ id: "b001" }))).toThrow(/b001/);
    expect(ids(project)).toEqual(["b001"]);
  });
});

describe("moveBlock", () => {
  it("zaehlt die Zielposition nach dem Verschieben, nicht davor", () => {
    const project = projekt([block({ id: "b001" }), block({ id: "b002" }), block({ id: "b003" })]);
    moveBlock(project, "b001", 2);
    expect(ids(project)).toEqual(["b002", "b003", "b001"]);
  });

  it("verschiebt aus der Mitte ans Ende", () => {
    const project = projekt([block({ id: "b001" }), block({ id: "b002" }), block({ id: "b003" })]);
    moveBlock(project, "b002", 2);
    expect(ids(project)).toEqual(["b001", "b003", "b002"]);
  });

  it("verschiebt von hinten nach vorn", () => {
    const project = projekt([block({ id: "b001" }), block({ id: "b002" }), block({ id: "b003" })]);
    moveBlock(project, "b003", 0);
    expect(ids(project)).toEqual(["b003", "b001", "b002"]);
  });

  it("laesst die Reihenfolge stehen, wenn die Position schon stimmt", () => {
    const project = projekt([block({ id: "b001" }), block({ id: "b002" }), block({ id: "b003" })]);
    moveBlock(project, "b002", 1);
    expect(ids(project)).toEqual(["b001", "b002", "b003"]);
  });

  it("wirft bei unbekannter Kennung mit dem Namen", () => {
    const project = projekt([block({ id: "b001" })]);
    expect(() => moveBlock(project, "b404", 0)).toThrow(/b404/);
    expect(ids(project)).toEqual(["b001"]);
  });
});

describe("removeBlock", () => {
  it("entfernt genau einen Block", () => {
    const project = projekt([block({ id: "b001" }), block({ id: "b002" }), block({ id: "b003" })]);
    removeBlock(project, "b002");
    expect(ids(project)).toEqual(["b001", "b003"]);
  });

  it("wirft bei unbekannter Kennung mit dem Namen", () => {
    const project = projekt([block({ id: "b001" })]);
    expect(() => removeBlock(project, "b404")).toThrow(/b404/);
    expect(ids(project)).toEqual(["b001"]);
  });
});

describe("blockById", () => {
  it("liefert genau den Block mit der Kennung", () => {
    const project = projekt([block({ id: "b001" }), block({ id: "b002" })]);
    expect(blockById(project, "b002")).toBe(project.blocks[1]);
  });

  it("wirft bei unbekannter Kennung mit dem Namen", () => {
    expect(() => blockById(projekt(), "b404")).toThrow(/b404/);
  });
});

describe("sourceById", () => {
  /** Eine Quelle mit allen Pflichtfeldern. */
  function source(over: Partial<Source> = {}): Source {
    return {
      id: "s01",
      label: "Kamera A",
      file: "sources/s01/raw.mp4",
      added: "2026-10-08",
      duration: 10,
      checksum: "c".repeat(32),
      normalized: false,
      ...over,
    };
  }

  it("liefert genau die Quelle mit der Kennung", () => {
    const project = projekt();
    project.sources = [source(), source({ id: "s02" })];
    expect(sourceById(project, "s02")).toBe(project.sources[1]);
  });

  it("wirft bei unbekannter Kennung mit dem Namen", () => {
    expect(() => sourceById(projekt(), "s99")).toThrow(/s99/);
  });
});

describe("blockStatus", () => {
  it('ist "ok", sobald Text und Ton vorhanden sind', () => {
    expect(blockStatus(block({ text: "Ein Satz.", tts: tts() }))).toBe("ok");
  });

  it('ist "todo" ohne Text', () => {
    expect(blockStatus(block({ tts: tts() }))).toBe("todo");
  });

  it('ist "todo" ohne Ton', () => {
    expect(blockStatus(block({ text: "Ein Satz." }))).toBe("todo");
  });

  it('ist "stale", wenn der Hash nicht zum getrimmten Text passt', () => {
    const entry = block({
      text: " Neuer Text ",
      tts: { ...tts(), hash: ttsHash("Alter Text", "voicebox") },
    });
    expect(blockStatus(entry, "voicebox")).toBe("stale");
  });

  it('ist "ok", wenn der Hash zum getrimmten Text passt', () => {
    const entry = block({
      text: " Ein Satz. ",
      tts: { ...tts(), hash: ttsHash("Ein Satz.", "voicebox") },
    });
    expect(blockStatus(entry, "voicebox")).toBe("ok");
  });

  it("bleibt ohne Stimmen-Kennung beim bisherigen Urteil", () => {
    const entry = block({ text: "Neuer Text", tts: { ...tts(), hash: "veraltet" } });
    expect(blockStatus(entry)).toBe("ok");
  });

  it('ist "todo" ohne Ton oder ohne Text, auch mit Stimmen-Kennung', () => {
    expect(blockStatus(block({ text: "Ein Satz." }), "voicebox")).toBe("todo");
    expect(blockStatus(block({ tts: tts() }), "voicebox")).toBe("todo");
  });
});
