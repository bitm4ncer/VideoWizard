import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { projectPaths } from "../lib/paths.js";
import { loadProject, saveProject } from "../lib/project.js";
import { resolveMusicProvider } from "../lib/providers/music.js";
import type { MusicProvider } from "../lib/providers/music.js";
import type { Project } from "../lib/types.js";

/** Eingehakte Abhaengigkeit fuer den Test; ohne sie waehlt das Projekt den Anbieter. */
export interface MusicCommandDeps {
  provider?: MusicProvider;
}

/**
 * Die Endung der Musikdatei je Anbieter. Der Musik-Vertrag kennt kein
 * Formatfeld; ACE-Step liefert WAV, ElevenLabs MP3. Ein neuer Anbieter traegt
 * seine Endung hier ein, bevor er verdrahtet wird; ein unbekannter Anbieter
 * wirft mit klarer Meldung, statt eine Datei ohne Endung anzulegen.
 */
const AUDIO_EXTENSIONS: Record<string, string> = { acestep: "wav", elevenlabs: "mp3" };

/** Die Vorgaben des Musikbetts laut Vertrag; der Render zieht sie sonst selbst heran. */
const DEFAULT_MUSIC_GAIN_DB = -22;
const DEFAULT_DUCK_DB = -12;

/** Die gepruefte Eingabe von `music`; null bedeutet Bedienfehler. */
type MusicArgs =
  | { kind: "file"; dir: string; file: string }
  | { kind: "generate"; dir: string; prompt: string; seconds?: number; yes: boolean };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Liest Ordner sowie entweder die zu uebernehmende Datei oder `generate` mit
 * `--prompt`, `--seconds` und `--yes`. Genau zwei Positionen; fehlende Werte
 * und unbekannte Schalter sind Bedienfehler (null), kein stilles Ignorieren.
 * Die Erzeugungs-Schalter sind ohne `generate` fremd.
 */
function parseMusicArgs(args: string[]): MusicArgs | null {
  const positionals: string[] = [];
  let prompt: string | undefined;
  let seconds: number | undefined;
  let yes = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "--yes") {
      yes = true;
    } else if (arg === "--prompt" || arg === "--seconds") {
      const value = args[index + 1];
      if (value === undefined) return null;
      if (arg === "--prompt") {
        if (value.trim() === "") return null;
        prompt = value.trim();
      } else {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return null;
        seconds = number;
      }
      index += 1;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positionals.push(arg);
    }
  }
  const [dir, second] = positionals;
  if (positionals.length !== 2 || dir === undefined || second === undefined) return null;
  if (second === "generate") {
    if (prompt === undefined) return null;
    return { kind: "generate", dir, prompt, seconds, yes };
  }
  if (prompt !== undefined || seconds !== undefined || yes) return null;
  return { kind: "file", dir, file: second };
}

/**
 * Meldet eine vorhandene Musik mit Datei und Werten, bevor sie ersetzt wird;
 * ohne diese Zeile ginge sie still verloren. Fehlende Werte gelten als die
 * Vorgaben des Vertrags.
 */
function reportExisting(project: Project): void {
  const existing = project.audio?.music;
  if (existing === undefined) return;
  console.log(
    `Vorhandene Musik: ${existing.file} ` +
    `(gain_db ${existing.gain_db ?? DEFAULT_MUSIC_GAIN_DB}, ` +
    `duck_db ${existing.duck_db ?? DEFAULT_DUCK_DB}) wird ersetzt.`,
  );
}

/** Traegt die Musik mit den Vorgaben ein; die uebrigen Tonwerte bleiben. */
function setMusic(project: Project, file: string): void {
  project.audio = {
    ...project.audio,
    music: { file, gain_db: DEFAULT_MUSIC_GAIN_DB, duck_db: DEFAULT_DUCK_DB },
  };
}

/**
 * `music <ordner> <datei>`: kopiert die Datei nach `audio/music.<endung>`
 * (fehlt `audio`, wird es angelegt) und traegt sie mit den Vorgaben ein. Erst
 * nach erfolgreichem Kopieren wird die Projektdatei angefasst.
 */
async function adoptMusic(dir: string, project: Project, source: string): Promise<number> {
  const extension = extname(source).slice(1).toLowerCase();
  if (extension === "") {
    throw new Error(`Die Datei ${source} hat keine Endung; erwartet wird etwa .wav oder .mp3.`);
  }

  const relative = `audio/music.${extension}`;
  const target = join(projectPaths(dir).dir, relative);
  const temp = `${target}.tmp`;
  try {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, temp);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Musikdatei fehlt: ${source}`, { cause: error });
    }
    throw error;
  }

  reportExisting(project);
  setMusic(project, relative);
  await saveProject(dir, project);
  console.log(`Musik uebernommen: ${relative} (gain_db ${DEFAULT_MUSIC_GAIN_DB}, duck_db ${DEFAULT_DUCK_DB})`);
  return 0;
}

/**
 * Die Summe der Stimmdauern und Pausen aller vertonten Bloecke. Bloecke ohne
 * Ton zaehlen nicht: sie kommen auch im Render nicht in die Tonspur.
 */
function voiceLength(project: Project): number {
  let total = 0;
  for (const block of project.blocks) {
    const tts = block.tts;
    if (tts === undefined) continue;
    total += tts.duration + (block.pause_after ?? 0);
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * `music <ordner> generate --prompt "<text>" [--seconds N] [--yes]`: bestimmt
 * die Laenge (ohne `--seconds` aus den Stimmdauern und Pausen), verlangt fuer
 * den bezahlten Aufruf `--yes` und legt die erzeugte Datei erst nach einem
 * erfolgreichen Lauf in der Projektdatei ab.
 */
async function generateMusic(
  dir: string,
  project: Project,
  args: { prompt: string; seconds?: number; yes: boolean },
  hooked?: MusicProvider,
): Promise<number> {
  const provider = hooked ?? resolveMusicProvider(project, { baseDir: projectPaths(dir).dir });
  const extension = AUDIO_EXTENSIONS[provider.id];
  if (extension === undefined) {
    throw new Error(
      `Fuer den Musik-Anbieter "${provider.id}" ist keine Ton-Endung hinterlegt. ` +
      `Bekannt: ${Object.keys(AUDIO_EXTENSIONS).join(", ")}.`,
    );
  }

  const seconds = args.seconds ?? voiceLength(project);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      "Ohne --seconds ist die Laenge die Summe der Stimmdauern und Pausen; " +
      "hier ist sie 0, weil kein Block vertont ist. Nutze --seconds N.",
    );
  }

  if (!args.yes) {
    throw new Error(
      `Musik erzeugen beim Anbieter "${provider.id}" fuer ${seconds} Sekunden kostet Geld. ` +
      "Zum Ausfuehren --yes setzen.",
    );
  }

  const relative = `audio/music.${extension}`;
  const target = join(projectPaths(dir).dir, relative);
  const temp = `${target}.tmp`;
  try {
    const audio = await provider.generate({ prompt: args.prompt, seconds });
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temp, audio);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }

  reportExisting(project);
  setMusic(project, relative);
  await saveProject(dir, project);
  console.log(`Musik erzeugt: ${relative} (${provider.id}, ${seconds} Sekunden)`);
  return 0;
}

/**
 * `music <ordner> <datei>` uebernimmt eine vorhandene Datei,
 * `music <ordner> generate --prompt "<text>" [--seconds N] [--yes]` erzeugt
 * eine neue. Bedienfehler sind Code 2, Laufzeitfehler Code 1.
 */
export async function runMusic(args: string[], deps: MusicCommandDeps = {}): Promise<number> {
  const parsed = parseMusicArgs(args);
  if (parsed === null) {
    console.error("Aufruf: videowizard music <ordner> <datei>");
    console.error(
      '        videowizard music <ordner> generate --prompt "<text>" [--seconds N] [--yes]',
    );
    return 2;
  }
  try {
    const project = await loadProject(parsed.dir);
    if (parsed.kind === "generate") {
      return await generateMusic(parsed.dir, project, parsed, deps.provider);
    }
    return await adoptMusic(parsed.dir, project, parsed.file);
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `music`; eingetragen in der Befehlsliste in cli.ts. */
export const musicCommand = {
  name: "music",
  summary: "Uebernimmt eine Musikdatei oder erzeugt das Musikbett.",
  run: runMusic,
};
