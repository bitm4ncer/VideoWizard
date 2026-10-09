import { runCli as runCliDefault } from "../cli.js";

/**
 * Die MCP-Werkzeuge ueber den vorhandenen Befehlen. Ein Werkzeug je Befehl;
 * `music` hat zwei Werkzeuge, music_adopt und music_generate, statt eines
 * verzweigenden Werkzeugs.
 *
 * Bruecke: Die Befehle schreiben ihre Ausgabe ueber console.log und
 * console.error. Statt sie umzubauen, ersetzt callTool die beiden Funktionen
 * fuer die Dauer des Aufrufs durch Sammler und stellt sie im finally wieder
 * her. Der zurueckgegebene Text ist genau die gesammelte Ausgabe.
 */

/** Eine Werkzeugbeschreibung, wie `tools/list` sie liefert. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Das Ergebnis eines Werkzeugaufrufs, wie `tools/call` es liefert. */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Eingehakte Fassung des CLI-Aufrufs; ohne sie laeuft `runCli` aus cli.ts. */
export interface ToolDeps {
  runCli?: (argv: string[]) => Promise<number>;
}

/** Ein Argumentfehler; wird zu isError, verlaesst callTool nie als Ausnahme. */
class ToolInputError extends Error {}

/** Die Beschaffenheit eines Werkzeugarguments. */
interface ArgSpec {
  /** JSON-Schema-Typ; die Leser unten pruefen dagegen. */
  type: "string" | "boolean" | "number";
  description: string;
  /** Pflichtfeld im Schema; ein fehlender Wert ergibt isError. */
  required: boolean;
}

/** Ein Werkzeug: Metadaten, Argumente und der Bau des CLI-Aufrufs. */
interface ToolSpec {
  name: string;
  description: string;
  args: Record<string, ArgSpec>;
  /** Baut argv aus den Argumenten; wirft bei fehlenden oder falschen Werten. */
  build(args: Record<string, unknown>): string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Liest ein Pflichtargument als Zeichenkette. */
function needString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (value === undefined) {
    throw new ToolInputError(`Missing required argument: ${name}`);
  }
  if (typeof value !== "string") {
    throw new ToolInputError(`Argument ${name} must be a string.`);
  }
  return value;
}

/** Liest ein freiwilliges Argument als Zeichenkette; fehlt es, kommt undefined. */
function optString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ToolInputError(`Argument ${name} must be a string.`);
  }
  return value;
}

/** Liest einen Schalter; nur echtes true zaehlt, ein fehlender Wert ist false. */
function optBool(args: Record<string, unknown>, name: string): boolean {
  const value = args[name];
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new ToolInputError(`Argument ${name} must be a boolean.`);
  }
  return value;
}

/** Liest eine freiwillige positive Zahl; fehlt sie, kommt undefined. */
function optPositiveNumber(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ToolInputError(`Argument ${name} must be a positive number.`);
  }
  return value;
}

/**
 * Die Werkzeuge in der Reihenfolge, in der listTools sie nennt. Ein Argument
 * mit required true steht so auch im Schema; die Schalter der Befehle bleiben
 * freiwillig.
 */
const SPECS: ToolSpec[] = [
  {
    name: "doctor",
    description: "Check which capabilities are covered and report one state per capability.",
    args: {},
    build: () => ["doctor"],
  },
  {
    name: "status",
    description: "Show the state of the project in a folder, block by block.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
    },
    build: (args) => ["status", needString(args, "dir")],
  },
  {
    name: "ingest",
    description: "Ingest a recording into the project folder.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
      video: { type: "string", description: "Path to the recording to ingest.", required: true },
      label: {
        type: "string",
        description: "Display name for the source; defaults to the file name.",
        required: false,
      },
    },
    build: (args) => {
      const argv = ["ingest", needString(args, "dir"), needString(args, "video")];
      const label = optString(args, "label");
      if (label !== undefined) argv.push("--label", label);
      return argv;
    },
  },
  {
    name: "transcribe",
    description: "Transcribe the audio track of a source and detect its pauses.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
      sourceId: { type: "string", description: "Id of the source in the project.", required: true },
    },
    build: (args) => ["transcribe", needString(args, "dir"), needString(args, "sourceId")],
  },
  {
    name: "segment",
    description: "Split the transcript of a source into blocks. With force, repeat the run.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
      sourceId: { type: "string", description: "Id of the source in the project.", required: true },
      force: {
        type: "boolean",
        description: "Repeat the run even if the source is already segmented.",
        required: false,
      },
    },
    build: (args) => {
      const argv = ["segment", needString(args, "dir"), needString(args, "sourceId")];
      if (optBool(args, "force")) argv.push("--force");
      return argv;
    },
  },
  {
    name: "voice",
    description: "Generate voice audio for blocks with missing or outdated audio.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
    },
    build: (args) => ["voice", needString(args, "dir")],
  },
  {
    name: "music_adopt",
    description: "Adopt an existing audio file as the music bed (music <dir> <file>).",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
      file: { type: "string", description: "Path to the audio file to adopt.", required: true },
    },
    build: (args) => ["music", needString(args, "dir"), needString(args, "file")],
  },
  {
    name: "music_generate",
    description:
      "Generate the music bed from a prompt (music <dir> generate). " +
      "Paid call: pass yes=true to confirm.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
      prompt: {
        type: "string",
        description: "Description of the music to generate.",
        required: true,
      },
      seconds: {
        type: "number",
        description: "Length in seconds; defaults to the summed voice lengths.",
        required: false,
      },
      yes: { type: "boolean", description: "Confirm the paid generation.", required: false },
    },
    build: (args) => {
      const argv = [
        "music",
        needString(args, "dir"),
        "generate",
        "--prompt",
        needString(args, "prompt"),
      ];
      const seconds = optPositiveNumber(args, "seconds");
      if (seconds !== undefined) argv.push("--seconds", String(seconds));
      if (optBool(args, "yes")) argv.push("--yes");
      return argv;
    },
  },
  {
    name: "render",
    description: "Render the project to the final video.",
    args: {
      dir: { type: "string", description: "Project folder.", required: true },
      captions: {
        type: "boolean",
        description: "Burn word timings as captions.",
        required: false,
      },
      allowOverflow: {
        type: "boolean",
        description: "Render despite overflowing blocks and warn.",
        required: false,
      },
      allowIncomplete: {
        type: "boolean",
        description: "Render despite incomplete blocks and warn.",
        required: false,
      },
    },
    build: (args) => {
      const argv = ["render", needString(args, "dir")];
      if (optBool(args, "captions")) argv.push("--captions");
      if (optBool(args, "allowOverflow")) argv.push("--allow-overflow");
      if (optBool(args, "allowIncomplete")) argv.push("--allow-incomplete");
      return argv;
    },
  },
];

/** Baut das JSON-Schema eines Werkzeugs aus seinen Argumenten. */
function schemaOf(spec: ToolSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, arg] of Object.entries(spec.args)) {
    properties[name] = { type: arg.type, description: arg.description };
    if (arg.required) required.push(name);
  }
  return { type: "object", properties, required };
}

/** Die Werkzeugliste fuer `tools/list`; je Aufruf frisch gebaut. */
export function listTools(): ToolDef[] {
  return SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: schemaOf(spec),
  }));
}

/** Ein Fehlerergebnis mit Text; die einzige Stelle, die isError setzt. */
function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Ein Ausgabesammler: text() liefert die Zeilen, restore() die Konsole zurueck. */
interface OutputCapture {
  text(): string;
  restore(): void;
}

/**
 * Ersetzt console.log und console.error durch Sammler. Beide schreiben in
 * dieselbe Liste, damit die Reihenfolge der Ausgabe erhalten bleibt.
 */
function captureOutput(): OutputCapture {
  const originalLog = console.log;
  const originalError = console.error;
  const lines: string[] = [];
  const collect = (...parts: unknown[]): void => {
    lines.push(parts.map(String).join(" "));
  };
  console.log = collect;
  console.error = collect;
  return {
    text: () => lines.join("\n"),
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

/**
 * Fuehrt ein Werkzeug aus und liefert die gesammelte Ausgabe als Text.
 * Unbekannte Werkzeuge, fehlende oder falsche Argumente und ein Exit-Code
 * ungleich 0 ergeben isError; eine Ausnahme aus runCli wird gefangen.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  deps: ToolDeps = {},
): Promise<ToolResult> {
  const spec = SPECS.find((candidate) => candidate.name === name);
  if (spec === undefined) {
    const known = SPECS.map((candidate) => candidate.name).join(", ");
    return errorResult(`Unknown tool: ${name}. Known tools: ${known}.`);
  }

  let argv: string[];
  try {
    argv = spec.build(args);
  } catch (error) {
    return errorResult(errorText(error));
  }

  const capture = captureOutput();
  try {
    const code = await (deps.runCli ?? runCliDefault)(argv);
    if (code !== 0) {
      return errorResult(capture.text());
    }
    return { content: [{ type: "text", text: capture.text() }] };
  } catch (error) {
    const collected = capture.text();
    const message = `Command failed: ${errorText(error)}`;
    return errorResult(collected === "" ? message : `${collected}\n${message}`);
  } finally {
    capture.restore();
  }
}
