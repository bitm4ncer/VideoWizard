import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Die Repo-Wurzel, in der die echten Skills liegen. */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Die Skills, die Etappe 1 verlangt. Geprueft wird der echte Repo-Bestand. */
const skillsAusEtappeEins = [
  "skills/meta/using-videowizard/SKILL.md",
  "skills/planning/planning-short/SKILL.md",
  "skills/producing/making-a-short/SKILL.md",
  "skills/tools/tool-ffmpeg/SKILL.md",
  "skills/tools/tool-ace-step/SKILL.md",
  "skills/reference/blocks/SKILL.md",
  "skills/reference/video-anatomy/SKILL.md",
];

/** Ein Repo-Pfad als Systempfad. */
function repoFile(relativePath: string): string {
  return join(repoRoot, ...relativePath.split("/"));
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
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

/** Alle Skills des Repos, relativ zur Repo-Wurzel und sortiert. */
async function alleSkills(): Promise<string[]> {
  return (await skillFiles(join(repoRoot, "skills")))
    .map((file) => relative(repoRoot, file).split(sep).join("/"))
    .sort();
}

/** Das einfache Frontmatter: einzeilige Werte zwischen zwei ---. */
interface Frontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(text: string): Frontmatter | null {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    return null;
  }
  const ende = lines.indexOf("---", 1);
  if (ende === -1) {
    return null;
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

/** Woerter zaehlen, wie ein Leser sie sieht: getrennt durch Leerraum. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((wort) => wort !== "").length;
}

describe("die Skills aus Etappe 1", () => {
  it("sind alle im Repo vorhanden", async () => {
    const fehlend: string[] = [];
    for (const skill of skillsAusEtappeEins) {
      if (!(await isFile(repoFile(skill)))) {
        fehlend.push(skill);
      }
    }
    expect(fehlend).toEqual([]);
  });
});

describe("jede SKILL.md im Repo", () => {
  it("hat Frontmatter mit name und description", async () => {
    const verstoesse: string[] = [];
    for (const skill of await alleSkills()) {
      const frontmatter = parseFrontmatter(await readFile(repoFile(skill), "utf8"));
      if (frontmatter === null) {
        verstoesse.push(`${skill}: Frontmatter fehlt`);
        continue;
      }
      if (!frontmatter.name) {
        verstoesse.push(`${skill}: name fehlt`);
      }
      if (!frontmatter.description) {
        verstoesse.push(`${skill}: description fehlt`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('hat eine description, die mit "Use when" beginnt', async () => {
    const verstoesse: string[] = [];
    for (const skill of await alleSkills()) {
      const frontmatter = parseFrontmatter(await readFile(repoFile(skill), "utf8"));
      const description = frontmatter?.description;
      if (description !== undefined && !description.startsWith("Use when")) {
        verstoesse.push(`${skill}: ${description}`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("bleibt unter 500 Woertern", async () => {
    const zuLang: string[] = [];
    for (const skill of await alleSkills()) {
      const anzahl = wordCount(await readFile(repoFile(skill), "utf8"));
      if (anzahl >= 500) {
        zuLang.push(`${skill}: ${anzahl} Woerter`);
      }
    }
    expect(zuLang).toEqual([]);
  });
});
