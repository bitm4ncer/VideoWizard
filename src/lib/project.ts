import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { projectPaths } from "./paths.js";
import type { Project } from "./types.js";

/** Hoechstes Schema, das diese Fassung liest und schreibt. */
export const CURRENT_SCHEMA = 1;

/** Wie oft der Tausch nach einem Windows-Konflikt wiederholt wird. */
const RENAME_ATTEMPTS = 5;
/** Wartezeit zwischen zwei Tauschversuchen; Windows gibt die Datei meist schnell frei. */
const RENAME_RETRY_MS = 50;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Nur EPERM und EBUSY lohnen einen zweiten Versuch; alles andere ist endgueltig. */
function isTransientRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EBUSY";
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !isTransientRenameError(error)) {
        throw error;
      }
      await wait(RENAME_RETRY_MS);
    }
  }
}

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

/**
 * Atomar: erst in eine eigene Nebendatei schreiben, dann ueber das Ziel
 * umbenennen. Der eindeutige Name haelt ueberlappende Laeufe auseinander;
 * der Tausch wird unter Windows bei EPERM oder EBUSY wiederholt.
 */
export async function saveProject(dir: string, project: Project): Promise<void> {
  const { projectFile } = projectPaths(dir);
  const tempFile = `${projectFile}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(projectFile), { recursive: true });
  try {
    await writeFile(tempFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    await renameWithRetry(tempFile, projectFile);
  } catch (error) {
    // Keine Nebendatei zuruecklassen, weder nach Schreib- noch nach Tauschfehler.
    await rm(tempFile, { force: true }).catch(() => undefined);
    throw error;
  }
}
