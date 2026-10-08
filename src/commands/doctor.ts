import { detect, renderReport } from "../lib/capabilities.js";

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
  const report = await detect();
  console.log(renderReport(report));
  return 0;
}

/** Der Befehl `doctor`; eingetragen in der Befehlsliste in cli.ts. */
export const doctorCommand = {
  name: "doctor",
  summary: "Prueft, welche Faehigkeiten abgedeckt sind.",
  run: runDoctor,
};
