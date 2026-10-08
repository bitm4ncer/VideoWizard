import { stat } from "node:fs/promises";
import { projectPaths } from "../lib/paths.js";
import { loadProject } from "../lib/project.js";

/**
 * Prueft, ob die Wahrheitsdatei da ist. Nur ENOENT gilt als "fehlt"; andere
 * Fehler (etwa Rechte) reicht der Aufrufer als Fehler weiter.
 */
async function projectFileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `status [ordner]`: meldet, ob im Ordner ein Projekt liegt. Ein leerer
 * Ordner ist kein Fehler (Code 0); ein kaputtes Projekt ist einer (Code 1).
 */
async function runStatus(args: string[]): Promise<number> {
  if (args.length > 1) {
    console.error("Aufruf: videowizard status [ordner]");
    return 2;
  }
  const dir = args[0] ?? ".";
  const { dir: absolute, projectFile } = projectPaths(dir);
  try {
    if (!(await projectFileExists(projectFile))) {
      console.log(`kein Projekt in ${absolute}`);
      return 0;
    }
    const project = await loadProject(dir);
    console.log(`Projekt "${project.title}" (${project.id}) in ${absolute}`);
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `status`; eingetragen in der Befehlsliste in cli.ts. */
export const statusCommand = {
  name: "status",
  summary: "Zeigt den Stand eines Projekts im Ordner.",
  run: runStatus,
};
