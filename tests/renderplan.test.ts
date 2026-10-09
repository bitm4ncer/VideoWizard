import { describe, expect, it } from "vitest";
import { buildRenderPlan } from "../src/lib/renderplan.js";
import { CURRENT_SCHEMA } from "../src/lib/project.js";
import type { Block, Project } from "../src/lib/types.js";

/** Ein fertiger Block; Abweichungen kommen ueber over. */
function block(over: Partial<Block> = {}): Block {
  return {
    id: "b001",
    kind: "take",
    source_id: "s01",
    source_in: 0,
    source_out: 10,
    silences: [],
    text: "Der Text",
    tts: {
      file: "audio/tts/b001.wav",
      duration: 8,
      hash: "hash",
      generated_at: "2026-10-08",
    },
    pause_after: 0,
    fit: "none",
    overlays: [],
    ...over,
  };
}

/** Ein Projekt mit einer Quelle und den uebergebenen Bloecken. */
function project(blocks: Block[], over: Partial<Project> = {}): Project {
  return {
    schema: CURRENT_SCHEMA,
    id: "p",
    title: "T",
    format: { fps: 30, width: 1080, height: 1920 },
    language: { recorded: "de", output: "en" },
    sources: [{
      id: "s01",
      label: "Kamera A",
      file: "sources/s01/raw.mp4",
      added: "2026-10-08",
      duration: 100,
      checksum: "c".repeat(32),
      normalized: false,
    }],
    blocks,
    capabilities: {},
    delivery: { targets: [] },
    ...over,
  };
}

describe("buildRenderPlan", () => {
  it("uebersetzt Schnitte in die verbleibenden Bereiche", () => {
    const plan = buildRenderPlan(project([block({ silences: [[3, 5]] })]));

    expect(plan.video[0]!.ranges).toEqual([[0, 3], [5, 10]]);
    expect(plan.video[0]!.duration).toBe(8);
    expect(plan.video[0]!.sourceFile).toBe("sources/s01/raw.mp4");
  });

  it("kuerzt hinten, wenn keine Pausen da sind", () => {
    const plan = buildRenderPlan(project([block({ tts: {
      file: "audio/tts/b001.wav", duration: 7, hash: "h", generated_at: "x",
    } })]));

    expect(plan.video[0]!.ranges).toEqual([[0, 7]]);
    expect(plan.video[0]!.duration).toBe(7);
  });

  it("uebernimmt Tempo und Standbild bei einer Ueberlaenge, die noch kein overflow ist", () => {
    const plan = buildRenderPlan(project([block({ tts: {
      file: "audio/tts/b001.wav", duration: 12, hash: "h", generated_at: "x",
    } })]));

    expect(plan.video[0]!.speed).toBeCloseTo(0.9, 3);
    expect(plan.video[0]!.freeze).toBeGreaterThan(0);
    expect(plan.video[0]!.duration).toBe(12);
  });

  it("laesst still der Stimme folgen und nennt den Frame-Zeitpunkt", () => {
    const still = block({
      kind: "still",
      freeze_at: 42,
      pause_after: 0.35,
      tts: { file: "audio/tts/b001.wav", duration: 5, hash: "h", generated_at: "x" },
    });
    const plan = buildRenderPlan(project([still]));

    expect(plan.video[0]!.ranges).toEqual([]);
    expect(plan.video[0]!.freezeAt).toBe(42);
    expect(plan.video[0]!.duration).toBe(5.35);
    expect(plan.video[0]!.speed).toBe(1);
    expect(plan.video[0]!.freeze).toBe(0);
  });

  it("gibt jeden Tonabschnitt mit Datei, Dauer und Pause weiter", () => {
    const plan = buildRenderPlan(project([block({ pause_after: 0.35 })]));

    expect(plan.audio).toEqual([{
      blockId: "b001",
      file: "audio/tts/b001.wav",
      duration: 8,
      pauseAfter: 0.35,
    }]);
  });

  it("wirft bei Ueberlaenge und nennt die Bloecke", () => {
    const lang = block({ tts: {
      file: "audio/tts/b001.wav", duration: 20, hash: "h", generated_at: "x",
    } });

    expect(() => buildRenderPlan(project([lang]))).toThrow(/b001/);
  });

  it("rendert Ueberlaenge, wenn sie ausdruecklich erlaubt wird", () => {
    const lang = block({ tts: {
      file: "audio/tts/b001.wav", duration: 20, hash: "h", generated_at: "x",
    } });
    const plan = buildRenderPlan(project([lang]), { allowOverflow: true });

    expect(plan.video).toHaveLength(1);
    expect(plan.warnings.join(" ")).toMatch(/Ueberlaenge/);
  });

  it("verweigert unfertige Bloecke und nennt sie", () => {
    const fertig = block();
    const offen = block({ id: "b002", text: undefined, tts: undefined });

    expect(() => buildRenderPlan(project([fertig, offen]))).toThrow(/b002/);
  });

  it("laesst unfertige Bloecke mit allowIncomplete aus und warnt", () => {
    const fertig = block();
    const offen = block({ id: "b002", text: undefined, tts: undefined });
    const plan = buildRenderPlan(project([fertig, offen]), { allowIncomplete: true });

    expect(plan.video.map((segment) => segment.blockId)).toEqual(["b001"]);
    expect(plan.warnings.join(" ")).toMatch(/b002/);
  });

  it("wirft bei einer unbekannten Quelle", () => {
    expect(() => buildRenderPlan(project([block({ source_id: "s99" })])))
      .toThrow(/s99/);
  });

  it("nimmt Musik und Outro aus dem Projekt mit", () => {
    const plan = buildRenderPlan(project([block()], {
      audio: { music: { file: "musik/bett.mp3", gain_db: -20, duck_db: -10 } },
      outro: { file: "outro/ende.mp4", crossfade: 0.8 },
    }));

    expect(plan.music).toEqual({ file: "musik/bett.mp3", gain_db: -20, duck_db: -10 });
    expect(plan.outro).toEqual({ file: "outro/ende.mp4", crossfade: 0.8 });
  });

  it("meldet Musik und Outro als leer, wenn das Projekt sie nicht setzt", () => {
    const plan = buildRenderPlan(project([block()]));

    expect(plan.format).toEqual({ fps: 30, width: 1080, height: 1920 });
    expect(plan.music).toBeNull();
    expect(plan.outro).toBeNull();
  });
});
