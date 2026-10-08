import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CURRENT_SCHEMA, loadProject, saveProject } from "../src/lib/project.js";
import { projectPaths } from "../src/lib/paths.js";
import type { Project } from "../src/lib/types.js";

// Der Tausch laeuft ueber fs.rename. Nur dieser eine Aufruf wird beobachtet,
// damit der Test die Nebendatei und den Tausch nachweisen kann.
const mocks = vi.hoisted(() => ({ rename: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  mocks.rename.mockImplementation(actual.rename);
  return { ...actual, rename: mocks.rename };
});

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vw-"));
  mocks.rename.mockClear();
});

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

async function schreibe(project: unknown): Promise<void> {
  await writeFile(projectPaths(dir).projectFile, JSON.stringify(project), "utf8");
}

describe("loadProject", () => {
  it("laedt ein gueltiges Projekt", async () => {
    await schreibe(beispiel());
    expect(await loadProject(dir)).toEqual(beispiel());
  });

  it("wirft mit Pfad, wenn die Datei fehlt", async () => {
    const { projectFile } = projectPaths(dir);
    await expect(loadProject(dir)).rejects.toThrow(projectFile);
    await expect(loadProject(dir)).rejects.toThrow(/fehlt/);
  });

  it("wirft mit klarer Meldung bei einem neueren schema", async () => {
    await schreibe(beispiel({ schema: CURRENT_SCHEMA + 1 }));
    await expect(loadProject(dir)).rejects.toThrow(/schema/i);
    await expect(loadProject(dir)).rejects.toThrow(String(CURRENT_SCHEMA + 1));
    await expect(loadProject(dir)).rejects.toThrow(`bis ${CURRENT_SCHEMA}`);
  });

  it("wirft mit Pfad bei kaputtem JSON", async () => {
    await writeFile(projectPaths(dir).projectFile, "{ kein JSON", "utf8");
    await expect(loadProject(dir)).rejects.toThrow(projectPaths(dir).projectFile);
    await expect(loadProject(dir)).rejects.toThrow(/JSON/);
  });
});

describe("saveProject", () => {
  it("schreibt atomar in eine Nebendatei und tauscht sie", async () => {
    const projekt = beispiel();
    await saveProject(dir, projekt);
    const { projectFile } = projectPaths(dir);
    expect(mocks.rename).toHaveBeenCalledTimes(1);
    expect(mocks.rename).toHaveBeenCalledWith(`${projectFile}.tmp`, projectFile);
    expect(await readdir(dir)).toEqual(["project.json"]);
    expect(await loadProject(dir)).toEqual(projekt);
  });

  it("laesst nach zwei Schreibvorgaengen keine halbe Datei zurueck", async () => {
    const erste = beispiel({ title: "Erster Schnitt" });
    const zweite = beispiel({ title: "Zweiter Schnitt" });
    await saveProject(dir, erste);
    await saveProject(dir, zweite);
    expect(mocks.rename).toHaveBeenCalledTimes(2);
    const roh = await readFile(projectPaths(dir).projectFile, "utf8");
    expect(roh.endsWith("\n")).toBe(true);
    expect(JSON.parse(roh).title).toBe("Zweiter Schnitt");
    expect(await loadProject(dir)).toEqual(zweite);
    expect(await readdir(dir)).toEqual(["project.json"]);
  });

  it("legt den Projektordner an, wenn er fehlt", async () => {
    const neu = join(dir, "unterordner", "projekt");
    await saveProject(neu, beispiel());
    expect(await loadProject(neu)).toEqual(beispiel());
  });
});
