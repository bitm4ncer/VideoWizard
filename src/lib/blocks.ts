import { readFile, readdir, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

/** Ein Werkzeug oder Dienst, den ein Baustein voraussetzt (Abschnitt 6). */
export interface BlockRequires {
  tools: string[];
  providers: string[];
}

/** Ein Eintrag in blocks/index.json (Abschnitt 6 der Spezifikation). */
export interface BlockEntry {
  id: string;
  kind: string;
  capability: string;
  purpose: string;
  inputs: string[];
  requires: BlockRequires;
  license: string;
  version: number;
  entry: string;
}

/** Ergebnis von loadBlock: der Eintrag und die Dateien seines Verzeichnisses. */
export interface LoadedBlock {
  entry: BlockEntry;
  /** Rekursive Dateiliste des Bausteinverzeichnisses, relativ zur Wurzel, sortiert. */
  files: string[];
}

/** Der Ordner der Bausteine unterhalb der Repo-Wurzel. */
const BLOCKS_DIR = "blocks";

function indexFile(root: string): string {
  return join(root, BLOCKS_DIR, "index.json");
}

function blocksDir(root: string): string {
  return join(root, BLOCKS_DIR);
}

/** Repo-Pfade reisen mit dem Plugin, deshalb immer mit Schraegstrich. */
function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** Haengt einen Posix-Pfad an einen Systempfad, ohne Trenner zu mischen. */
function joinPosix(base: string, path: string): string {
  return join(base, ...path.split("/"));
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Rekursive Dateiliste unterhalb von dir, in Fundreihenfolge. */
async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Prueft die Pflichtfelder aus Abschnitt 6, damit ein Tippfehler auffaellt. */
function parseEntry(raw: unknown, where: string): BlockEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Bausteinverzeichnis ${where}: Eintrag ist kein JSON-Objekt.`);
  }
  const record = raw as Record<string, unknown>;
  for (const field of ["id", "kind", "capability", "purpose", "license", "entry"]) {
    if (typeof record[field] !== "string" || record[field] === "") {
      throw new Error(`Bausteinverzeichnis ${where}: Feld "${field}" muss ein nichtleerer String sein.`);
    }
  }
  if (!isStringList(record["inputs"])) {
    throw new Error(`Bausteinverzeichnis ${where}: Feld "inputs" muss eine Liste von Strings sein.`);
  }
  const version = record["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error(`Bausteinverzeichnis ${where}: Feld "version" muss eine positive ganze Zahl sein.`);
  }
  const requires = record["requires"];
  if (
    typeof requires !== "object" || requires === null ||
    !isStringList((requires as Record<string, unknown>)["tools"]) ||
    !isStringList((requires as Record<string, unknown>)["providers"])
  ) {
    throw new Error(
      `Bausteinverzeichnis ${where}: Feld "requires" muss { tools, providers } als Stringlisten tragen.`,
    );
  }
  return record as unknown as BlockEntry;
}

/**
 * Liest blocks/index.json und prueft die Pflichtfelder. Der Loader liest nur,
 * er schreibt nie.
 */
export async function loadIndex(root: string): Promise<BlockEntry[]> {
  const file = indexFile(root);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Bausteinverzeichnis fehlt: ${file}`, { cause: error });
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Bausteinverzeichnis ist kein gueltiges JSON: ${file}`, { cause: error });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Bausteinverzeichnis ${file}: Inhalt ist kein JSON-Array.`);
  }
  return parsed.map((entry, index) => parseEntry(entry, `${file} (Eintrag ${index})`));
}

/**
 * Laedt einen Baustein ueber seine id. Ein unbekanntes id wirft mit dem Namen.
 * Ein Baustein besitzt das Verzeichnis seiner entry-Datei.
 */
export async function loadBlock(root: string, id: string): Promise<LoadedBlock> {
  const entries = await loadIndex(root);
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    const bekannt = entries.map((candidate) => candidate.id).join(", ");
    throw new Error(`Baustein unbekannt: ${id}. Bekannt: ${bekannt}`);
  }
  if (!(await isFile(joinPosix(blocksDir(root), entry.entry)))) {
    throw new Error(`Baustein ${id}: entry-Datei fehlt: ${BLOCKS_DIR}/${entry.entry}`);
  }
  const dir = posix.dirname(entry.entry);
  const files = (await listFiles(joinPosix(blocksDir(root), dir)))
    .map((file) => toPosix(relative(root, file)))
    .sort();
  return { entry, files };
}

/**
 * Prueft die Integritaet in beide Richtungen: Jeder Eintrag braucht seine
 * entry-Datei, und jede Datei unter blocks/ braucht einen Eintrag. Zurueck
 * kommt die Liste der Meldungen, leer heisst in Ordnung. blocks/index.json
 * selbst zaehlt nicht als Baustein (Abschnitt 6).
 */
export async function checkIntegrity(root: string): Promise<string[]> {
  const entries = await loadIndex(root);
  const meldungen: string[] = [];
  const verzeichnisse = new Set<string>();
  for (const entry of entries) {
    const dir = posix.dirname(entry.entry);
    verzeichnisse.add(dir === "." ? "" : dir);
    if (!(await isFile(joinPosix(blocksDir(root), entry.entry)))) {
      meldungen.push(`Eintrag ohne Datei: ${entry.id} erwartet ${BLOCKS_DIR}/${entry.entry}`);
    }
  }
  const rels = (await listFiles(blocksDir(root)))
    .map((file) => toPosix(relative(blocksDir(root), file)))
    .sort();
  for (const rel of rels) {
    if (rel === "index.json") {
      continue;
    }
    const gehoert = [...verzeichnisse].some(
      (dir) => dir === "" || rel === dir || rel.startsWith(`${dir}/`),
    );
    if (!gehoert) {
      meldungen.push(`Datei ohne Eintrag: ${BLOCKS_DIR}/${rel}`);
    }
  }
  return meldungen;
}
