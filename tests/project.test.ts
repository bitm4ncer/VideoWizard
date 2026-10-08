import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CURRENT_SCHEMA, loadProject, saveProject } from "../src/lib/project.js";
import { projectPaths } from "../src/lib/paths.js";
import type { Project } from "../src/lib/types.js";

// Der Tausch laeuft ueber fs.rename, das Schreiben ueber fs.writeFile. Beide
// Aufrufe werden beobachtet, damit der Test Nebendatei, Tausch, Ueberlappung
// und Fehlerpfad nachweisen kann.
const mocks = vi.hoisted(() => ({
  rename: vi.fn(),
  writeFile: vi.fn(),
  actual: {
    rename: undefined as typeof import("node:fs/promises").rename | undefined,
    writeFile: undefined as typeof import("node:fs/promises").writeFile | undefined,
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  mocks.actual.rename = actual.rename;
  mocks.actual.writeFile = actual.writeFile;
  mocks.rename.mockImplementation(actual.rename);
  mocks.writeFile.mockImplementation(actual.writeFile);
  return { ...actual, rename: mocks.rename, writeFile: mocks.writeFile };
});

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vw-"));
  mocks.rename.mockReset();
  mocks.writeFile.mockReset();
  mocks.rename.mockImplementation(mocks.actual.rename!);
  mocks.writeFile.mockImplementation(mocks.actual.writeFile!);
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

/** Haelt den naechsten Schreibvorgang nach dem Schreiben an, vor dem Tausch. */
function pauseNextWrite(): { written: Promise<void>; openGate: () => void; tempPath: () => string } {
  let tempPath = "";
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  let writeDone!: () => void;
  const written = new Promise<void>((resolve) => {
    writeDone = resolve;
  });
  mocks.writeFile.mockImplementationOnce(async (file, data, options) => {
    tempPath = String(file);
    await mocks.actual.writeFile!(file, data, options);
    writeDone();
    await gate;
  });
  return { written, openGate, tempPath: () => tempPath };
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
  it("schreibt atomar in eine eindeutige Nebendatei und tauscht sie", async () => {
    const projekt = beispiel();
    await saveProject(dir, projekt);
    const { projectFile } = projectPaths(dir);
    expect(mocks.rename).toHaveBeenCalledTimes(1);
    const [tempFile, ziel] = mocks.rename.mock.calls[0] ?? [];
    expect(ziel).toBe(projectFile);
    // Jeder Lauf bekommt eine eigene Nebendatei; ein gemeinsamer Name waere
    // die Grundlage fuer den Wettlauf.
    expect(String(tempFile)).not.toBe(`${projectFile}.tmp`);
    expect(String(tempFile).startsWith(`${projectFile}.`)).toBe(true);
    expect(String(tempFile).endsWith(".tmp")).toBe(true);
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

  it("wiederholt den Tausch nach einem Windows-Konflikt", async () => {
    const eperm = Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
    mocks.rename
      .mockImplementationOnce(async () => {
        throw eperm;
      })
      .mockImplementationOnce(async () => {
        throw eperm;
      });

    await saveProject(dir, beispiel());

    expect(mocks.rename).toHaveBeenCalledTimes(3);
    expect(await loadProject(dir)).toEqual(beispiel());
  });

  it("haelt zwei ueberlappende Speichervorgaenge auseinander", async () => {
    const slowProject = beispiel({ title: "Langsam" });
    const fastProject = beispiel({ title: "Schnell" });
    const write = pauseNextWrite();

    // Der erste Tausch des langsamen Laufs scheitert einmal unter Windows.
    let slowRenames = 0;
    mocks.rename.mockImplementation(async (from, to) => {
      if (String(from) === write.tempPath() && slowRenames === 0) {
        slowRenames += 1;
        throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
      }
      return mocks.actual.rename!(from, to);
    });

    const slowSave = saveProject(dir, slowProject);
    await write.written;

    // Der zweite Lauf kommt waehrend der Pause durch und tauscht seine eigene
    // Nebendatei; die angehaltene Nebendatei bleibt unberuehrt.
    await saveProject(dir, fastProject);
    expect((await readdir(dir)).sort()).toContain(basename(write.tempPath()));
    expect(JSON.parse(await readFile(write.tempPath(), "utf8")).title).toBe("Langsam");

    write.openGate();
    await slowSave;

    // Der letzte Tausch gewinnt; die Wahrheitsdatei bleibt lesbar.
    expect(slowRenames).toBe(1);
    expect(await loadProject(dir)).toEqual(slowProject);
    expect(await readdir(dir)).toEqual(["project.json"]);
  });

  it("laesst den Verlierer sauber scheitern, ohne die Wahrheitsdatei zu beschaedigen", async () => {
    const loserProject = beispiel({ title: "Verlierer" });
    const winnerProject = beispiel({ title: "Gewinner" });
    const write = pauseNextWrite();

    // Der langsame Lauf kommt nie zum Tausch: Windows haelt die Datei fest.
    mocks.rename.mockImplementation(async (from, to) => {
      if (String(from) === write.tempPath()) {
        throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
      }
      return mocks.actual.rename!(from, to);
    });

    const slowSave = saveProject(dir, loserProject);
    await write.written;

    await saveProject(dir, winnerProject);
    expect((await readdir(dir)).sort()).toContain(basename(write.tempPath()));

    write.openGate();

    await expect(slowSave).rejects.toThrow(/EBUSY/);
    expect(await loadProject(dir)).toEqual(winnerProject);
    expect(await readdir(dir)).toEqual(["project.json"]);
  });

  it("raeumt die Nebendatei auch nach einem Schreibfehler auf", async () => {
    mocks.writeFile.mockImplementationOnce(async (file, data, options) => {
      // Eine halbe Nebendatei anlegen, dann scheitern.
      await mocks.actual.writeFile!(file, String(data).slice(0, 5), options);
      throw new Error("Platte voll");
    });

    await expect(saveProject(dir, beispiel())).rejects.toThrow("Platte voll");

    const leftovers = (await readdir(dir)).filter((name) => name.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
