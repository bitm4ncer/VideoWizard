import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkIntegrity, loadBlock, loadIndex } from "../src/lib/blocks.js";
import type { BlockEntry } from "../src/lib/blocks.js";
import { CURRENT_SCHEMA, loadProject } from "../src/lib/project.js";

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
    expect(eintraege).toHaveLength(6);

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

    const scaffold = eintraege.find((entry) => entry.id === "scaffold-client-asset");
    expect(scaffold?.kind).toBe("scaffold");
    expect(scaffold?.capability).toBe("planning");
    expect(scaffold?.inputs).toEqual([]);
    expect(scaffold?.requires).toEqual({ tools: [], providers: [] });
    expect(scaffold?.license).toBe("MIT");
    expect(scaffold?.version).toBe(2);
    expect(scaffold?.entry).toBe("scaffolds/client-asset/plan.md");

    const cleanTutorial = eintraege.find((entry) => entry.id === "style-clean-tutorial");
    expect(cleanTutorial?.kind).toBe("style");
    expect(cleanTutorial?.capability).toBe("style");
    expect(cleanTutorial?.inputs).toEqual([]);
    expect(cleanTutorial?.requires).toEqual({ tools: [], providers: [] });
    expect(cleanTutorial?.license).toBe("MIT");
    expect(cleanTutorial?.version).toBe(1);
    expect(cleanTutorial?.entry).toBe("styles/clean-tutorial/STYLE.md");

    const boldShort = eintraege.find((entry) => entry.id === "style-bold-short");
    expect(boldShort?.kind).toBe("style");
    expect(boldShort?.capability).toBe("style");
    expect(boldShort?.inputs).toEqual([]);
    expect(boldShort?.requires).toEqual({ tools: [], providers: [] });
    expect(boldShort?.license).toBe("MIT");
    expect(boldShort?.version).toBe(1);
    expect(boldShort?.entry).toBe("styles/bold-short/STYLE.md");

    // Reihenfolge im Verzeichnis: erst das Scaffold, dann die Style-Karten.
    const ids = eintraege.map((entry) => entry.id);
    expect(ids.indexOf("scaffold-client-asset")).toBeLessThan(ids.indexOf("style-clean-tutorial"));
    expect(ids.indexOf("style-clean-tutorial")).toBeLessThan(ids.indexOf("style-bold-short"));
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

  it("laedt das client-asset-Scaffold mit plan.md und project.json", async () => {
    const block = await loadBlock(repoRoot, "scaffold-client-asset");
    expect(block.files).toEqual([
      "blocks/scaffolds/client-asset/plan.md",
      "blocks/scaffolds/client-asset/project.json",
    ]);
  });

  it("traegt im Scaffold-plan.md die fuenf Abschnitte und das Treatment", async () => {
    const inhalt = await readFile(
      join(repoRoot, "blocks", "scaffolds", "client-asset", "plan.md"),
      "utf8",
    );
    for (const abschnitt of [
      "Treatment",
      "Visuelles Thema",
      "Shotliste",
      "Freigaben",
      "Entscheidungen",
    ]) {
      expect(inhalt).toContain(`## ${abschnitt}`);
    }
    for (const punkt of [
      "Ausgangslage",
      "Zielgruppe",
      "Kernbotschaft",
      "Ton",
      "Referenzen",
      "Anforderungen",
      "Ausschluesse",
    ]) {
      expect(inhalt).toContain(`| ${punkt} |`);
    }
  });

  it("traegt im Scaffold-plan.md Ort und Termin fuer aufnehmen-Shots", async () => {
    const inhalt = await readFile(
      join(repoRoot, "blocks", "scaffolds", "client-asset", "plan.md"),
      "utf8",
    );

    // Die Shotliste hat eine eigene Spalte; bei aufnehmen-Shots ist sie ein
    // Wert oder ein offener Punkt, sonst bleibt sie leer.
    const kopf = inhalt.split(/\r?\n/).find((zeile) => zeile.startsWith("| Nr |"));
    expect(kopf).toBe(
      "| Nr | Zweck | Bildinhalt | Quelle | Ort/Termin | Text | Audio | Dauer (s) |",
    );
    expect(inhalt).toContain("`aufnehmen`-Shots");
    expect(inhalt).toContain("offener Punkt");
  });

  it("laedt die Scaffold-project.json als gueltige Projektdatei ohne fremde Felder", async () => {
    const dir = join(repoRoot, "blocks", "scaffolds", "client-asset");
    const project = await loadProject(dir);
    expect(project.schema).toBe(CURRENT_SCHEMA);

    const roh = JSON.parse(
      await readFile(join(dir, "project.json"), "utf8"),
    ) as Record<string, unknown>;
    const pflicht = [
      "schema",
      "id",
      "title",
      "format",
      "language",
      "sources",
      "blocks",
      "capabilities",
      "delivery",
    ];
    for (const feld of pflicht) {
      expect(roh, `Feld ${feld}`).toHaveProperty(feld);
    }
    // Nur Felder aus Project in src/lib/types.ts; audio und outro sind optional.
    const erlaubt = new Set([...pflicht, "audio", "outro"]);
    expect(Object.keys(roh).filter((feld) => !erlaubt.has(feld))).toEqual([]);
  });

  it.each(["clean-tutorial", "bold-short"])(
    "traegt die Style-Karte %s mit allen sechs Abschnitten",
    async (name) => {
      const block = await loadBlock(repoRoot, `style-${name}`);
      expect(block.files).toEqual([`blocks/styles/${name}/STYLE.md`]);

      const inhalt = await readFile(
        join(repoRoot, "blocks", "styles", name, "STYLE.md"),
        "utf8",
      );
      for (const abschnitt of [
        "Palette",
        "Typografie",
        "Motion",
        "Grading",
        "Regeln",
        "Frame-Checkliste",
      ]) {
        expect(inhalt).toContain(`## ${abschnitt}`);
      }
    },
  );
});
