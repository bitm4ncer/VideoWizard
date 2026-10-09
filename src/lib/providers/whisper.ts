/**
 * Whisper als lokale Transkriptquelle.
 *
 * Das Kommando kommt als Vorlage aus `capabilities.transcript.options.command`
 * und kennt genau zwei Platzhalter: `{input}` ist die Audiodatei, `{outdir}`
 * ein temporaerer Ordner, den dieser Anbieter anlegt und danach entfernt.
 * Whisper-Flags kennt der Code nicht; sie stehen im Rezept
 * (whisper-ctranslate2, Quelle docs/en/CLI.md bzw. dessen README) und in der
 * Konfiguration. Das Rezept ist nachgeschlagen, nicht gegengeprueft.
 *
 * Die Ergebnisdatei wird gesucht, nicht geraten: bevorzugt
 * `<outdir>/<basisname>.json`, sonst die einzige `.json` im Ordner; sonst
 * wirft der Anbieter mit den gefundenen Dateien. Damit haengt er nicht an
 * einer bestimmten Namenskonvention.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type {
  TranscriptDeps,
  TranscriptProvider,
  TranscriptWord,
} from "./transcript.js";

/** Die Optionen des Whisper-Anbieters aus `capabilities.transcript.options`. */
export interface WhisperOptions {
  /** Kommando-Vorlage mit `{input}` und `{outdir}`, etwa `["whisper", ...]`. */
  command: string[];
}

/** Die klare Meldung, wenn die Kommando-Vorlage fehlt oder unbrauchbar ist. */
const COMMAND_HINT =
  'Whisper: "command" fehlt oder ist unbrauchbar in capabilities.transcript.options; ' +
  "erwartet wird eine nicht leere Liste von Argumenten.";

/**
 * Liest die bekannten Optionen. Die Kommando-Vorlage ist Pflicht: ohne sie
 * gibt es eine klare Meldung statt eines Aufrufs ins Leere.
 */
export function toWhisperOptions(options: Record<string, unknown> = {}): WhisperOptions {
  const raw = options["command"];
  if (!Array.isArray(raw)) throw new Error(COMMAND_HINT);
  const parts: unknown[] = raw;
  const command: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string" || part.trim() === "") throw new Error(COMMAND_HINT);
    command.push(part);
  }
  if (command.length === 0) throw new Error(COMMAND_HINT);
  return { command };
}

/** Die letzten Zeilen der Ausgabe; Fehler stehen am Ende. */
function tail(text: string, lines = 12): string {
  return text.trim().split("\n").slice(-lines).join("\n");
}

/**
 * Vorgabe fuer `runCommand`: fuehrt das Kommando aus und liefert dessen
 * Ausgabe. Scheitert der Lauf, nennt der Fehler das Kommando und das Ende der
 * Ausgabe.
 */
function runProcess(argv: string[]): Promise<string> {
  const [command, ...args] = argv;
  if (command === undefined) {
    return Promise.reject(new Error("Whisper-Kommando fehlt."));
  }
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const output = tail(stderr.trim() !== "" ? stderr : stdout);
          reject(
            new Error(
              `Whisper-Befehl scheiterte: ${argv.join(" ")}\n` +
              (output !== "" ? output : error.message),
              { cause: error },
            ),
          );
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/** Ist der Pfad eine vorhandene Datei? */
async function isFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

/**
 * Die Ergebnisdatei suchen: bevorzugt `<outdir>/<basisname>.json`, sonst die
 * einzige `.json` im Ordner. Alles andere ist ein Fehler, der die gefundenen
 * Dateien nennt.
 */
async function findResultFile(outdir: string, audioFile: string): Promise<string> {
  const base = basename(audioFile, extname(audioFile));
  const preferred = join(outdir, `${base}.json`);
  if (await isFile(preferred)) return preferred;

  const entries = await readdir(outdir);
  const jsons = entries.filter((name) => name.endsWith(".json"));
  if (jsons.length === 1) return join(outdir, jsons[0]!);

  const found = entries.length > 0 ? [...entries].sort().join(", ") : "keine Dateien";
  throw new Error(
    `Whisper: in ${outdir} liegt keine eindeutige JSON-Datei. ` +
    `Erwartet war "${base}.json"; gefunden: ${found}.`,
  );
}

/** Liest eine Sekundenangabe; fehlende oder kaputte Werte sind ein Fehler. */
function secondsOf(value: unknown, what: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`Whisper-JSON: ${what} fehlt oder ist keine Zahl.`);
}

/** Ein Segment der openai-Whisper-Form. */
interface WhisperSegment {
  start?: unknown;
  end?: unknown;
  text?: unknown;
  words?: Array<{ word?: unknown; start?: unknown; end?: unknown }>;
}

/**
 * Liest die openai-Whisper-Form:
 * `{ segments: [{ start, end, text, words?: [{ word, start, end }] }] }`.
 * Woerter werden getrimmt und nach `start` sortiert. Ein Segment ohne
 * Wortliste ergibt einen Eintrag mit seiner eigenen Zeitspanne und dem
 * Segmenttext. Ein leeres Ergebnis ist ein Fehler.
 */
export function parseWhisperJson(raw: string): TranscriptWord[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Whisper-JSON ist ungueltig: ${raw.slice(0, 200)}`, { cause: error });
  }

  const segments = (data as { segments?: unknown } | null)?.segments;
  const words: TranscriptWord[] = [];
  if (Array.isArray(segments)) {
    for (const entry of segments) {
      const segment = entry as WhisperSegment;
      if (Array.isArray(segment?.words) && segment.words.length > 0) {
        for (const word of segment.words) {
          const text = typeof word?.word === "string" ? word.word.trim() : "";
          if (text === "") continue;
          words.push({
            start: secondsOf(word.start, 'der "start" eines Wortes'),
            end: secondsOf(word.end, 'das "end" eines Wortes'),
            text,
          });
        }
      } else {
        const text = typeof segment?.text === "string" ? segment.text.trim() : "";
        if (text === "") continue;
        words.push({
          start: secondsOf(segment.start, 'der "start" eines Segments'),
          end: secondsOf(segment.end, 'das "end" eines Segments'),
          text,
        });
      }
    }
  }

  if (words.length === 0) {
    throw new Error("Whisper: keine Woerter erkannt (segments leer oder ohne Text).");
  }
  return words.sort((a, b) => a.start - b.start);
}

/**
 * Der Whisper-Anbieter hinter dem gemeinsamen Vertrag. `deps.runCommand` ist
 * einhakbar, damit der Test ohne echtes Whisper laeuft; der temporaere
 * Ausgabeordner wird in jedem Fall wieder entfernt.
 */
export function whisperProvider(cfg: WhisperOptions, deps: TranscriptDeps = {}): TranscriptProvider {
  const runCommand = deps.runCommand ?? runProcess;

  return {
    id: "whisper",
    detect: async () => {
      const [command] = cfg.command;
      if (command === undefined) return false;
      try {
        await runCommand([command, "--help"]);
        return true;
      } catch {
        return false;
      }
    },
    transcribe: async (audioFile) => {
      const outdir = await mkdtemp(join(tmpdir(), "videowizard-whisper-"));
      try {
        const argv = cfg.command.map((part) =>
          part.replaceAll("{input}", () => audioFile).replaceAll("{outdir}", () => outdir),
        );
        await runCommand(argv);
        const file = await findResultFile(outdir, audioFile);
        const raw = await readFile(file, "utf8");
        return parseWhisperJson(raw);
      } finally {
        await rm(outdir, { recursive: true, force: true });
      }
    },
  };
}
