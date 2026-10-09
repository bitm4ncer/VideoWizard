import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { runLearn } from "../src/commands/learn.js";
import { repoRoot } from "../src/lib/brand.js";

let out: string[] = [];
let err: string[] = [];

// Die Ausgabe laeuft ueber console.log/console.error. Der Test faengt genau
// die Zeilen ab, die der Befehl wirklich schreibt.
beforeEach(() => {
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

/** Ein frischer Wurzelordner; `learnings` legt der Befehl selbst an. */
async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vw-learn-"));
}

const TITLE = "FFmpeg Filter: Pfad-Apostroph";
const DATE = "2026-10-09";
const NAME = "2026-10-09-ffmpeg-filter-pfad-apostroph.md";

describe("runLearn", () => {
  it("legt den datierten Eintrag an, nennt den Pfad und endet mit 0", async () => {
    const root = await tempRoot();
    const file = join(root, "learnings", NAME);

    const code = await runLearn([TITLE], { root, today: DATE });

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(text(out)).toBe(file);
    await expect(readFile(file, "utf8")).resolves.toContain(`# ${TITLE}`);
  });

  it("nennt ohne Titel die Nutzung und endet mit 2", async () => {
    const root = await tempRoot();

    expect(await runLearn([], { root, today: DATE })).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("learn");
    expect(out).toEqual([]);
    // Ein leerer Titel ist kein Titel.
    expect(await runLearn(["   "], { root, today: DATE })).toBe(2);
    // Unbekannte Schalter sind kein stiller Zusatz.
    expect(await runLearn([TITLE, "--quelle", "x"], { root, today: DATE })).toBe(2);
  });

  it("ueberschreibt einen vorhandenen Eintrag nicht und nennt den Pfad mit Code 1", async () => {
    const root = await tempRoot();
    const file = join(root, "learnings", NAME);
    expect(await runLearn([TITLE], { root, today: DATE })).toBe(0);
    const vorher = await readFile(file, "utf8");
    out = [];
    err = [];

    const code = await runLearn([TITLE], { root, today: DATE });

    expect(code).toBe(1);
    expect(text(err)).toContain(file);
    await expect(readFile(file, "utf8")).resolves.toBe(vorher);
  });

  it("nimmt Quelle und Beobachtung in den Eintrag", async () => {
    const root = await tempRoot();
    const file = join(root, "learnings", NAME);

    const code = await runLearn(
      [TITLE, "--source", "Etappe 2b", "--note", "Der Filter reisst am Apostroph"],
      { root, today: DATE },
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const inhalt = await readFile(file, "utf8");
    expect(inhalt).toContain("*Quelle: Etappe 2b*");
    expect(inhalt).toContain("Der Filter reisst am Apostroph");
    expect(inhalt).not.toContain("eigene Beobachtung");
  });
});

describe("die Repo-Wurzel", () => {
  it("findet das Verzeichnis des Repos unabhaengig vom Arbeitsverzeichnis", () => {
    expect(repoRoot()).toBe(resolve(fileURLToPath(new URL("..", import.meta.url))));
  });
});

describe("die Befehlsliste", () => {
  it("nennt learn in der Hilfe", async () => {
    const code = await runCli(["help"]);

    expect(code).toBe(0);
    expect(text(out)).toContain("learn");
    expect(err).toEqual([]);
  });

  it("leitet learn ueber das CLI weiter", async () => {
    const code = await runCli(["learn"]);

    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });
});
