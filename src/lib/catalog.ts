import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { BlockEntry } from "./blocks.js";
import { loadIndex } from "./blocks.js";

/** Die Gruppen unter skills/ in der Reihenfolge des Leitfadens. */
const SKILL_GROUPS: string[] = ["meta", "planning", "producing", "tools", "reference"];

/** Das einfache Frontmatter: einzeilige Werte zwischen zwei ---. */
interface Frontmatter {
  name?: string;
  description?: string;
}

/** Ein gefundener Skill mit Gruppe und rohem Frontmatter. */
interface CatalogSkill {
  /** Repo-relativer Posix-Pfad, zugleich die Adresse in Fehlerzeilen. */
  path: string;
  group: string;
  name?: string;
  description?: string;
}

/** Ein stabiler Vergleich, unabhaengig von der Spracheinstellung. */
function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Liest die erste Frontmatter; mehrzeilige Werte kommen nicht vor. */
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
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2].trim());
    }
  }
  return { name: values.get("name"), description: values.get("description") };
}

/** Alle SKILL.md unterhalb von dir; ein fehlendes Verzeichnis ist ein Fehler. */
async function listSkillFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Skillverzeichnis fehlt: ${dir}`, { cause: error });
    }
    throw error;
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listSkillFiles(full)));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(full);
    }
  }
  return found;
}

/** Findet alle Skills unter skills/ und liest ihre Frontmatter. */
async function discoverSkills(root: string): Promise<CatalogSkill[]> {
  const files = (await listSkillFiles(join(root, "skills"))).sort(compareStrings);
  const skills: CatalogSkill[] = [];
  for (const file of files) {
    const path = relative(root, file).split(sep).join("/");
    const parts = path.split("/");
    skills.push({
      path,
      group: parts[1] ?? "",
      ...parseFrontmatter(await readFile(file, "utf8")),
    });
  }
  return skills;
}

/** Eine Skill-Zeile; fehlende Pflichtfelder werden zur Fehlerzeile. */
function renderSkill(skill: CatalogSkill): string[] {
  const fehler: string[] = [];
  if (skill.name === undefined) {
    fehler.push(`FEHLER: ${skill.path} hat keinen name`);
  }
  if (skill.description === undefined) {
    fehler.push(`FEHLER: ${skill.path} hat keine description`);
  }
  if (fehler.length > 0) {
    return fehler;
  }
  return [`- **${skill.name}**: ${skill.description}`];
}

/** Eine Baustein-Zeile mit id, purpose und license. */
function renderBlock(entry: BlockEntry): string {
  return `- **${entry.id}**: ${entry.purpose} (Lizenz: ${entry.license})`;
}

/**
 * Baut den Katalog aus den Skill-Frontmattern und blocks/index.json.
 * Der Generator liest nur; die Ausgabe geht nach stdout.
 */
export async function buildCatalog(root: string): Promise<string> {
  const skills = await discoverSkills(root);
  const blocks = await loadIndex(root);

  const byGroup = new Map<string, CatalogSkill[]>();
  for (const skill of skills) {
    const vorhanden = byGroup.get(skill.group);
    if (vorhanden === undefined) {
      byGroup.set(skill.group, [skill]);
    } else {
      vorhanden.push(skill);
    }
  }

  const groups = [
    ...SKILL_GROUPS.filter((group) => byGroup.has(group)),
    ...[...byGroup.keys()].filter((group) => !SKILL_GROUPS.includes(group)).sort(compareStrings),
  ];

  const lines: string[] = [
    "# VideoWizard Katalog",
    "",
    "Erzeugt von `npm run catalog` aus den Skills unter `skills/` und den",
    "Bausteinen in `blocks/index.json`. Diese Datei wird nicht von Hand gepflegt.",
    "",
    "## Skills",
    "",
  ];

  for (const group of groups) {
    lines.push(`### ${group}`, "");
    for (const skill of byGroup.get(group) ?? []) {
      lines.push(...renderSkill(skill));
    }
    lines.push("");
  }

  lines.push("## Bausteine", "");
  for (const entry of [...blocks].sort((a, b) => compareStrings(a.id, b.id))) {
    lines.push(renderBlock(entry));
  }
  lines.push("");

  return lines.join("\n");
}
