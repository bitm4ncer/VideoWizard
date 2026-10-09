/**
 * Der gemeinsame Vertrag der Sprachquellen (Spezifikation Abschnitt 4).
 *
 * Ein Workflow kennt nur die Faehigkeit "Stimme"; welcher Anbieter sie
 * erfuellt, steht in `project.capabilities.voice`. Heute gibt es nur
 * Voicebox. Weitere Anbieter implementieren denselben Vertrag.
 */

import type { Project } from "../types.js";
import { toVoiceboxOptions, voiceboxProvider } from "./voicebox.js";

// Die Voicebox-Quelle liegt in voicebox.ts; hier gilt der gemeinsame Vertrag.
export { toVoiceboxOptions, voiceboxProvider } from "./voicebox.js";
export type { VoiceboxOptions } from "./voicebox.js";

/** Wie das Netzwerk angefasst wird; einhakbar fuer Tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/** Wie gewartet wird; einhakbar fuer Tests. */
export type SleepFn = (ms: number) => Promise<void>;

/** Die einhakbaren Abhaengigkeiten eines Sprach-Anbieters. */
export interface VoiceDeps {
  /** Vorgabe: das echte fetch. */
  fetch?: FetchLike;
  /** Vorgabe: ein echter Timer. */
  sleep?: SleepFn;
  /** Wie die Uhr gelesen wird; Vorgabe: Date.now. Einhakbar fuer Fristen im Test. */
  now?: () => number;
  /** Hoechste Wartezeit eines Laufs in Millisekunden; die Vorgabe setzt der Anbieter. */
  maxWaitMs?: number;
}

/** Echte Zeichenzeiten einer Stimme; je Zeichen Start und Ende in Sekunden. */
export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Ein fertiger Sprach-Take. Voicebox liefert keine echten Zeichenzeiten,
 * deshalb ist `alignment` dort `null`; geschaetzte Werte gibt es nicht.
 */
export interface VoiceTake {
  audio: Buffer;
  alignment: Alignment | null;
}

/** Eine Sprachquelle hinter dem gemeinsamen Vertrag. */
export interface VoiceProvider {
  /** Kennung, etwa "voicebox". */
  id: string;
  /** Ist der Dienst bereit? Wirft nie; ein fehlender Dienst ist ein Zustand. */
  detect(): Promise<boolean>;
  /** Sprache erzeugen; `opts.language` schlaegt die Konfiguration. */
  speak(text: string, opts: { language?: string }): Promise<VoiceTake>;
}

/** Baut einen Anbieter aus den Optionen des Projekts. */
type VoiceBuilder = (options: Record<string, unknown>, deps: VoiceDeps) => VoiceProvider;

/** Die bekannten Sprach-Anbieter. Der Schluessel ist `capabilities.voice.provider`. */
const builders: Record<string, VoiceBuilder> = {
  voicebox: (options, deps) => voiceboxProvider(toVoiceboxOptions(options), deps),
};

/**
 * Waehlt den Sprach-Anbieter des Projekts. Ohne `capabilities.voice` oder mit
 * unbekanntem Namen wirft es mit klarer Meldung; es gibt keinen stillen
 * Vorgabewert.
 */
export function resolveVoiceProvider(project: Project, deps: VoiceDeps = {}): VoiceProvider {
  const choice = project.capabilities?.["voice"];
  const known = Object.keys(builders).join(", ");
  if (!choice?.provider) {
    throw new Error(
      `Kein Sprach-Anbieter gewaehlt: "capabilities.voice.provider" fehlt in project.json. ` +
      `Bekannt: ${known}.`,
    );
  }
  const build = builders[choice.provider];
  if (build === undefined) {
    throw new Error(`Unbekannter Sprach-Anbieter "${choice.provider}". Bekannt: ${known}.`);
  }
  return build(choice.options ?? {}, deps);
}
