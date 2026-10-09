import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { callTool, listTools } from "../src/mcp/tools.js";

/** Der Text eines Werkzeugergebnisses. */
function resultText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("listTools", () => {
  it("Fall 1: nennt genau die neun Werkzeuge mit Beschreibung und Schema", () => {
    const tools = listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "doctor",
      "status",
      "ingest",
      "transcribe",
      "segment",
      "voice",
      "music_adopt",
      "music_generate",
      "render",
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema["type"]).toBe("object");
      expect(tool.inputSchema["properties"]).toBeTypeOf("object");
    }
  });

  it("Fall 1: verlangt die Pflichtargumente im Schema, Schalter bleiben freiwillig", () => {
    const schemas = new Map(listTools().map((tool) => [tool.name, tool.inputSchema]));
    const required = (name: string): unknown => schemas.get(name)?.["required"];
    expect(required("doctor")).toEqual([]);
    expect(required("status")).toEqual(["dir"]);
    expect(required("ingest")).toEqual(["dir", "video"]);
    expect(required("transcribe")).toEqual(["dir", "sourceId"]);
    expect(required("segment")).toEqual(["dir", "sourceId"]);
    expect(required("voice")).toEqual(["dir"]);
    expect(required("music_adopt")).toEqual(["dir", "file"]);
    expect(required("music_generate")).toEqual(["dir", "prompt"]);
    expect(required("render")).toEqual(["dir"]);
  });
});

describe("callTool: Aufruf und Ausgabe", () => {
  it("Fall 2: ruft doctor ohne Argumente auf und liefert dessen Ausgabe", async () => {
    const calls: string[][] = [];
    const result = await callTool("doctor", {}, {
      runCli: async (argv) => {
        calls.push([...argv]);
        console.log("Doctor: alles vorhanden");
        return 0;
      },
    });
    expect(calls).toEqual([["doctor"]]);
    expect(result.content).toEqual([{ type: "text", text: "Doctor: alles vorhanden" }]);
    expect(result.isError).toBeUndefined();
  });

  it("Fall 2: ohne Haken laeuft der echte runCli und die Ausgabe kommt zurueck", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-mcptools-"));
    const result = await callTool("status", { dir });
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("kein Projekt");
  });

  it("Fall 3: reicht den Ordner an status durch", async () => {
    const calls: string[][] = [];
    const dir = "C:\\Projekte\\Mein Short";
    await callTool("status", { dir }, {
      runCli: async (argv) => {
        calls.push([...argv]);
        return 0;
      },
    });
    expect(calls).toEqual([["status", dir]]);
  });

  it("Fall 4: Exit-Code 1 ergibt isError samt Ausgabe", async () => {
    const result = await callTool("status", { dir: "kaputt" }, {
      runCli: async () => {
        console.log("kein Projekt in kaputt");
        console.error("Fehler: Projektdatei ist kaputt");
        return 1;
      },
    });
    expect(result.isError).toBe(true);
    const text = resultText(result);
    expect(text).toContain("kein Projekt in kaputt");
    expect(text).toContain("Fehler: Projektdatei ist kaputt");
  });

  it("Fall 7: faengt eine Ausnahme aus runCli und liefert isError", async () => {
    const result = await callTool("doctor", {}, {
      runCli: async () => {
        throw new Error("Doctor abgestuerzt");
      },
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Doctor abgestuerzt");
  });
});

describe("callTool: Fehler der Eingabe", () => {
  it("Fall 5: ein fehlendes Pflichtargument ergibt isError mit dem Namen", async () => {
    let called = false;
    const runCli = async (): Promise<number> => {
      called = true;
      return 0;
    };
    const status = await callTool("status", {}, { runCli });
    expect(status.isError).toBe(true);
    expect(resultText(status)).toContain("dir");

    const ingest = await callTool("ingest", { dir: "d" }, { runCli });
    expect(ingest.isError).toBe(true);
    expect(resultText(ingest)).toContain("video");
    expect(called).toBe(false);
  });

  it("Fall 6: ein unbekanntes Werkzeug ergibt isError mit Namen und Liste", async () => {
    const result = await callTool("quatsch", {});
    expect(result.isError).toBe(true);
    const text = resultText(result);
    expect(text).toContain("quatsch");
    expect(text).toContain("doctor");
    expect(text).toContain("render");
  });

  it("ein falscher Argumenttyp ergibt isError statt einer Ausnahme", async () => {
    const result = await callTool("status", { dir: 42 });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("dir");
  });
});

describe("callTool: argv je Werkzeug", () => {
  it("Fall 8: music_generate setzt --yes nur bei yes:true", async () => {
    const calls: string[][] = [];
    const runCli = async (argv: string[]): Promise<number> => {
      calls.push([...argv]);
      return 0;
    };
    await callTool("music_generate", { dir: "d", prompt: "ruhiges Klavier" }, { runCli });
    await callTool(
      "music_generate",
      { dir: "d", prompt: "ruhiges Klavier", seconds: 12, yes: true },
      { runCli },
    );
    expect(calls[0]).toEqual(["music", "d", "generate", "--prompt", "ruhiges Klavier"]);
    expect(calls[1]).toEqual([
      "music",
      "d",
      "generate",
      "--prompt",
      "ruhiges Klavier",
      "--seconds",
      "12",
      "--yes",
    ]);
  });

  const mappings: Array<[string, Record<string, unknown>, string[]]> = [
    ["status", { dir: "d" }, ["status", "d"]],
    ["ingest", { dir: "d", video: "v.mp4" }, ["ingest", "d", "v.mp4"]],
    [
      "ingest",
      { dir: "d", video: "v.mp4", label: "Kamera A" },
      ["ingest", "d", "v.mp4", "--label", "Kamera A"],
    ],
    ["transcribe", { dir: "d", sourceId: "s01" }, ["transcribe", "d", "s01"]],
    ["segment", { dir: "d", sourceId: "s01" }, ["segment", "d", "s01"]],
    ["segment", { dir: "d", sourceId: "s01", force: true }, ["segment", "d", "s01", "--force"]],
    ["voice", { dir: "d" }, ["voice", "d"]],
    ["music_adopt", { dir: "d", file: "lied.wav" }, ["music", "d", "lied.wav"]],
    ["render", { dir: "d" }, ["render", "d"]],
    [
      "render",
      { dir: "d", captions: true, allowOverflow: true, allowIncomplete: true },
      ["render", "d", "--captions", "--allow-overflow", "--allow-incomplete"],
    ],
  ];

  for (const [name, args, expected] of mappings) {
    it(`${name} mit ${Object.keys(args).join(", ")} bildet argv ab`, async () => {
      const calls: string[][] = [];
      await callTool(name, args, {
        runCli: async (argv) => {
          calls.push([...argv]);
          return 0;
        },
      });
      expect(calls).toEqual([expected]);
    });
  }
});

describe("callTool: die Konsole wird zurueckgesetzt", () => {
  it("Fall 9: nach dem Aufruf ist console.log wieder die Originalfunktion", async () => {
    const log = console.log;
    const error = console.error;
    const warn = console.warn;
    await callTool("doctor", {}, { runCli: async () => 0 });
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    expect(console.warn).toBe(warn);
  });

  it("stellt die Konsole auch nach einem Fehler wieder her", async () => {
    const log = console.log;
    const error = console.error;
    const warn = console.warn;
    await callTool("doctor", {}, {
      runCli: async () => {
        throw new Error("kaputt");
      },
    });
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    expect(console.warn).toBe(warn);
  });

  it("faengt console.warn auf und stellt sie danach wieder her", async () => {
    const warn = console.warn;
    const result = await callTool("doctor", {}, {
      runCli: async () => {
        console.warn("Warnung: Outro fehlt");
        return 0;
      },
    });
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("Warnung: Outro fehlt");
    expect(console.warn).toBe(warn);
  });
});
