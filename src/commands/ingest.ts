import { ingest } from "../steps/ingest.js";
import type { RunFn } from "../lib/ffmpeg.js";

/** Eingehakte Fassungen fuer den Test; ohne sie laeuft echter ffmpeg-Prozess. */
export interface IngestCommandDeps {
  run?: RunFn;
}

/** Die geprueften Argumente von `ingest`; null bedeutet Bedienfehler. */
interface IngestArgs {
  dir: string;
  video: string;
  label: string;
}

/**
 * Liest Ordner, Video und das optionale Label. Unbekannte Schalter und
 * fehlende Werte sind Bedienfehler (null), kein stilles Ignorieren.
 */
function parseIngestArgs(args: string[]): IngestArgs | null {
  const positionals: string[] = [];
  let label = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "--label") {
      const value = args[index + 1];
      if (value === undefined) return null;
      label = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  const [dir, video] = positionals;
  if (positionals.length !== 2 || dir === undefined || video === undefined) return null;
  return { dir, video, label };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `ingest <ordner> <video> [--label <text>]`: liest eine Aufnahme ein und
 * meldet die neue Quelle. Ohne Label gilt der Dateiname.
 */
export async function runIngest(args: string[], deps: IngestCommandDeps = {}): Promise<number> {
  const parsed = parseIngestArgs(args);
  if (parsed === null) {
    console.error("Aufruf: videowizard ingest <ordner> <video> [--label <text>]");
    return 2;
  }
  try {
    const source = await ingest(parsed.dir, parsed.video, parsed.label, { run: deps.run });
    console.log(`Quelle ${source.id} aufgenommen: ${source.label}`);
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `ingest`; eingetragen in der Befehlsliste in cli.ts. */
export const ingestCommand = {
  name: "ingest",
  summary: "Liest eine Aufnahme in den Projektordner ein.",
  run: runIngest,
};
