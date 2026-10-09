/**
 * Der gemeinsame Vertrag der Musikquellen (Spezifikation Abschnitt 4).
 *
 * Ein Workflow kennt nur die Faehigkeit "Musik"; welcher Anbieter sie
 * erfuellt, steht in `project.capabilities.music`. ACE-Step und ElevenLabs
 * implementieren denselben Vertrag.
 */

import type { Project } from "../types.js";
import { acestepProvider, toAcestepOptions } from "./acestep.js";
import {
  elevenlabsMusicProvider,
  toElevenLabsMusicOptions,
} from "./elevenlabs_music.js";

/** Wie das Netzwerk angefasst wird; einhakbar fuer Tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/** Wie gewartet wird; einhakbar fuer Tests. */
export type SleepFn = (ms: number) => Promise<void>;

/** Die einhakbaren Abhaengigkeiten eines Musik-Anbieters. */
export interface MusicDeps {
  /** Vorgabe: das echte fetch. */
  fetch?: FetchLike;
  /** Vorgabe: ein echter Timer. */
  sleep?: SleepFn;
  /** Wie die Uhr gelesen wird; Vorgabe: Date.now. Einhakbar fuer Fristen im Test. */
  now?: () => number;
  /** Hoechste Wartezeit eines Laufs in Millisekunden; die Vorgabe setzt der Anbieter. */
  maxWaitMs?: number;
  /** Die Umgebung fuer Geheimnisse; Vorgabe: process.env. Einhakbar fuer Tests. */
  env?: Record<string, string | undefined>;
  /**
   * Der Projektordner, gegen den eine relative Schluesseldatei aufgeloest
   * wird. Fehlt er, gilt der Pfad so, wie er dasteht.
   */
  baseDir?: string;
}

/** Ein Take-Wunsch an einen Musik-Anbieter. */
export interface MusicRequest {
  /** Klangbeschreibung, etwa "deep house, 124 bpm". */
  prompt: string;
  /** Laenge des Takes in Sekunden. */
  seconds: number;
  /** Fester Seed, macht eine Fassung wiederholbar. */
  seed?: number;
}

/** Eine Musikquelle hinter dem gemeinsamen Vertrag. */
export interface MusicProvider {
  /** Kennung, etwa "acestep". */
  id: string;
  /** Ist der Dienst bereit? Wirft nie; ein fehlender Dienst ist ein Zustand. */
  detect(): Promise<boolean>;
  /** Einen Take erzeugen und die Audiodatei liefern. */
  generate(req: MusicRequest): Promise<Buffer>;
}

/** Baut einen Anbieter aus den Optionen des Projekts. */
type MusicBuilder = (options: Record<string, unknown>, deps: MusicDeps) => MusicProvider;

/** Die bekannten Musik-Anbieter. Der Schluessel ist `capabilities.music.provider`. */
const builders: Record<string, MusicBuilder> = {
  acestep: (options, deps) => acestepProvider(toAcestepOptions(options), deps),
  elevenlabs: (options, deps) =>
    elevenlabsMusicProvider(toElevenLabsMusicOptions(options), deps),
};

/**
 * Waehlt den Musik-Anbieter des Projekts. Ohne `capabilities.music` oder mit
 * unbekanntem Namen wirft es mit klarer Meldung; es gibt keinen stillen
 * Vorgabewert.
 */
export function resolveMusicProvider(project: Project, deps: MusicDeps = {}): MusicProvider {
  const choice = project.capabilities?.["music"];
  const known = Object.keys(builders).join(", ");
  if (!choice?.provider) {
    throw new Error(
      `Kein Musik-Anbieter gewaehlt: "capabilities.music.provider" fehlt in project.json. ` +
      `Bekannt: ${known}.`,
    );
  }
  const build = builders[choice.provider];
  if (build === undefined) {
    throw new Error(`Unbekannter Musik-Anbieter "${choice.provider}". Bekannt: ${known}.`);
  }
  return build(choice.options ?? {}, deps);
}
