import { readFile } from "node:fs/promises";

/** Woher ein Geheimnis kommen kann: aus der Umgebung oder aus einer Datei. */
export interface SecretSource {
  /** Der Name der Umgebungsvariable, zum Beispiel ELEVENLABS_API_KEY. */
  env?: string;
  /** Der Pfad der Schluesseldatei. Der Aufrufer reicht ihn absolut herein. */
  file?: string;
}

/**
 * Liest ein Geheimnis: zuerst aus der Umgebung, dann aus der Datei. Fehlt
 * beides, kommt null zurueck; die Fehlermeldung baut der Aufrufer, damit sie
 * den richtigen Namen nennt.
 *
 * Die Datei darf den nackten Wert enthalten oder die Form "NAME=wert" wie eine
 * .env-Zeile; der Name ist der der Umgebungsvariable. Umgebende Anfuehrungs-
 * zeichen werden abgestreift, ein leerer Wert gilt als nicht gesetzt. Einen
 * relativen Pfad loest der Aufrufer auf; dieses Modul kennt kein Projekt.
 *
 * Der Wert wird nie protokolliert und taucht in keiner Meldung auf, auch nicht
 * gekuerzt. Jeder Lesefehler endet als null, nie als Wurf.
 */
export async function resolveSecret(
  source: SecretSource,
  deps: { env?: Record<string, string | undefined> } = {},
): Promise<string | null> {
  const env = deps.env ?? process.env;
  const name = source.env ?? "";

  const fromEnv = name === "" ? undefined : env[name]?.trim();
  if (fromEnv) return fromEnv;
  if (source.file === undefined) return null;

  try {
    let text = (await readFile(source.file, "utf8")).trim();
    if (name !== "" && text.toLowerCase().startsWith(`${name.toLowerCase()}=`)) {
      text = text.slice(name.length + 1).trim();
    }
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    return cleaned || null;
  } catch {
    // Fehlende, unlesbare oder gesperrte Datei: gilt als nicht gesetzt.
    return null;
  }
}
