import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA } from "../src/lib/project.js";
import { addBlock, blockById, blockStatus, moveBlock, removeBlock } from "../src/lib/plan.js";
import type { Block, Project } from "../src/lib/types.js";

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
function tts(): Block["tts"] {
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
});
