import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWhisperJson, whisperProvider } from "../src/lib/providers/whisper.js";
import { resolveTranscriptProvider } from "../src/lib/providers/transcript.js";
import type { RunCommandFn, TranscriptWord, WhisperOptions } from "../src/lib/providers/transcript.js";
import type { CapabilityChoice, Project } from "../src/lib/types.js";

/** Fuehrt aus und liefert den Fehler; erlaubt mehrere Pruefungen an einer Meldung. */
async function errorOf(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (error) {
    return error as Error;
  }
  throw new Error("erwarteter Fehler blieb aus");
}

/** Ein Minimalprojekt; Abweichungen kommen ueber over. */
function project(over: Partial<Project> = {}): Project {
  return {
    schema: 1,
    id: "2026-10_test",
    title: "Test",
    format: { fps: 30, width: 1080, height: 1920 },
    language: { recorded: "de", output: "en" },
    sources: [],
    blocks: [],
    capabilities: {},
    delivery: { targets: [] },
    ...over,
  };
}

/** Ein Projekt mit genau der Transkriptwahl. */
function transcript(choice: CapabilityChoice): Project {
  return project({ capabilities: { transcript: choice } });
}

/** Die Kommando-Vorlage kennt nur die zwei Platzhalter, keine Flags. */
const cfg: WhisperOptions = { command: ["whisper", "{outdir}", "{input}"] };

/**
 * Das Fixture in der openai-Whisper-Form: zwei Segmente mit Wortlisten und
 * unsortierten Zeiten, die erst durch die Sortierung nach `start` in die
 * richtige Reihenfolge kommen.
 */
const FIXTURE = JSON.stringify({
  text: "Hallo Welt. Noch ein Satz.",
  segments: [
    {
      start: 2,
      end: 4.6,
      text: "Noch ein Satz.",
      words: [
        { word: " Noch ", start: 3.5, end: 3.9 },
        { word: "ein", start: 2.9, end: 3.5 },
        { word: "Satz.", start: 4, end: 4.6 },
      ],
    },
    {
      start: 0,
      end: 2,
      text: "Hallo Welt.",
      words: [
        { word: "Hallo", start: 0.4, end: 1 },
        { word: " Welt. ", start: 1, end: 1.8 },
      ],
    },
  ],
});

/** Die erwarteten Woerter: getrimmt, nach start sortiert. */
const EXPECTED: TranscriptWord[] = [
  { start: 0.4, end: 1, text: "Hallo" },
  { start: 1, end: 1.8, text: "Welt." },
  { start: 2.9, end: 3.5, text: "ein" },
  { start: 3.5, end: 3.9, text: "Noch" },
  { start: 4, end: 4.6, text: "Satz." },
];

describe("parseWhisperJson", () => {
  it("liest Wortlisten, trimmt die Woerter und sortiert nach start", () => {
    expect(parseWhisperJson(FIXTURE)).toEqual(EXPECTED);
  });

  it("faellt ohne Wortliste auf die Segmentzeitspanne und den Segmenttext zurueck", () => {
    const raw = JSON.stringify({
      segments: [
        { start: 1.5, end: 3.25, text: "  Nur Text.  " },
        { start: 3.25, end: 3.5, text: "Leer", words: [] },
      ],
    });

    expect(parseWhisperJson(raw)).toEqual([
      { start: 1.5, end: 3.25, text: "Nur Text." },
      { start: 3.25, end: 3.5, text: "Leer" },
    ]);
  });

  it("wirft bei leerem Ergebnis mit klarer Meldung", () => {
    expect(() => parseWhisperJson(JSON.stringify({ segments: [] }))).toThrow(/keine Woerter/);
    expect(() => parseWhisperJson("{}")).toThrow(/keine Woerter/);
  });
});

describe("whisperProvider: erkennen", () => {
  it("prueft nur <command[0]> --help und ist bei Erfolg wahr", async () => {
    const calls: string[][] = [];
    const runCommand: RunCommandFn = async (argv) => {
      calls.push(argv);
      return "";
    };

    expect(await whisperProvider(cfg, { runCommand }).detect()).toBe(true);
    expect(calls).toEqual([["whisper", "--help"]]);
  });

  it("ist falsch, wenn der Aufruf wirft, statt zu werfen", async () => {
    const runCommand: RunCommandFn = async () => {
      throw new Error("nicht installiert");
    };

    expect(await whisperProvider(cfg, { runCommand }).detect()).toBe(false);
  });
});

describe("whisperProvider: transkribieren", () => {
  it("ersetzt {input} und {outdir}, liest die JSON-Datei und raeumt den Ordner auf", async () => {
    const input = join("audio", "clip.wav");
    let outdir = "";
    const runCommand: RunCommandFn = async (argv) => {
      expect(argv[0]).toBe("whisper");
      expect(argv.join(" ")).not.toMatch(/\{(input|outdir)\}/);
      expect(argv[2]).toBe(input);
      outdir = argv[1]!;
      await writeFile(join(outdir, "clip.json"), FIXTURE, "utf8");
      return "";
    };

    const words = await whisperProvider(cfg, { runCommand }).transcribe(input);

    expect(words).toEqual(EXPECTED);
    expect(outdir).not.toBe("");
    expect(existsSync(outdir)).toBe(false);
  });

  it("nimmt die einzige JSON-Datei, wenn der Basisname nicht passt", async () => {
    const input = join("audio", "clip.wav");
    let outdir = "";
    const runCommand: RunCommandFn = async (argv) => {
      outdir = argv[1]!;
      await writeFile(join(outdir, "ergebnis.json"), FIXTURE, "utf8");
      return "";
    };

    const words = await whisperProvider(cfg, { runCommand }).transcribe(input);

    expect(words).toEqual(EXPECTED);
    expect(existsSync(outdir)).toBe(false);
  });

  it("wirft mit den gefundenen Dateien, wenn keine JSON-Datei da ist", async () => {
    const input = join("audio", "clip.wav");
    let outdir = "";
    const runCommand: RunCommandFn = async (argv) => {
      outdir = argv[1]!;
      await writeFile(join(outdir, "protokoll.txt"), "kein JSON", "utf8");
      return "";
    };

    const error = await errorOf(whisperProvider(cfg, { runCommand }).transcribe(input));

    expect(error.message).toMatch(/JSON/);
    expect(error.message).toContain("protokoll.txt");
    expect(outdir).not.toBe("");
    expect(existsSync(outdir)).toBe(false);
  });

  it("wirft, wenn mehrere JSON-Dateien ohne Basisnamen-Treffer vorliegen", async () => {
    const input = join("audio", "clip.wav");
    const runCommand: RunCommandFn = async (argv) => {
      const outdir = argv[1]!;
      await writeFile(join(outdir, "a.json"), FIXTURE, "utf8");
      await writeFile(join(outdir, "b.json"), FIXTURE, "utf8");
      return "";
    };

    const error = await errorOf(whisperProvider(cfg, { runCommand }).transcribe(input));

    expect(error.message).toContain("a.json");
    expect(error.message).toContain("b.json");
  });
});

describe("resolveTranscriptProvider: die Wahl", () => {
  it("waehlt whisper anhand von capabilities.transcript.provider", async () => {
    const calls: string[][] = [];
    const runCommand: RunCommandFn = async (argv) => {
      calls.push(argv);
      return "";
    };

    const provider = resolveTranscriptProvider(
      transcript({ provider: "whisper", options: { command: ["whisper", "{outdir}", "{input}"] } }),
      { runCommand },
    );

    expect(provider.id).toBe("whisper");
    expect(await provider.detect()).toBe(true);
    expect(calls).toEqual([["whisper", "--help"]]);
  });

  it("wirft, wenn capabilities.transcript fehlt, und nennt die bekannten", () => {
    expect(() => resolveTranscriptProvider(project())).toThrow(/capabilities\.transcript/);
    expect(() => resolveTranscriptProvider(project())).toThrow(/whisper/);
  });

  it("wirft bei unbekanntem Namen und nennt Name und bekannte", () => {
    const unknown = transcript({ provider: "elevenlabs" });
    expect(() => resolveTranscriptProvider(unknown)).toThrow(/"elevenlabs"/);
    expect(() => resolveTranscriptProvider(unknown)).toThrow(/whisper/);
  });

  it("wirft, wenn die Kommando-Vorlage fehlt", () => {
    const ohne = transcript({ provider: "whisper", options: {} });
    expect(() => resolveTranscriptProvider(ohne)).toThrow(/command/);
    expect(() => resolveTranscriptProvider(ohne)).toThrow(/capabilities\.transcript/);
  });
});
