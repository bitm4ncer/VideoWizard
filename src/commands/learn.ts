import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { repoRoot } from "../lib/brand.js";
import { localIsoDate } from "../lib/dates.js";
import { learningPath, renderLearning, slugify } from "../lib/learnings.js";

/** Eingehakte Abhaengigkeiten fuer den Test; ohne sie gelten Repo-Wurzel und Uhr. */
export interface LearnCommandDeps {
  root?: string;
  /** Feste Uhr fuer den Test; ohne sie gilt die aktuelle lokale Zeit. */
  now?: Date;
}

/** Die gepruefte Eingabe von `learn`; null bedeutet Bedienfehler. */
type LearnArgs = { title: string; source?: string; note?: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Liest den Titel sowie `--source` und `--note`. Genau eine Position; fehlende
 * Werte und unbekannte Schalter sind Bedienfehler (null), kein stilles
 * Ignorieren.
 */
function parseLearnArgs(args: string[]): LearnArgs | null {
  const positionals: string[] = [];
  let source: string | undefined;
  let note: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "--source" || arg === "--note") {
      const value = args[index + 1];
      if (value === undefined || value.trim() === "") return null;
      if (arg === "--source") source = value.trim();
      else note = value.trim();
      index += 1;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  const title = positionals[0];
  if (positionals.length !== 1 || title === undefined || title.trim() === "") return null;
  return { title: title.trim(), source, note };
}

/**
 * `learn "<Titel>" [--source "<Quelle>"] [--note "<Beobachtung>"]`: legt einen
 * datierten Eintrag im Belegarchiv an. Ein Titel ohne Buchstabe und ohne
 * Ziffer ergaebe einen Pfad ohne Namen und ist ein Bedienfehler. Ein
 * vorhandener Pfad wird nie ueberschrieben; der Befehl nennt am Ende nur den
 * Pfad.
 */
export async function runLearn(args: string[], deps: LearnCommandDeps = {}): Promise<number> {
  const parsed = parseLearnArgs(args);
  if (parsed === null) {
    console.error(
      'Aufruf: videowizard learn "<Titel>" [--source "<Quelle>"] [--note "<Beobachtung>"]',
    );
    return 2;
  }
  if (slugify(parsed.title) === "") {
    console.error(
      `Der Titel ergibt keinen Dateinamen: ${parsed.title} ` +
      "(es fehlt ein Buchstabe oder eine Ziffer).",
    );
    return 2;
  }
  const root = deps.root ?? repoRoot();
  const date = localIsoDate(deps.now);
  const file = learningPath(root, parsed.title, date);
  try {
    await mkdir(dirname(file), { recursive: true });
    // `wx` schlaegt fehl, wenn der Pfad schon da ist: nichts wird ueberschrieben.
    try {
      await writeFile(file, renderLearning({ ...parsed, date }), { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Der Eintrag existiert schon: ${file}`, { cause: error });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
  console.log(file);
  return 0;
}

/** Der Befehl `learn`; eingetragen in der Befehlsliste in cli.ts. */
export const learnCommand = {
  name: "learn",
  summary: "Legt einen datierten Eintrag im Belegarchiv an.",
  run: runLearn,
};
