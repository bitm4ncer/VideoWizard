import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { projectPaths } from "./paths.js";
import type { Project } from "./types.js";

/** Hoechstes Schema, das diese Fassung liest und schreibt. */
export const CURRENT_SCHEMA = 1;

/**
 * Prueft das Schema der Wahrheitsdatei. Ein neueres Schema wird nicht
 * stillschweigend als das aktuelle behandelt: Speichern wuerde sonst Felder
 * einer kuenftigen Fassung verlieren.
 */
function parseProject(raw: unknown, file: string): Project {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Projektdatei ${file}: Inhalt ist kein JSON-Objekt.`);
  }
  const record = raw as Record<string, unknown>;
  const schema = record["schema"];
  if (typeof schema !== "number" || !Number.isInteger(schema) || schema < 1) {
    throw new Error(`Projektdatei ${file}: "schema" muss eine positive ganze Zahl sein.`);
  }
  if (schema > CURRENT_SCHEMA) {
    throw new Error(
      `Projektdatei ${file}: "schema" ${schema} ist neuer als diese Fassung ` +
      `(bis ${CURRENT_SCHEMA}). Bitte VideoWizard aktualisieren.`,
    );
  }
  return record as unknown as Project;
}

async function readProjectFile(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Projektdatei fehlt: ${file}`, { cause: error });
    }
    throw error;
  }
}

export async function loadProject(dir: string): Promise<Project> {
  const { projectFile } = projectPaths(dir);
  const raw = await readProjectFile(projectFile);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Projektdatei ist kein gueltiges JSON: ${projectFile}`, { cause: error });
  }
  return parseProject(parsed, projectFile);
}

/** Atomar: erst in die Nebendatei schreiben, dann ueber das Ziel umbenennen. */
export async function saveProject(dir: string, project: Project): Promise<void> {
  const { projectFile } = projectPaths(dir);
  const tempFile = `${projectFile}.tmp`;
  await mkdir(dirname(projectFile), { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  try {
    await rename(tempFile, projectFile);
  } catch (error) {
    // Keine Nebendatei zuruecklassen; gemeldet wird der urspruengliche Fehler.
    await rm(tempFile, { force: true }).catch(() => undefined);
    throw error;
  }
}
