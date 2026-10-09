import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectPaths } from "../lib/paths.js";
import { addBlock, sourceById } from "../lib/plan.js";
import { loadProject, saveProject } from "../lib/project.js";
import { buildBlocks } from "../lib/segment.js";
import type { TranscriptWord } from "../lib/providers/transcript.js";

/** Die geprueften Argumente von `segment`; null bedeutet Bedienfehler. */
interface SegmentArgs {
  dir: string;
  sourceId: string;
  /** true, wenn ein erneuter Lauf ausdruecklich erlaubt ist (--force). */
  force: boolean;
}

/**
 * Liest Ordner, Quellenkennung und den Schalter `--force`. Genau zwei
 * Argumente; fehlende Werte und unbekannte Schalter sind Bedienfehler (null),
 * kein stilles Ignorieren.
 */
function parseSegmentArgs(args: string[]): SegmentArgs | null {
  const positionals: string[] = [];
  let force = false;
  for (const arg of args) {
    if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  const [dir, sourceId] = positionals;
  if (positionals.length !== 2 || dir === undefined || sourceId === undefined) return null;
  return { dir, sourceId, force };
}

/**
 * Liest eine JSON-Datei; fehlt sie (ENOENT), kommt undefined zurueck, damit
 * der Aufrufer den Unterschied zwischen "fehlt" und "kaputt" kennt.
 */
async function readJson(file: string): Promise<unknown | undefined> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Datei ist kein gueltiges JSON: ${file}`, { cause: error });
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `segment <ordner> <quelle> [--force]`: teilt das Transkript der Quelle in
 * Bloecke und haengt sie hinten an das Projekt an (kein inbox). Verweist
 * bereits ein Block auf die Quelle, verweigert der Lauf, damit ein
 * versehentlicher zweiter Lauf die Aufnahme nicht doppelt ins Video legt;
 * mit --force haengt er trotzdem weitere Bloecke an und warnt. words.json ist
 * Pflicht; fehlt silences.json, wird ohne Pausen segmentiert und gewarnt.
 * Gespeichert wird atomar ueber saveProject.
 */
export async function runSegment(args: string[]): Promise<number> {
  const parsed = parseSegmentArgs(args);
  if (parsed === null) {
    console.error("Aufruf: videowizard segment <ordner> <quelle> [--force]");
    return 2;
  }
  try {
    const project = await loadProject(parsed.dir);
    const source = sourceById(project, parsed.sourceId);
    const alreadySegmented = project.blocks.some((block) => block.source_id === source.id);
    if (alreadySegmented && !parsed.force) {
      throw new Error(
        `Quelle ${source.id} ist bereits segmentiert. ` +
        `Erst die vorhandenen Bloecke entfernen, oder --force setzen.`,
      );
    }
    if (alreadySegmented) {
      console.warn(
        `Warnung: Quelle ${source.id} ist bereits segmentiert; ` +
        `haenge wegen --force weitere Bloecke an.`,
      );
    }
    const sourceDir = join(projectPaths(parsed.dir).sourcesDir, source.id);

    const wordsFile = join(sourceDir, "words.json");
    const rawWords = await readJson(wordsFile);
    if (rawWords === undefined) {
      throw new Error(`Wortdatei fehlt: ${wordsFile}. Erst transcribe laufen lassen.`);
    }
    if (!Array.isArray(rawWords)) {
      throw new Error(`Wortdatei ist keine Liste: ${wordsFile}`);
    }
    const words = rawWords as TranscriptWord[];

    let silences: Array<[number, number]> = [];
    const silencesFile = join(sourceDir, "silences.json");
    const rawSilences = await readJson(silencesFile);
    if (rawSilences === undefined) {
      console.warn(`Warnung: ${silencesFile} fehlt; segmentiere ohne Pausen.`);
    } else if (!Array.isArray(rawSilences)) {
      throw new Error(`Pausendatei ist keine Liste: ${silencesFile}`);
    } else {
      silences = rawSilences as Array<[number, number]>;
    }

    const fresh = buildBlocks(words, silences, {
      sourceId: source.id,
      existingIds: project.blocks.map((block) => block.id),
    });
    for (const block of fresh) addBlock(project, block);
    await saveProject(parsed.dir, project);
    console.log(`Segmentiert: ${fresh.length} Bloecke`);
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `segment`; eingetragen in der Befehlsliste in cli.ts. */
export const segmentCommand = {
  name: "segment",
  summary: "Teilt das Transkript einer Quelle in Bloecke; --force wiederholt den Lauf.",
  run: runSegment,
};
