import { resolve } from "node:path";
import { handoffDir, renderHandoff } from "../lib/handoff.js";
import { projectPaths } from "../lib/paths.js";
import type { RunFn } from "../lib/ffmpeg.js";

/** Eingehakte Abhaengigkeiten fuer den Test; ohne sie laeuft echter ffmpeg-Prozess. */
export interface HandoffCommandDeps {
  run?: RunFn;
}

/** Die geprueften Argumente von `handoff`; null bedeutet Bedienfehler. */
interface HandoffArgs {
  dir: string;
  out?: string;
  force: boolean;
}

/**
 * Liest Ordner, `--out <pfad>` und den Schalter `--force`. Unbekannte Schalter
 * und ein fehlender oder leerer Wert hinter --out sind Bedienfehler (null),
 * kein stilles Ignorieren: `--out ""` wuerde sonst im Arbeitsverzeichnis
 * landen.
 */
function parseHandoffArgs(args: string[]): HandoffArgs | null {
  const positionals: string[] = [];
  let out: string | undefined;
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--out") {
      const value = args[index + 1];
      if (value === undefined || value === "" || value.startsWith("-")) return null;
      out = value;
      index += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  const [dir] = positionals;
  if (positionals.length !== 1 || dir === undefined) return null;
  return { dir, out, force };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `handoff <ordner> [--out <pfad>] [--force]`: erzeugt aus dem Projekt einen
 * Diffusion-Studio-Projektordner (Einweg). Ohne --out landet er unter
 * handoff/diffusion-studio im Projekt; ein belegter Zielordner wird nur mit
 * --force ersetzt.
 */
export async function runHandoff(
  args: string[],
  deps: HandoffCommandDeps = {},
): Promise<number> {
  const parsed = parseHandoffArgs(args);
  if (parsed === null) {
    console.error("Aufruf: videowizard handoff <ordner> [--out <pfad>] [--force]");
    return 2;
  }
  try {
    const root = projectPaths(parsed.dir).dir;
    const target = parsed.out !== undefined ? resolve(parsed.out) : handoffDir(root);
    const result = await renderHandoff(root, target, { run: deps.run, force: parsed.force });
    console.log(`Hand-off geschrieben: ${result.index}`);
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `handoff`; eingetragen in der Befehlsliste in cli.ts. */
export const handoffCommand = {
  name: "handoff",
  summary: "Erzeugt aus dem Projekt einen Diffusion-Studio-Projektordner (Einweg).",
  run: runHandoff,
};
