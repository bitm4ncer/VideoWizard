import { stat } from "node:fs/promises";
import { projectPaths } from "../lib/paths.js";
import { blockStatus } from "../lib/plan.js";
import { loadProject } from "../lib/project.js";
import { resolveVoiceProvider } from "../lib/providers/voice.js";
import type { Block, Project } from "../lib/types.js";

/** So viele Zeichen des Blocktextes zeigt `status` je Block. */
const TEXT_PREVIEW = 40;

/** Eine Zeile je Block: Kennung, Zustand und der Anfang des Textes. */
function blockLine(block: Block, idWidth: number, voiceId?: string): string {
  const preview = block.text?.trim().replace(/\s+/g, " ") ?? "";
  const shown = preview === ""
    ? "(kein Text)"
    : preview.length > TEXT_PREVIEW
      ? `${preview.slice(0, TEXT_PREVIEW)}...`
      : preview;
  return `  ${block.id.padEnd(idWidth)}  ${blockStatus(block, voiceId).padEnd(5)}  ${shown}`;
}

/**
 * Die Kennung des Sprach-Anbieters, wenn die Stimmen-Faehigkeit aufloesbar
 * ist; sonst undefined. Der Aufruf fragt keinen Dienst, er liest nur die
 * Projektwahl; ohne aufloesbare Faehigkeit bleibt es beim bisherigen Urteil.
 */
function resolvedVoiceId(project: Project): string | undefined {
  try {
    return resolveVoiceProvider(project).id;
  } catch {
    return undefined;
  }
}

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
 * Je Block nennt die Zeile Kennung, Zustand und Textanfang; mit einer
 * aufloesbaren Stimmen-Faehigkeit erkennt der Zustand veralteten Ton.
 */
export async function runStatus(args: string[]): Promise<number> {
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
    const voiceId = resolvedVoiceId(project);
    console.log(`Projekt "${project.title}" (${project.id}) in ${absolute}`);
    if (project.blocks.length > 0) {
      const idWidth = Math.max(...project.blocks.map((block) => block.id.length));
      for (const block of project.blocks) console.log(blockLine(block, idWidth, voiceId));
    }
    // Offen ist, was nicht "ok" ist: ohne Text oder Ton (todo) oder mit
    // veraltetem Ton (stale).
    const open = project.blocks.filter((block) => blockStatus(block, voiceId) !== "ok").length;
    console.log(`offene Bloecke: ${open} von ${project.blocks.length}`);
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
