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

/**
 * Wie ein Anbieter erkannt wird: als Programm ueber einen Prozess, als Dienst
 * im Netz oder als Schluessel ueber die `detect()` seines Providers.
 */
export type ProviderKind = "program" | "service" | "key";

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

/**
 * Ein Schluessel-Anbieter: braucht einen Schluessel und wird ueber die echte
 * `detect()` des Providers erkannt, der den Schluessel liest.
 */
export interface KeyProvider extends ProviderBase {
  kind: "key";
}

/** Ein Anbieter in der Registry: Metadaten plus die Art der Erkennung. */
export type ProviderInfo = ProgramProvider | ServiceProvider | KeyProvider;

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
  /** Der Anbieter, auf den sich die Zeile bezieht; fehlt nur ohne Anbieter. */
  provider?: string;
}

/** Der ganze Bericht, in der Reihenfolge der Registry. */
export type Report = CapabilityReport[];

/** Fuehrt einen Erkennungsbefehl aus und liefert dessen Ausgabe. */
export type Run = (args: string[]) => Promise<string>;

/** Was ein Dienst oder Schluessel-Anbieter zum Pruefen koennen muss: seine echte `detect()`. */
export interface DetectableProvider {
  detect(): Promise<boolean>;
}

/** Baut den Anbieter zum Pruefen; eingehakt, damit der Test ohne Dienst oder Schluessel laeuft. */
export type ProviderFactory = () => DetectableProvider;

/** Die Anbieter-Fabriken je Kennung. Fehlt eine, gilt der Anbieter als fern. */
export type ProviderFactories = Record<string, ProviderFactory>;

/**
 * Die Registry, Stand Etappe 3: `render` mit ffmpeg, `music` mit acestep und
 * elevenlabs, `voice` mit voicebox und elevenlabs sowie `transcript` mit
 * whisper. Das Whisper-Kommando kommt aus dem Rezept (`WHISPER_COMMAND`),
 * damit beide nicht auseinander laufen. Weitere Faehigkeiten und Anbieter
 * folgen mit ihren Etappen.
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
      {
        id: "elevenlabs",
        kind: "key",
        install: "key",
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
      {
        id: "elevenlabs",
        kind: "key",
        install: "key",
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
 * Dienst und ein Schluessel-Anbieter ueber die eingehakte echte `detect()`.
 * Wirft nie: was nicht antwortet, und was beim Fragen scheitert, gilt als fern.
 */
async function found(
  provider: ProviderInfo,
  run: Run,
  providers: ProviderFactories,
): Promise<boolean> {
  if (provider.kind === "program") {
    return answers(provider.detect, run);
  }
  const build = providers[provider.id];
  if (build === undefined) return false;
  try {
    return await build().detect();
  } catch {
    return false;
  }
}

/** Der Vorrang der Beschaffung, wenn keiner da ist: automatisch vor von Hand vor Schluessel. */
const INSTALL_RANK: Record<InstallKind, number> = { auto: 0, manual: 1, key: 2 };

/** Der Zustand, der zu einer Beschaffungsart gehoert. */
const INSTALL_STATE: Record<InstallKind, CapabilityState> = {
  auto: "auto-installable",
  manual: "manual",
  key: "key-required",
};

/**
 * Der beste fehlende Anbieter nach Vorrang: erst automatisch installierbar,
 * dann nur von Hand, dann Schluessel noetig; bei Gleichstand entscheidet die
 * Reihenfolge in der Registry. Ohne Anbieter gibt es keinen.
 */
function missingProvider(providers: readonly ProviderInfo[]): ProviderInfo | undefined {
  let best: ProviderInfo | undefined;
  for (const provider of providers) {
    if (best === undefined || INSTALL_RANK[provider.install] < INSTALL_RANK[best.install]) {
      best = provider;
    }
  }
  return best;
}

async function stateFor(
  capability: Capability,
  run: Run,
  providers: ProviderFactories,
): Promise<CapabilityReport> {
  for (const provider of capability.providers) {
    if (await found(provider, run, providers)) {
      return { capability, state: "present", provider: provider.id };
    }
  }
  const best = missingProvider(capability.providers);
  if (best === undefined) {
    // Ohne Anbieter gibt es nichts zu beschaffen: nur von Hand, ohne Kennung.
    return { capability, state: "manual" };
  }
  return { capability, state: INSTALL_STATE[best.install], provider: best.id };
}

/**
 * Stellt den Zustand jeder Faehigkeit fest. Wirft nie: ein fehlendes Werkzeug
 * ist ein Zustand, kein Fehler. `run` ist einhakbar, damit der Test ohne
 * Werkzeug laeuft; `providers` ebenso mit einer Fabrik je Anbieter, damit der
 * Test ohne echten Dienst und ohne echten Schluessel laeuft. Ohne Fabrik gilt
 * ein Dienst oder Schluessel-Anbieter als fern.
 */
export async function detect(
  run: Run = runProcess,
  list: readonly Capability[] = capabilities(),
  providers: ProviderFactories = {},
): Promise<Report> {
  const report: Report = [];
  for (const capability of list) {
    report.push(await stateFor(capability, run, providers));
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

/** Das Wort vor der Kennung des gefundenen Anbieters: Programm, Dienst oder Schluessel. */
const KIND_TEXT: Record<ProviderKind, string> = {
  program: "Programm",
  service: "Dienst",
  key: "Schluessel",
};

function providerKindText(row: CapabilityReport): string {
  const foundProvider = row.capability.providers.find(
    (provider) => provider.id === row.provider,
  );
  return foundProvider === undefined ? "Programm" : KIND_TEXT[foundProvider.kind];
}

/**
 * Der Anbieter in Klammern, auf den sich die Zeile bezieht: der gefundene mit
 * seiner Art, der fehlende mit seiner Kennung; ohne Anbieter nichts.
 */
function providerNote(row: CapabilityReport): string {
  if (row.provider === undefined) return "";
  if (row.state === "present") {
    return ` (${providerKindText(row)}: ${row.provider})`;
  }
  return ` (${row.provider})`;
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
