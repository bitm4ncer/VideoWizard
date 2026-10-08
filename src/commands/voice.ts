import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeDuration } from "../lib/ffmpeg.js";
import { ttsHash } from "../lib/hash.js";
import { projectPaths } from "../lib/paths.js";
import { loadProject, saveProject } from "../lib/project.js";
import { resolveVoiceProvider } from "../lib/providers/voice.js";
import type { RunFn } from "../lib/ffmpeg.js";
import type { VoiceProvider } from "../lib/providers/voice.js";

/** Eingehakte Abhaengigkeiten fuer den Test; ohne sie laeuft echter Dienst und ffprobe. */
export interface VoiceCommandDeps {
  provider?: VoiceProvider;
  run?: RunFn;
}

/**
 * Die Endung der Tondatei je Anbieter. Der Sprach-Vertrag kennt kein
 * Formatfeld; Voicebox liefert WAV. Ein neuer Anbieter traegt seine Endung
 * hier ein, bevor er verdrahtet wird.
 */
const AUDIO_EXTENSIONS: Record<string, string> = { voicebox: "wav" };

/** Was der Lauf erzeugt, uebersprungen und nicht geschafft hat. */
interface VoiceReport {
  generated: string[];
  skipped: string[];
  failed: Array<{ id: string; message: string }>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `voice <ordner>`: vertont jeden Block, dessen Text da ist und dessen Ton
 * fehlt oder veraltet ist. Ein Block ohne Text wird uebersprungen, ein Block
 * mit passendem Hash nicht angefasst. Ein Blockfehler stoppt den Lauf nicht:
 * der Block behaelt seinen alten Ton, die uebrigen werden gespeichert.
 */
export async function runVoice(args: string[], deps: VoiceCommandDeps = {}): Promise<number> {
  const dir = args.length === 1 ? args[0] : undefined;
  if (dir === undefined || dir.startsWith("-")) {
    console.error("Aufruf: videowizard voice <ordner>");
    return 2;
  }
  try {
    const project = await loadProject(dir);
    const provider = deps.provider ?? resolveVoiceProvider(project);
    const extension = AUDIO_EXTENSIONS[provider.id];
    if (extension === undefined) {
      throw new Error(
        `Fuer den Sprach-Anbieter "${provider.id}" ist keine Ton-Endung hinterlegt. ` +
        `Bekannt: ${Object.keys(AUDIO_EXTENSIONS).join(", ")}.`,
      );
    }
    const paths = projectPaths(dir);
    await mkdir(paths.ttsDir, { recursive: true });

    const report: VoiceReport = { generated: [], skipped: [], failed: [] };
    for (const block of project.blocks) {
      const spoken = block.text?.trim();
      if (spoken === undefined || spoken === "") {
        report.skipped.push(block.id);
        continue;
      }
      const hash = ttsHash(spoken, provider.id);
      if (block.tts?.hash === hash) {
        report.skipped.push(block.id);
        continue;
      }

      // Erst neben die Zieldatei schreiben und messen, dann umbenennen:
      // scheitert die Messung, bleibt der alte Ton unberuehrt.
      const target = join(paths.ttsDir, `${block.id}.${extension}`);
      const temp = `${target}.tmp`;
      try {
        const take = await provider.speak(spoken, { language: project.language.output });
        await writeFile(temp, take.audio);
        const duration = await probeDuration(temp, deps.run);
        await rename(temp, target);
        block.tts = {
          file: `audio/tts/${block.id}.${extension}`,
          duration,
          hash,
          generated_at: new Date().toISOString(),
        };
        report.generated.push(block.id);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        report.failed.push({ id: block.id, message: errorText(error) });
      }
    }

    await saveProject(dir, project);
    console.log(
      `Stimme: ${report.generated.length} erzeugt, ${report.skipped.length} uebersprungen, ` +
      `${report.failed.length} fehlgeschlagen`,
    );
    for (const failure of report.failed) {
      console.error(`Fehler: Block ${failure.id}: ${failure.message}`);
    }
    return report.failed.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Fehler: ${errorText(error)}`);
    return 1;
  }
}

/** Der Befehl `voice`; eingetragen in der Befehlsliste in cli.ts. */
export const voiceCommand = {
  name: "voice",
  summary: "Vertont Bloecke mit fehlendem oder veraltetem Ton.",
  run: runVoice,
};
