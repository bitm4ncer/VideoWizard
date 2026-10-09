import { pathToFileURL } from "node:url";
import { doctorCommand } from "./commands/doctor.js";
import { ingestCommand } from "./commands/ingest.js";
import { learnCommand } from "./commands/learn.js";
import { musicCommand } from "./commands/music.js";
import { renderCommand } from "./commands/render.js";
import { reviewCommand } from "./commands/review.js";
import { segmentCommand } from "./commands/segment.js";
import { statusCommand } from "./commands/status.js";
import { transcribeCommand } from "./commands/transcribe.js";
import { voiceCommand } from "./commands/voice.js";

/** Ein Befehl des CLIs. `args` sind die Argumente hinter dem Befehlsnamen. */
interface Command {
  /** Aufrufname, etwa "status". */
  name: string;
  /** Eine Zeile fuer die Uebersicht. */
  summary: string;
  /** Fuehrt den Befehl aus und liefert den Exit-Code. */
  run(args: string[]): Promise<number>;
}

/**
 * Alle Befehle in einer Liste. Die Hilfe wird daraus erzeugt, damit ein neuer
 * Befehl nur an einer Stelle eingetragen wird.
 */
const commands: Command[] = [
  statusCommand,
  ingestCommand,
  transcribeCommand,
  segmentCommand,
  voiceCommand,
  musicCommand,
  renderCommand,
  reviewCommand,
  doctorCommand,
  learnCommand,
  {
    name: "help",
    summary: "Zeigt diese Uebersicht.",
    run: async () => {
      printHelp();
      return 0;
    },
  },
];

function printHelp(): void {
  const width = Math.max(...commands.map((command) => command.name.length));
  console.log("videowizard: Befehle");
  for (const command of commands) {
    console.log(`  ${command.name.padEnd(width)}  ${command.summary}`);
  }
}

/**
 * Fuehrt den CLI-Aufruf aus und liefert den Exit-Code. Ruft kein
 * `process.exit`, damit der Aufruf testbar bleibt.
 */
export async function runCli(argv: string[]): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined) {
    printHelp();
    return 0;
  }
  const found = commands.find((command) => command.name === name);
  if (found === undefined) {
    console.error(`Unbekannter Befehl: ${name}`);
    console.error("Hilfe: videowizard help");
    return 2;
  }
  return found.run(args);
}

// Nur beim direkten Start den Exit-Code des Prozesses setzen. Beim Import
// (Tests) bleibt der Prozess unberuehrt.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
