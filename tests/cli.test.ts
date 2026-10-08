import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli.js";
import { projectPaths } from "../src/lib/paths.js";
import { CURRENT_SCHEMA, saveProject } from "../src/lib/project.js";
import type { Block, Project } from "../src/lib/types.js";

let dir = "";
let out: string[] = [];
let err: string[] = [];

// Die Ausgabe laeuft ueber console.log/console.error. Der Test faengt genau
// die Zeilen ab, die das CLI wirklich schreibt.
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vw-cli-"));
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    err.push(parts.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function text(lines: string[]): string {
  return lines.join("\n");
}

/** Das Beispiel aus Abschnitt 7 der Spezifikation. */
function beispiel(over: Partial<Project> = {}): Project {
  return {
    schema: CURRENT_SCHEMA,
    id: "2026-10_mein-short",
    title: "Mein Short",
    format: { fps: 30, width: 1080, height: 1920 },
    language: { recorded: "de", output: "en" },
    sources: [],
    blocks: [],
    capabilities: {
      voice: { provider: "voicebox", options: {} },
      music: { provider: "acestep", options: { model: "acestep-v15-turbo" } },
    },
    delivery: { targets: ["youtube-shorts", "tiktok"] },
    ...over,
  };
}

/** Ein Block; Abweichungen kommen ueber over. */
function block(over: Partial<Block> = {}): Block {
  return {
    id: "b001",
    kind: "take",
    source_id: "s01",
    source_in: 0,
    source_out: 10,
    silences: [],
    text: "Der Text",
    pause_after: 0,
    fit: "none",
    overlays: [],
    ...over,
  };
}

describe("runCli: status", () => {
  it('meldet in einem leeren Ordner "kein Projekt" und endet mit 0', async () => {
    const code = await runCli(["status", dir]);
    expect(code).toBe(0);
    expect(text(out)).toContain("kein Projekt");
    expect(text(out)).toContain(dir);
    expect(err).toEqual([]);
  });

  it("nennt bei einem vorhandenen Projekt Titel und Kennung", async () => {
    await saveProject(dir, beispiel());
    const code = await runCli(["status", dir]);
    expect(code).toBe(0);
    expect(text(out)).toContain("Mein Short");
    expect(text(out)).toContain("2026-10_mein-short");
    expect(err).toEqual([]);
  });

  it("meldet ein kaputtes Projekt als Fehler und endet mit 1", async () => {
    await writeFile(projectPaths(dir).projectFile, "{ kein JSON", "utf8");
    const code = await runCli(["status", dir]);
    expect(code).toBe(1);
    expect(text(err)).toContain(projectPaths(dir).projectFile);
    expect(text(err)).toMatch(/JSON/);
    expect(out).toEqual([]);
  });

  it("nimmt ohne Ordnerangabe den aktuellen Ordner", async () => {
    const vorher = process.cwd();
    process.chdir(dir);
    try {
      const code = await runCli(["status"]);
      expect(code).toBe(0);
      expect(text(out)).toContain("kein Projekt");
    } finally {
      process.chdir(vorher);
    }
  });

  it("endet bei zu vielen Argumenten mit 2 und einer Aufrufzeile", async () => {
    const code = await runCli(["status", dir, "zu-viel"]);
    expect(code).toBe(2);
    expect(text(err)).toContain("Aufruf");
    expect(out).toEqual([]);
  });

  it("nennt je Block Kennung, Zustand und Textanfang und zaehlt die offenen", async () => {
    await saveProject(dir, beispiel({
      blocks: [
        block({
          id: "b001",
          text: "Der fertige Text",
          tts: {
            file: "audio/tts/b001.wav",
            duration: 2,
            hash: "h",
            generated_at: "2026-10-01",
          },
        }),
        block({ id: "b002", text: "Noch offen" }),
        block({ id: "b003", text: undefined }),
      ],
    }));

    const code = await runCli(["status", dir]);

    expect(code).toBe(0);
    const lines = out.map((line) => line.trim());
    expect(lines.some((line) =>
      line.startsWith("b001") && line.includes("ok") && line.includes("Der fertige Text"),
    )).toBe(true);
    expect(lines.some((line) =>
      line.startsWith("b002") && line.includes("todo") && line.includes("Noch offen"),
    )).toBe(true);
    expect(lines.some((line) =>
      line.startsWith("b003") && line.includes("todo") && line.includes("(kein Text)"),
    )).toBe(true);
    expect(text(out)).toContain("offene Bloecke: 2 von 3");
    expect(err).toEqual([]);
  });

  it("kuerzt lange Texte auf den Anfang", async () => {
    const lang = `${"A".repeat(30)}ENDE-der-lange-text`;
    await saveProject(dir, beispiel({ blocks: [block({ text: lang })] }));

    const code = await runCli(["status", dir]);

    expect(code).toBe(0);
    expect(text(out)).toContain(`${lang.slice(0, 40)}...`);
    expect(text(out)).not.toContain(lang.slice(0, 41));
  });

  it("meldet ein Projekt ohne Bloecke als null offen", async () => {
    await saveProject(dir, beispiel());
    const code = await runCli(["status", dir]);
    expect(code).toBe(0);
    expect(text(out)).toContain("offene Bloecke: 0 von 0");
  });
});

describe("runCli: help und Fehler", () => {
  it("nennt in der Hilfe die Befehle status, doctor und help", async () => {
    const code = await runCli(["help"]);
    expect(code).toBe(0);
    expect(text(out)).toContain("status");
    expect(text(out)).toContain("doctor");
    expect(text(out)).toContain("help");
    expect(err).toEqual([]);
  });

  it("nennt in der Hilfe auch die neuen Befehle ingest, voice und render", async () => {
    const code = await runCli(["help"]);
    expect(code).toBe(0);
    expect(text(out)).toContain("ingest");
    expect(text(out)).toContain("voice");
    expect(text(out)).toContain("render");
    expect(err).toEqual([]);
  });

  it("nennt bei ingest ohne Pfade die Nutzung und endet mit 2", async () => {
    const code = await runCli(["ingest"]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("ingest <ordner> <video>");
    expect(out).toEqual([]);
  });

  it("zeigt ohne Argumente die Hilfe", async () => {
    const code = await runCli([]);
    expect(code).toBe(0);
    expect(text(out)).toContain("status");
  });

  it("endet bei einem unbekannten Befehl mit 2 und einer Meldung", async () => {
    const code = await runCli(["quatsch"]);
    expect(code).toBe(2);
    expect(text(err)).toContain("quatsch");
    expect(text(err)).toMatch(/help/i);
    expect(out).toEqual([]);
  });
});
