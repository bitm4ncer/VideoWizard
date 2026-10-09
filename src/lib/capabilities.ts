/**
 * Die Faehigkeiten-Registry und der Doctor (Spezifikation Abschnitte 4 und 8).
 *
 * Die Registry fuehrt nur Metadaten: Kennung, Anzeigename und je Anbieter ein
 * Erkennungsmerkmal. Wie ein Anbieter arbeitet, steht nicht hier, sondern im
 * jeweiligen Laufzeit-Vertrag (etwa `MusicProvider`).
 */

import { execFile } from "node:child_process";
import { WHISPER_COMMAND } from "./providers/whisper.js";

/** Wie ein fehlender Anbieter beschafft wird. `key` braucht einen Schluessel. */
export type InstallKind = "auto" | "manual" | "key";

/** Wie ein Anbieter erkannt wird: als Programm ueber einen Prozess, als Dienst im Netz. */
export type ProviderKind = "program" | "service";

/** Gemeinsame Metadaten eines Registry-Anbieters. */
interface ProviderBase {
  /** Kennung, etwa "ffmpeg" oder "acestep". */
  id: string;
  /** Wie der Anbieter beschafft wird, wenn er fehlt. */
  install: InstallKind;
}

/** Ein Programm-Anbieter: erkannt ueber einen Prozessbefehl. */
export interface ProgramProvider extends ProviderBase {
  kind: "program";
  /** Befehl plus Argumente, dessen Antwort die Anwesenheit beweist. */
  detect: string[];
}

/** Ein Dienst-Anbieter: erkannt ueber die echte `detect()` seines Providers. */
export interface ServiceProvider extends ProviderBase {
  kind: "service";
}

/** Ein Anbieter in der Registry: Metadaten plus die Art der Erkennung. */
export type ProviderInfo = ProgramProvider | ServiceProvider;

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

/** Was ein Dienst zum Pruefen koennen muss: seine echte `detect()`. */
export interface DetectableService {
  detect(): Promise<boolean>;
}

/** Baut den Dienst zum Pruefen; eingehakt, damit der Test ohne Dienst laeuft. */
export type ServiceFactory = () => DetectableService;

/** Die Dienst-Fabriken je Kennung. Fehlt eine, gilt der Dienst als fern. */
export type ServiceFactories = Record<string, ServiceFactory>;

/**
 * Die Registry, Stand Etappe 2b: `render` mit ffmpeg, `music` mit acestep,
 * `voice` mit voicebox und `transcript` mit whisper. Das Whisper-Kommando
 * kommt aus dem Rezept (`WHISPER_COMMAND`), damit beide nicht auseinander
 * laufen. Weitere Faehigkeiten und Anbieter folgen mit ihren Etappen.
 */
const registry: Capability[] = [
  {
    id: "render",
    label: "Schnitt/Mix/Render",
    providers: [
      {
        id: "ffmpeg",
        kind: "program",
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
        kind: "service",
        install: "manual",
      },
    ],
  },
  {
    id: "voice",
    label: "Stimme",
    providers: [
      {
        id: "voicebox",
        kind: "service",
        install: "manual",
      },
    ],
  },
  {
    id: "transcript",
    label: "Transkript",
    providers: [
      {
        id: "whisper",
        kind: "program",
        detect: [WHISPER_COMMAND, "--help"],
        install: "auto",
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

/**
 * Ist der Anbieter da? Ein Programm antwortet auf seinen Prozessbefehl, ein
 * Dienst ueber die eingehakte echte `detect()`. Wirft nie: was nicht
 * antwortet, und was beim Fragen scheitert, gilt als fern.
 */
async function found(
  provider: ProviderInfo,
  run: Run,
  services: ServiceFactories,
): Promise<boolean> {
  if (provider.kind === "program") {
    return answers(provider.detect, run);
  }
  const build = services[provider.id];
  if (build === undefined) return false;
  try {
    return await build().detect();
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

async function stateFor(
  capability: Capability,
  run: Run,
  services: ServiceFactories,
): Promise<CapabilityReport> {
  for (const provider of capability.providers) {
    if (await found(provider, run, services)) {
      return { capability, state: "present", provider: provider.id };
    }
  }
  return { capability, state: missingState(capability.providers) };
}

/**
 * Stellt den Zustand jeder Faehigkeit fest. Wirft nie: ein fehlendes Werkzeug
 * ist ein Zustand, kein Fehler. `run` ist einhakbar, damit der Test ohne
 * Werkzeug laeuft; `services` ebenso mit einer Fabrik je Dienst, damit der
 * Test ohne echten Dienst laeuft. Ohne Fabrik gilt ein Dienst als fern.
 */
export async function detect(
  run: Run = runProcess,
  list: readonly Capability[] = capabilities(),
  services: ServiceFactories = {},
): Promise<Report> {
  const report: Report = [];
  for (const capability of list) {
    report.push(await stateFor(capability, run, services));
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

/** Das Wort vor der Kennung des gefundenen Anbieters: Programm oder Dienst. */
function providerKindText(row: CapabilityReport): string {
  const foundProvider = row.capability.providers.find(
    (provider) => provider.id === row.provider,
  );
  return foundProvider?.kind === "service" ? "Dienst" : "Programm";
}

/**
 * Die Anbieter in Klammern, damit klar ist, worum es geht: beim gefundenen
 * Anbieter mit seiner Art, sonst alle Kennungen der Faehigkeit.
 */
function providerNote(row: CapabilityReport): string {
  if (row.provider !== undefined) {
    return ` (${providerKindText(row)}: ${row.provider})`;
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
