import type { Dirent } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadIndex } from "../src/lib/blocks.js";
import { buildCatalog } from "../src/lib/catalog.js";

/** Die Repo-Wurzel, in der die echten Skills und Bausteine liegen. */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Das einfache Frontmatter: einzeilige Werte zwischen zwei ---. */
interface Frontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    return {};
  }
  const ende = lines.indexOf("---", 1);
  if (ende === -1) {
    return {};
  }
  const values = new Map<string, string>();
  for (const line of lines.slice(1, ende)) {
    const treffer = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/.exec(line);
    const key = treffer?.[1];
    const value = treffer?.[2];
    if (key !== undefined && value !== undefined) {
      values.set(key, value.trim());
    }
  }
  return { name: values.get("name"), description: values.get("description") };
}

/** Alle SKILL.md unterhalb von dir; fehlende Ordner ergeben eine leere Liste. */
async function skillFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await skillFiles(full)));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(full);
    }
  }
  return found;
}

/** Ein Skill des echten Repos: Pfad, Gruppe und Frontmatter. */
interface RepoSkill extends Frontmatter {
  path: string;
  group: string;
}

/** Alle Skills des echten Repos, sortiert nach Pfad. */
async function repoSkills(): Promise<RepoSkill[]> {
  const files = (await skillFiles(join(repoRoot, "skills"))).sort();
  const skills: RepoSkill[] = [];
  for (const file of files) {
    const path = relative(repoRoot, file).split(sep).join("/");
    const parts = path.split("/");
    skills.push({
      path,
      group: parts[1] ?? "",
      ...parseFrontmatter(await readFile(file, "utf8")),
    });
  }
  return skills;
}

/** Die Zeilen des erzeugten Katalogs. */
function catalogLines(catalog: string): string[] {
  return catalog.split(/\r?\n/);
}

/** Die Gruppe, unter der ein Eintrag im Skill-Abschnitt steht. */
function groupOf(catalog: string, entry: string): string | undefined {
  let group: string | undefined;
  for (const line of catalogLines(catalog)) {
    const treffer = /^### (\S+)$/.exec(line);
    if (treffer?.[1] !== undefined) {
      group = treffer[1];
    }
    if (line.startsWith(`- **${entry}**`)) {
      return group;
    }
  }
  return undefined;
}

/** Legt eine kleine Repo-Attrappe an; nur so ist die Fehlerzeile pruefbar. */
async function fixtureMitKaputtemSkill(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vw-catalog-"));
  const kaputt = join(root, "skills", "planning", "kaputt");
  await mkdir(kaputt, { recursive: true });
  await writeFile(
    join(kaputt, "SKILL.md"),
    ["---", "name: kaputt", "---", "", "# Kaputt", ""].join("\n"),
    "utf8",
  );
  const heil = join(root, "skills", "tools", "heil");
  await mkdir(heil, { recursive: true });
  await writeFile(
    join(heil, "SKILL.md"),
    ["---", "name: heil", "description: Use when der Lauf trotz Fehler weitergeht.", "---", ""].join(
      "\n",
    ),
    "utf8",
  );
  await mkdir(join(root, "blocks"), { recursive: true });
  await writeFile(join(root, "blocks", "index.json"), "[]\n", "utf8");
  return root;
}

describe("buildCatalog fuer das echte Repo", () => {
  it("hat eine Kopfzeile, die auf die Erzeugung hinweist", async () => {
    const catalog = await buildCatalog(repoRoot);
    expect(catalogLines(catalog)[0]).toBe("# VideoWizard Katalog");
    expect(catalog).toContain("npm run catalog");
    expect(catalog).toContain("nicht von Hand gepflegt");
  });

  it("nennt jeden Skill genau einmal, mit description und Gruppe", async () => {
    const catalog = await buildCatalog(repoRoot);
    const skills = await repoSkills();
    for (const skill of skills) {
      const zeilen = catalogLines(catalog).filter((line) =>
        line.startsWith(`- **${skill.name ?? ""}**`),
      );
      expect(zeilen, `Skill ${skill.path}`).toHaveLength(1);
      expect(zeilen[0]).toContain(skill.description ?? "");
      expect(groupOf(catalog, skill.name ?? ""), `Skill ${skill.path}`).toBe(skill.group);
    }
    const skillAbschnitt = catalog.split("## Bausteine")[0] ?? "";
    expect(catalogLines(skillAbschnitt).filter((line) => line.startsWith("- **"))).toHaveLength(
      skills.length,
    );
  });

  it("nennt jeden Baustein genau einmal, mit purpose und license", async () => {
    const catalog = await buildCatalog(repoRoot);
    const entries = await loadIndex(repoRoot);
    for (const entry of entries) {
      const zeilen = catalogLines(catalog).filter((line) =>
        line.startsWith(`- **${entry.id}**`),
      );
      expect(zeilen, `Baustein ${entry.id}`).toHaveLength(1);
      expect(zeilen[0]).toContain(entry.purpose);
      expect(zeilen[0]).toContain(entry.license);
    }
    const bausteinAbschnitt = catalog.split("## Bausteine")[1] ?? "";
    expect(catalogLines(bausteinAbschnitt).filter((line) => line.startsWith("- **"))).toHaveLength(
      entries.length,
    );
  });

  it("stimmt mit docs/catalog.md ueberein", async () => {
    const catalog = await buildCatalog(repoRoot);
    const datei = (await readFile(join(repoRoot, "docs", "catalog.md"), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
    expect(datei).toBe(catalog);
  });
});

describe("buildCatalog mit lueckem Frontmatter", () => {
  it("meldet die fehlende description als Zeile und laeuft weiter", async () => {
    const catalog = await buildCatalog(await fixtureMitKaputtemSkill());
    expect(catalog).toContain("FEHLER: skills/planning/kaputt/SKILL.md hat keine description");
    expect(catalog).not.toContain("- **kaputt**");
    expect(catalog).toContain("- **heil**");
  });
});
