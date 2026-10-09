import { renderProject } from "../steps/render.js";
import type { RunFn } from "../lib/ffmpeg.js";

/** Eingehakte Fassungen fuer den Test; ohne sie laeuft echter ffmpeg-Prozess. */
export interface RenderCommandDeps {
  run?: RunFn;
}

/** Die geprueften Argumente von `render`; null bedeutet Bedienfehler. */
interface RenderArgs {
  dir: string;
  allowOverflow: boolean;
  allowIncomplete: boolean;
}

/**
 * Liest Ordner und die Schalter `--allow-overflow` und `--allow-incomplete`.
 * Unbekannte Schalter sind ein Bedienfehler (null), kein stilles Ignorieren.
 */
function parseRenderArgs(args: string[]): RenderArgs | null {
  const positionals: string[] = [];
  let allowOverflow = false;
  let allowIncomplete = false;
  for (const arg of args) {
    if (arg === "--allow-overflow") {
      allowOverflow = true;
    } else if (arg === "--allow-incomplete") {
      allowIncomplete = true;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  const [dir] = positionals;
  if (positionals.length !== 1 || dir === undefined) return null;
  return { dir, allowOverflow, allowIncomplete };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `render <ordner> [--allow-overflow] [--allow-incomplete]`: rendert das
 * Projekt zum fertigen Video. Ueberlaenge und unfertige Bloecke verweigert
 * der Lauf, solange sie nicht ausdruecklich erlaubt sind; mit dem Schalter
 * rendert er und warnt.
 */
export async function runRender(args: string[], deps: RenderCommandDeps = {}): Promise<number> {
  const parsed = parseRenderArgs(args);
  if (parsed === null) {
    console.error(
      "Aufruf: videowizard render <ordner> [--allow-overflow] [--allow-incomplete]",
    );
    return 2;
  }
  try {
    const output = await renderProject(
      parsed.dir,
      { allowOverflow: parsed.allowOverflow, allowIncomplete: parsed.allowIncomplete },
      { run: deps.run },
    );
    console.log(`Fertig: ${output}`);
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `render`; eingetragen in der Befehlsliste in cli.ts. */
export const renderCommand = {
  name: "render",
  summary: "Rendert das Projekt zum fertigen Video.",
  run: runRender,
};
