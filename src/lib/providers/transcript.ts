/**
 * Der gemeinsame Vertrag der Transkriptquellen (Spezifikation Abschnitt 4).
 *
 * Ein Workflow kennt nur die Faehigkeit "Transkript"; welcher Anbieter sie
 * erfuellt, steht in `project.capabilities.transcript`. Heute gibt es nur
 * Whisper als lokalen Anbieter. Weitere Anbieter implementieren denselben
 * Vertrag.
 */

import type { Project } from "../types.js";
import { toWhisperOptions, whisperProvider } from "./whisper.js";

// Die Whisper-Quelle liegt in whisper.ts; hier gilt der gemeinsame Vertrag.
export { toWhisperOptions, whisperProvider } from "./whisper.js";
export type { WhisperOptions } from "./whisper.js";

/** Wie ein externes Kommando ausgefuehrt wird; einhakbar fuer Tests. */
export type RunCommandFn = (argv: string[]) => Promise<string>;

/** Die einhakbaren Abhaengigkeiten eines Transkript-Anbieters. */
export interface TranscriptDeps {
  /** Vorgabe: ein echter Prozessstart via execFile. */
  runCommand?: RunCommandFn;
}

/** Ein erkanntes Wort mit seinen echten Zeiten in Sekunden. */
export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

/** Eine Transkriptquelle hinter dem gemeinsamen Vertrag. */
export interface TranscriptProvider {
  /** Kennung, etwa "whisper". */
  id: string;
  /** Ist das Kommando bereit? Wirft nie; ein fehlendes Programm ist ein Zustand. */
  detect(): Promise<boolean>;
  /** Eine Audiodatei transkribieren und die Woerter mit echten Zeiten liefern. */
  transcribe(audioFile: string): Promise<TranscriptWord[]>;
}

/** Baut einen Anbieter aus den Optionen des Projekts. */
type TranscriptBuilder = (
  options: Record<string, unknown>,
  deps: TranscriptDeps,
) => TranscriptProvider;

/** Die bekannten Transkript-Anbieter. Der Schluessel ist `capabilities.transcript.provider`. */
const builders: Record<string, TranscriptBuilder> = {
  whisper: (options, deps) => whisperProvider(toWhisperOptions(options), deps),
};

/**
 * Waehlt den Transkript-Anbieter des Projekts. Ohne `capabilities.transcript`
 * oder mit unbekanntem Namen wirft es mit klarer Meldung; es gibt keinen
 * stillen Vorgabewert.
 */
export function resolveTranscriptProvider(
  project: Project,
  deps: TranscriptDeps = {},
): TranscriptProvider {
  const choice = project.capabilities?.["transcript"];
  const known = Object.keys(builders).join(", ");
  if (!choice?.provider) {
    throw new Error(
      `Kein Transkript-Anbieter gewaehlt: "capabilities.transcript.provider" fehlt in project.json. ` +
      `Bekannt: ${known}.`,
    );
  }
  const build = builders[choice.provider];
  if (build === undefined) {
    throw new Error(`Unbekannter Transkript-Anbieter "${choice.provider}". Bekannt: ${known}.`);
  }
  return build(choice.options ?? {}, deps);
}
