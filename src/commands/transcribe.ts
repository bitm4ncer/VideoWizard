import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectPaths } from "../lib/paths.js";
import { sourceById } from "../lib/plan.js";
import { loadProject } from "../lib/project.js";
import { resolveTranscriptProvider } from "../lib/providers/transcript.js";
import { detectSilences } from "../lib/silence.js";
import type { RunFn } from "../lib/ffmpeg.js";
import type { TranscriptProvider } from "../lib/providers/transcript.js";

/** Eingehakte Abhaengigkeiten fuer den Test; ohne sie laeuft echter Dienst und ffmpeg. */
export interface TranscribeCommandDeps {
  provider?: TranscriptProvider;
  run?: RunFn;
}

/** Die geprueften Argumente von `transcribe`; null bedeutet Bedienfehler. */
interface TranscribeArgs {
  dir: string;
  sourceId: string;
}

/**
 * Liest Ordner und Quellenkennung. Genau zwei Argumente, keine Schalter:
 * fehlende Werte und unbekannte Schalter sind Bedienfehler (null).
 */
function parseTranscribeArgs(args: string[]): TranscribeArgs | null {
  const [dir, sourceId] = args;
  if (args.length !== 2 || dir === undefined || sourceId === undefined) return null;
  if (dir.startsWith("-") || sourceId.startsWith("-")) return null;
  return { dir, sourceId };
}

/**
 * Prueft, ob die Tonspur da ist. Nur ENOENT gilt als "fehlt"; andere Fehler
 * (etwa Rechte) reicht der Aufrufer als Fehler weiter.
 */
async function fileExists(file: string): Promise<boolean> {
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
 * `transcribe <ordner> <quelle>`: transkribiert die Tonspur der Quelle und
 * legt die Pausen dazu ab. Geschrieben werden sources/<id>/words.json und
 * sources/<id>/silences.json; project.json bleibt unberuehrt.
 */
export async function runTranscribe(
  args: string[],
  deps: TranscribeCommandDeps = {},
): Promise<number> {
  const parsed = parseTranscribeArgs(args);
  if (parsed === null) {
    console.error("Aufruf: videowizard transcribe <ordner> <quelle>");
    return 2;
  }
  try {
    const project = await loadProject(parsed.dir);
    const source = sourceById(project, parsed.sourceId);
    const sourceDir = join(projectPaths(parsed.dir).sourcesDir, source.id);
    const audioFile = join(sourceDir, "source.wav");
    if (!(await fileExists(audioFile))) {
      throw new Error(`Tonspur fehlt: ${audioFile}. Erst ingest laufen lassen.`);
    }
    const provider = deps.provider ?? resolveTranscriptProvider(project);
    // Beide Ergebnisse erst berechnen, dann schreiben: ein Fehler hinterlaesst
    // keine halbe Ausgabe.
    const words = await provider.transcribe(audioFile);
    const silences = await detectSilences(audioFile, { run: deps.run });
    await writeFile(
      join(sourceDir, "words.json"),
      `${JSON.stringify(words, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(sourceDir, "silences.json"),
      `${JSON.stringify(silences, null, 2)}\n`,
      "utf8",
    );
    console.log(`Transkript ${source.id}: ${words.length} Woerter, ${silences.length} Pausen`);
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `transcribe`; eingetragen in der Befehlsliste in cli.ts. */
export const transcribeCommand = {
  name: "transcribe",
  summary: "Transkribiert die Tonspur einer Quelle und erkennt die Pausen.",
  run: runTranscribe,
};
