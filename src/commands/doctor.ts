import { capabilities, detect, renderReport } from "../lib/capabilities.js";
import { DEFAULT_BASE_URL, acestepProvider } from "../lib/providers/acestep.js";
import { elevenlabsMusicProvider } from "../lib/providers/elevenlabs_music.js";
import { voiceboxProvider } from "../lib/providers/voicebox.js";
import type { ProviderFactories } from "../lib/capabilities.js";

/** Adresse von Voicebox, wenn kein Projekt sie nennt. */
const VOICEBOX_URL = "http://127.0.0.1:17493";

/**
 * Der Doctor hat kein Projekt: Dienst- und Schluessel-Anbieter werden mit
 * ihren Vorgaben gebaut, ACE-Step auf http://127.0.0.1:8001, Voicebox auf
 * http://127.0.0.1:17493. Programme wie ffmpeg und whisper prueft die
 * Registry selbst.
 *
 * `voice` und `music` teilen sich die Kennung "elevenlabs"; beide Anbieter
 * lesen dieselbe Vorgabe (Umgebungsvariable ELEVENLABS_API_KEY), deshalb
 * genuegt eine Fabrik fuer beide.
 */
function defaultProviders(): ProviderFactories {
  return {
    acestep: () => acestepProvider({ base_url: DEFAULT_BASE_URL }),
    voicebox: () => voiceboxProvider({ base_url: VOICEBOX_URL }),
    elevenlabs: () => elevenlabsMusicProvider({}),
  };
}

/**
 * `doctor`: stellt fest, welche Faehigkeiten abgedeckt sind, und meldet je
 * Faehigkeit einen Zustand. Installieren folgt spaeter mit `--fix`; ein
 * fehlendes Werkzeug ist ein Zustand, kein Fehler (Code bleibt 0).
 */
async function runDoctor(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error("Aufruf: videowizard doctor");
    return 2;
  }
  const report = await detect(undefined, capabilities(), defaultProviders());
  console.log(renderReport(report));
  return 0;
}

/** Der Befehl `doctor`; eingetragen in der Befehlsliste in cli.ts. */
export const doctorCommand = {
  name: "doctor",
  summary: "Prueft, welche Faehigkeiten abgedeckt sind.",
  run: runDoctor,
};
