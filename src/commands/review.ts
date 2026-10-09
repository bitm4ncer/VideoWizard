import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProject } from "../lib/project.js";
import { projectPaths } from "../lib/paths.js";
import { buildRenderPlan } from "../lib/renderplan.js";
import {
  analyzeOutput, DEFAULT_MASTER_LUFS, findingsFor, latestOutput, renderReviewMarkdown,
} from "../lib/review.js";
import type { RunFn } from "../lib/ffmpeg.js";

/** Eingehakte Abhaengigkeiten fuer den Test; ohne sie laufen echte Prozesse und die Uhr. */
export interface ReviewCommandDeps {
  run?: RunFn;
  now?: () => Date;
}

/** Die Datei, die der Lauf ins Projekt schreibt; bewusst neu, ein Messprotokoll. */
const REVIEW_FILE = "review.md";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Genau eine Position, der Ordner. Unbekannte Schalter sind ein
 * Bedienfehler (null), kein stilles Ignorieren.
 */
function parseReviewArgs(args: string[]): string | null {
  const positionals: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) return null;
    positionals.push(arg);
  }
  const [dir] = positionals;
  if (positionals.length !== 1 || dir === undefined) return null;
  return dir;
}

/**
 * Alle Dateien im Ausgabeordner mit ihrer Zeit. Fehlt der Ordner, gibt es
 * eine klare Meldung; einen anderen Fehler reicht der Aufrufer weiter.
 */
async function outputFiles(outDir: string): Promise<Array<{ name: string; mtimeMs: number }>> {
  let names: string[];
  try {
    names = await readdir(outDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Keine Ausgabe in ${outDir}: der Ordner fehlt.`, { cause: error });
    }
    throw error;
  }
  const files: Array<{ name: string; mtimeMs: number }> = [];
  for (const name of names) {
    try {
      const info = await stat(join(outDir, name));
      if (info.isFile()) files.push({ name, mtimeMs: info.mtimeMs });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return files;
}

/** Das Datum als JJJJ-MM-TT, wie die uebrigen Stempel im Repo. */
function todayStamp(now: () => Date): string {
  return now().toISOString().slice(0, 10);
}

/**
 * `review <ordner>`: prueft die neueste Ausgabe in `out/` gegen den
 * Renderplan. Die erwartete Dauer ist die Summe der Blockdauern aus
 * `buildRenderPlan`, der Soll-Pegel kommt aus `project.audio` mit der Vorgabe
 * -14. Das Messprotokoll landet als `review.md` im Projekt; vorhandene Fassungen
 * werden bewusst ersetzt. Der Befehl berichtet nur: Befunde lassen den
 * Exit-Code bei 0. Fehlt die Ausgabe oder scheitert die Messung, gibt es eine
 * klare Meldung und Exit 1.
 */
export async function runReview(args: string[], deps: ReviewCommandDeps = {}): Promise<number> {
  const dir = parseReviewArgs(args);
  if (dir === null) {
    console.error("Aufruf: videowizard review <ordner>");
    return 2;
  }
  try {
    const project = await loadProject(dir);
    const root = projectPaths(dir).dir;
    const outDir = join(root, "out");
    const files = await outputFiles(outDir);
    const latest = latestOutput(files);
    if (latest === null) {
      throw new Error(`Keine Ausgabe in ${outDir}: keine Ausgabedatei gefunden.`);
    }
    const output = join(outDir, latest);

    // Derselbe Plan wie im Render, nur ohne Abbruch: die Nachschau darf an
    // unfertigen oder ueberlangen Bloecken nicht scheitern.
    const plan = buildRenderPlan(project, { allowOverflow: true, allowIncomplete: true });
    const plannedDuration = plan.video.reduce((sum, segment) => sum + segment.duration, 0);
    const masterLufs = project.audio?.master_lufs ?? DEFAULT_MASTER_LUFS;

    const measurements = await analyzeOutput(output, { captionsExpected: true }, deps.run);
    const findings = findingsFor(measurements, plannedDuration, masterLufs);
    const date = todayStamp(deps.now ?? (() => new Date()));
    const reviewFile = join(root, REVIEW_FILE);
    await writeFile(
      reviewFile,
      renderReviewMarkdown(measurements, plannedDuration, masterLufs, findings, date),
      "utf8",
    );

    console.log(`Review geschrieben: ${reviewFile}`);
    if (findings.length === 0) {
      console.log("Keine Befunde.");
    } else {
      for (const finding of findings) console.log(`Befund: ${finding}`);
    }
    return 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `review`; eingetragen in der Befehlsliste in cli.ts. */
export const reviewCommand = {
  name: "review",
  summary: "Prueft die neueste Ausgabe gegen den Plan und schreibt review.md.",
  run: runReview,
};
