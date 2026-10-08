/**
 * Die Faehigkeiten-Registry und der Doctor (Spezifikation Abschnitte 4 und 8).
 *
 * Die Registry fuehrt nur Metadaten: Kennung, Anzeigename und je Anbieter ein
 * Erkennungsmerkmal. Wie ein Anbieter arbeitet, steht nicht hier, sondern im
 * jeweiligen Laufzeit-Vertrag (etwa `MusicProvider`).
 */

import { execFile } from "node:child_process";

/** Wie ein fehlender Anbieter beschafft wird. `key` braucht einen Schluessel. */
export type InstallKind = "auto" | "manual" | "key";

/** Ein Anbieter in der Registry: nur Metadaten, kein Verhalten. */
export interface ProviderInfo {
  /** Kennung, etwa "ffmpeg" oder "acestep". */
  id: string;
  /** Befehl plus Argumente, dessen Antwort die Anwesenheit beweist. */
  detect: string[];
  /** Wie der Anbieter beschafft wird, wenn er fehlt. */
  install: InstallKind;
}

/** Eine Faehigkeit mit den Anbietern, die sie abdecken koennen. */
export interface Capability {
  /** Kennung, etwa "render" oder "music". */
  id: string;
  /** Anzeigename fuer den Bericht. */
  label: string;
  /** Die Anbieter dieser Faehigkeit, in Vorzugsreihenfolge. */
  providers: ProviderInfo[];
}

/** Zustand einer Faehigkeit im Doctor-Bericht (Abschnitt 8). */
export type CapabilityState = "present" | "auto-installable" | "manual" | "key-required";

/** Eine Zeile des Berichts: eine Faehigkeit mit genau einem Zustand. */
export interface CapabilityReport {
  capability: Capability;
  state: CapabilityState;
  /** Der gefundene Anbieter; nur bei `present` gesetzt. */
  provider?: string;
}

/** Der ganze Bericht, in der Reihenfolge der Registry. */
export type Report = CapabilityReport[];

/** Fuehrt einen Erkennungsbefehl aus und liefert dessen Ausgabe. */
export type Run = (args: string[]) => Promise<string>;

/**
 * Die Registry, Stand Etappe 1: `render` mit ffmpeg und `music` mit acestep.
 * Weitere Faehigkeiten und Anbieter folgen mit ihren Etappen.
 */
const registry: Capability[] = [
  {
    id: "render",
    label: "Schnitt/Mix/Render",
    providers: [
      {
        id: "ffmpeg",
        detect: ["ffmpeg", "-version"],
        install: "auto",
      },
    ],
  },
  {
    id: "music",
    label: "Musik",
    providers: [
      {
        id: "acestep",
        detect: ["acestep-api", "--help"],
        install: "manual",
      },
    ],
  },
];

/** Alle Faehigkeiten der Registry. */
export function capabilities(): Capability[] {
  return registry;
}

/** Kurzes Zeitlimit: was nicht antwortet, gilt als fehlend. */
const DETECT_TIMEOUT_MS = 5000;

/** Vorgabe fuer `run`: fuehrt den Befehl aus und liefert dessen Ausgabe. */
function runProcess(args: string[]): Promise<string> {
  const [command, ...rest] = args;
  if (command === undefined) {
    return Promise.reject(new Error("Erkennungsbefehl fehlt."));
  }
  return new Promise((resolve, reject) => {
    execFile(command, rest, { timeout: DETECT_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

/** Antwortet der Erkennungsbefehl? Ein Fehler heisst "fehlt", nicht Absturz. */
async function answers(command: string[], run: Run): Promise<boolean> {
  try {
    await run(command);
    return true;
  } catch {
    return false;
  }
}

/** Der Zustand, wenn kein Anbieter gefunden wurde. */
function missingState(providers: readonly ProviderInfo[]): CapabilityState {
  if (providers.some((provider) => provider.install === "auto")) {
    return "auto-installable";
  }
  if (providers.some((provider) => provider.install === "manual")) {
    return "manual";
  }
  if (providers.some((provider) => provider.install === "key")) {
    return "key-required";
  }
  // Ohne Anbieter gibt es nichts zu installieren: nur von Hand.
  return "manual";
}

async function stateFor(capability: Capability, run: Run): Promise<CapabilityReport> {
  for (const provider of capability.providers) {
    if (await answers(provider.detect, run)) {
      return { capability, state: "present", provider: provider.id };
    }
  }
  return { capability, state: missingState(capability.providers) };
}

/**
 * Stellt den Zustand jeder Faehigkeit fest. Wirft nie: ein fehlendes Werkzeug
 * ist ein Zustand, kein Fehler. `run` ist einhakbar, damit der Test ohne
 * Werkzeug laeuft; `list` ebenso, damit der Test eine Faehigkeit ohne Anbieter
 * stellen kann.
 */
export async function detect(
  run: Run = runProcess,
  list: readonly Capability[] = capabilities(),
): Promise<Report> {
  const report: Report = [];
  for (const capability of list) {
    report.push(await stateFor(capability, run));
  }
  return report;
}

/** Die deutschen Namen der Zustaende (Abschnitt 8). */
const STATE_TEXT: Record<CapabilityState, string> = {
  present: "vorhanden",
  "auto-installable": "automatisch installierbar",
  manual: "nur von Hand",
  "key-required": "Schluessel noetig",
};

/** Die Anbieter in Klammern, damit klar ist, worum es geht. */
function providerNote(row: CapabilityReport): string {
  if (row.provider !== undefined) {
    return ` (${row.provider})`;
  }
  const ids = row.capability.providers.map((provider) => provider.id);
  return ids.length > 0 ? ` (${ids.join(", ")})` : "";
}

/**
 * Eine Zeile je Faehigkeit mit genau einem Zustand. Es gibt keinen
 * Sonderfall, auch nicht fuer eine Faehigkeit ohne Anbieter.
 */
export function renderReport(report: Report): string {
  return report
    .map((row) => `${row.capability.label}: ${STATE_TEXT[row.state]}${providerNote(row)}`)
    .join("\n");
}
