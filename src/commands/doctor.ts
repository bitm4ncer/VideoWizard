import { capabilities, detect, renderReport } from "../lib/capabilities.js";
import { DEFAULT_BASE_URL, acestepProvider } from "../lib/providers/acestep.js";
import { voiceboxProvider } from "../lib/providers/voicebox.js";
import type { ServiceFactories } from "../lib/capabilities.js";

/** Adresse von Voicebox, wenn kein Projekt sie nennt. */
const VOICEBOX_URL = "http://127.0.0.1:17493";

/**
 * Der Doctor hat kein Projekt: die Dienste werden mit ihren Vorgaben gebaut,
 * ACE-Step auf http://127.0.0.1:8001, Voicebox auf http://127.0.0.1:17493.
 */
function defaultServices(): ServiceFactories {
  return {
    acestep: () => acestepProvider({ base_url: DEFAULT_BASE_URL }),
    voicebox: () => voiceboxProvider({ base_url: VOICEBOX_URL }),
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
  const report = await detect(undefined, capabilities(), defaultServices());
  console.log(renderReport(report));
  return 0;
}

/** Der Befehl `doctor`; eingetragen in der Befehlsliste in cli.ts. */
export const doctorCommand = {
  name: "doctor",
  summary: "Prueft, welche Faehigkeiten abgedeckt sind.",
  run: runDoctor,
};
