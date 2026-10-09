import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkIntegrity, loadBlock, loadIndex } from "../src/lib/blocks.js";
import type { BlockEntry } from "../src/lib/blocks.js";

/** Die Repo-Wurzel, in der die echten Bausteine liegen. */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Ein Eintrag mit allen Pflichtfeldern; Abweichungen kommen ueber over. */
function eintrag(over: Partial<BlockEntry> = {}): BlockEntry {
  return {
    id: "beispiel",
    kind: "ffmpeg-recipe",
    capability: "render",
    purpose: "Ein Beispielbaustein",
    inputs: ["audio"],
    requires: { tools: ["ffmpeg"], providers: [] },
    license: "MIT",
    version: 1,
    entry: "beispiel/block/recipe.md",
    ...over,
  };
}

function indexFile(root: string): string {
  return join(root, "blocks", "index.json");
}

/** Legt eine Repo-Attrappe mit blocks/index.json an. */
async function fixture(entries: unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vw-blocks-"));
  await mkdir(join(root, "blocks"), { recursive: true });
  await writeFile(indexFile(root), `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return root;
}

/** Schreibt eine Datei relativ zur Repo-Attrappe; fehlende Ordner entstehen. */
async function datei(root: string, relative: string, inhalt = "inhalt\n"): Promise<void> {
  const file = join(root, ...relative.split("/"));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, inhalt, "utf8");
}

describe("loadIndex", () => {
  it("liest die Eintraege in der Reihenfolge des Verzeichnisses", async () => {
    const erste = eintrag();
    const zweite = eintrag({ id: "zweiter", entry: "zweiter/platz/hier.md" });
    const root = await fixture([erste, zweite]);
    expect(await loadIndex(root)).toEqual([erste, zweite]);
  });

  it("wirft mit Pfad, wenn das Verzeichnis fehlt", async () => {
    const root = await mkdtemp(join(tmpdir(), "vw-blocks-"));
    await expect(loadIndex(root)).rejects.toThrow(indexFile(root));
    await expect(loadIndex(root)).rejects.toThrow(/fehlt/);
  });

  it("wirft mit Pfad bei kaputtem JSON", async () => {
    const root = await fixture([]);
    await writeFile(indexFile(root), "{ kein JSON", "utf8");
    await expect(loadIndex(root)).rejects.toThrow(indexFile(root));
    await expect(loadIndex(root)).rejects.toThrow(/JSON/);
  });

  it("wirft, wenn ein Pflichtfeld fehlt", async () => {
    const kaputt: Record<string, unknown> = { ...eintrag() };
    delete kaputt["license"];
    const root = await fixture([kaputt]);
    await expect(loadIndex(root)).rejects.toThrow(indexFile(root));
    await expect(loadIndex(root)).rejects.toThrow(/"license"/);
  });
});

describe("loadBlock", () => {
  it("liefert den Eintrag und die rekursive, sortierte Dateiliste", async () => {
    const root = await fixture([eintrag()]);
    await datei(root, "blocks/beispiel/block/recipe.md");
    await datei(root, "blocks/beispiel/block/notes/tief/extra.txt");
    await datei(root, "blocks/beispiel/block/notes/details.md");
    await datei(root, "blocks/beispiel/fremd.md");

    const block = await loadBlock(root, "beispiel");
    expect(block.entry).toEqual(eintrag());
    expect(block.files).toEqual([
      "blocks/beispiel/block/notes/details.md",
      "blocks/beispiel/block/notes/tief/extra.txt",
      "blocks/beispiel/block/recipe.md",
    ]);
  });

  it("wirft mit dem Namen bei unbekanntem id", async () => {
    const root = await fixture([eintrag()]);
    await expect(loadBlock(root, "gibt-es-nicht")).rejects.toThrow("gibt-es-nicht");
    await expect(loadBlock(root, "gibt-es-nicht")).rejects.toThrow(/unbekannt/);
  });

  it("wirft, wenn die entry-Datei fehlt", async () => {
    const root = await fixture([eintrag()]);
    await expect(loadBlock(root, "beispiel")).rejects.toThrow("beispiel");
    await expect(loadBlock(root, "beispiel")).rejects.toThrow(/entry-Datei fehlt/);
  });
});

describe("checkIntegrity", () => {
  it("meldet einen Eintrag, dessen entry-Datei fehlt", async () => {
    const root = await fixture([eintrag({ id: "ohne-datei", entry: "fehlt/datei.md" })]);
    const meldungen = await checkIntegrity(root);
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0]).toContain("ohne-datei");
    expect(meldungen[0]).toContain("blocks/fehlt/datei.md");
  });

  it("meldet eine Datei ohne Eintrag", async () => {
    const root = await fixture([eintrag()]);
    await datei(root, "blocks/beispiel/block/recipe.md");
    await datei(root, "blocks/verwaist/notiz.md");
    const meldungen = await checkIntegrity(root);
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0]).toContain("blocks/verwaist/notiz.md");
  });

  it("nimmt blocks/index.json und Unterordner eines Bausteins aus", async () => {
    const root = await fixture([eintrag()]);
    await datei(root, "blocks/beispiel/block/recipe.md");
    await datei(root, "blocks/beispiel/block/notes/tief.md");
    expect(await checkIntegrity(root)).toEqual([]);
  });

  it("ist im Repo mit den Startbausteinen leer", async () => {
    expect(await checkIntegrity(repoRoot)).toEqual([]);
  });
});

describe("die Startbausteine", () => {
  it("stehen mit den festgelegten Feldern im Verzeichnis", async () => {
    const eintraege = await loadIndex(repoRoot);
    expect(eintraege).toHaveLength(3);

    const loudnorm = eintraege.find((entry) => entry.id === "ffmpeg-loudnorm");
    expect(loudnorm?.kind).toBe("ffmpeg-recipe");
    expect(loudnorm?.capability).toBe("render");
    expect(loudnorm?.license).toBe("MIT");
    expect(loudnorm?.version).toBe(1);
    expect(loudnorm?.entry).toBe("ffmpeg/loudnorm/recipe.md");
    expect(loudnorm?.requires.tools).toContain("ffmpeg");

    const beats = eintraege.find((entry) => entry.id === "beats-short-retention");
    expect(beats?.kind).toBe("beat-template");
    expect(beats?.capability).toBe("planning");
    expect(beats?.license).toBe("MIT");
    expect(beats?.version).toBe(1);
    expect(beats?.entry).toBe("beats/short-retention/template.md");

    const captions = eintraege.find((entry) => entry.id === "ffmpeg-captions");
    expect(captions?.kind).toBe("ffmpeg-recipe");
    expect(captions?.capability).toBe("captions");
    expect(captions?.license).toBe("MIT");
    expect(captions?.version).toBe(1);
    expect(captions?.entry).toBe("ffmpeg/captions/recipe.md");
    expect(captions?.requires.tools).toContain("ffmpeg");
  });

  it("laedt das loudnorm-Rezept mit seinen exakten Werten", async () => {
    const block = await loadBlock(repoRoot, "ffmpeg-loudnorm");
    expect(block.files).toEqual(["blocks/ffmpeg/loudnorm/recipe.md"]);

    const inhalt = await readFile(join(repoRoot, "blocks", "ffmpeg", "loudnorm", "recipe.md"), "utf8");
    expect(inhalt).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(inhalt).toContain("loudnorm=I=-14:TP=-1.5:LRA=11");
    expect(inhalt).toContain("TP=-1.5");
    expect(inhalt).toContain("LRA=11");
    expect(inhalt).toMatch(/gemessen/);
  });

  it("laedt die short-retention-Vorlage mit ihren Zeitfenstern", async () => {
    const block = await loadBlock(repoRoot, "beats-short-retention");
    expect(block.files).toEqual(["blocks/beats/short-retention/template.md"]);

    const inhalt = await readFile(
      join(repoRoot, "blocks", "beats", "short-retention", "template.md"),
      "utf8",
    );
    for (const wort of [
      "Hook",
      "Confirm",
      "Payoff",
      "0 bis 2 s",
      "2 bis 5 s",
      "5 bis 15 s",
      "1 bis 3 s",
      "Loop",
      "CTA",
    ]) {
      expect(inhalt).toContain(wort);
    }
  });

  it("laedt das captions-Rezept mit dem subtitles-Filter", async () => {
    const block = await loadBlock(repoRoot, "ffmpeg-captions");
    expect(block.files).toEqual(["blocks/ffmpeg/captions/recipe.md"]);

    const inhalt = await readFile(
      join(repoRoot, "blocks", "ffmpeg", "captions", "recipe.md"),
      "utf8",
    );
    expect(inhalt).toContain("subtitles=");
    expect(inhalt).toMatch(/Safe-Zone/);
  });
});
