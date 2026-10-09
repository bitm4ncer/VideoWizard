import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { runTranscribe } from "../src/commands/transcribe.js";
import { CURRENT_SCHEMA, loadProject, saveProject } from "../src/lib/project.js";
import type { RunFn } from "../src/lib/ffmpeg.js";
import type { TranscriptProvider, TranscriptWord } from "../src/lib/providers/transcript.js";
import type { Project } from "../src/lib/types.js";

let out: string[] = [];
let err: string[] = [];

// Die Ausgabe laeuft ueber console.log/console.error. Der Test faengt genau
// die Zeilen ab, die die Befehle wirklich schreiben.
beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    err.push(parts.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function text(lines: string[]): string {
  return lines.join("\n");
}

/**
 * Ein Projekt mit genau einer Quelle, ohne Bloecke und ohne Faehigkeiten:
 * damit faellt auf, wenn `transcribe` den eingehakten Provider ignoriert.
 */
function beispiel(): Project {
  return {
    schema: CURRENT_SCHEMA,
    id: "2026-10_test",
    title: "Test",
    format: { fps: 30, width: 1080, height: 1920 },
    language: { recorded: "de", output: "en" },
    sources: [{
      id: "s01",
      label: "Kamera A",
      file: "sources/s01/raw.mp4",
      added: "2026-10-08",
      duration: 4.6,
      checksum: "c".repeat(32),
      normalized: false,
    }],
    blocks: [],
    capabilities: {},
    delivery: { targets: [] },
  };
}

/** Ein frischer Projektordner mit Wahrheitsdatei. */
async function tempProject(project: Project): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vw-transcribe-"));
  await saveProject(dir, project);
  return dir;
}

/** Drei erkannte Woerter, wie sie ein Transkript-Anbieter liefert. */
const WORDS: TranscriptWord[] = [
  { start: 0.4, end: 1, text: "Hallo" },
  { start: 1, end: 1.8, text: "Welt." },
  { start: 2.9, end: 3.5, text: "Satz." },
];

/** Die silencedetect-Ausgabe von ffmpeg; daraus entsteht genau eine Pause. */
const SILENCE_LOG = "silence_start: 1.8\nsilence_end: 2.4\n";

/** Ein Anbieter, der die angefragten Dateien aufzeichnet und feste Woerter liefert. */
function fakeProvider(words: TranscriptWord[]): TranscriptProvider & { files: string[] } {
  const files: string[] = [];
  return {
    id: "whisper",
    files,
    detect: async () => true,
    transcribe: async (audioFile) => {
      files.push(audioFile);
      return words;
    },
  };
}

/** ffmpeg antwortet mit diesem silencedetect-Bericht; jeder Aufruf wird aufgezeichnet. */
function silenceRun(log: string): { calls: Array<{ bin: string; args: string[] }>; run: RunFn } {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const run: RunFn = async (bin, args) => {
    calls.push({ bin, args: [...args] });
    return { stdout: "", stderr: log, code: 0 };
  };
  return { calls, run };
}

describe("runTranscribe", () => {
  it("schreibt words.json und silences.json und meldet Wort- und Pausenzahl", async () => {
    const dir = await tempProject(beispiel());
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    const audio = join(dir, "sources", "s01", "source.wav");
    await writeFile(audio, "ton", "utf8");
    const provider = fakeProvider(WORDS);
    const { calls, run } = silenceRun(SILENCE_LOG);

    const code = await runTranscribe([dir, "s01"], { provider, run });

    expect(code).toBe(0);
    // Der eingehakte Provider laeuft auf der abgelegten Tonspur, ffmpeg ebenso.
    expect(provider.files).toEqual([audio]);
    expect(calls.some((call) => call.bin === "ffmpeg" && call.args.includes(audio))).toBe(true);
    const wordsFile = join(dir, "sources", "s01", "words.json");
    const silencesFile = join(dir, "sources", "s01", "silences.json");
    expect(JSON.parse(await readFile(wordsFile, "utf8"))).toEqual(WORDS);
    expect(JSON.parse(await readFile(silencesFile, "utf8"))).toEqual([[1.8, 2.4]]);
    expect(text(out)).toContain("3 Woerter");
    expect(text(out)).toContain("1 Pausen");
    expect(err).toEqual([]);
    // Kein Projektfeld wird angefasst.
    expect(await loadProject(dir)).toEqual(beispiel());
  });

  it("wirft bei unbekannter Quelle mit der Kennung und schreibt nichts", async () => {
    const dir = await tempProject(beispiel());
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    await writeFile(join(dir, "sources", "s01", "source.wav"), "ton", "utf8");
    const provider = fakeProvider(WORDS);

    const code = await runTranscribe([dir, "s99"], { provider, run: silenceRun("").run });

    expect(code).toBe(1);
    expect(text(err)).toContain("s99");
    expect(provider.files).toEqual([]);
    expect(existsSync(join(dir, "sources", "s01", "words.json"))).toBe(false);
  });

  it("meldet eine fehlende Tonspur mit dem Pfad", async () => {
    const dir = await tempProject(beispiel());
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    const provider = fakeProvider(WORDS);

    const code = await runTranscribe([dir, "s01"], { provider, run: silenceRun("").run });

    expect(code).toBe(1);
    expect(text(err)).toContain(join(dir, "sources", "s01", "source.wav"));
    expect(provider.files).toEqual([]);
  });

  it("wirft ohne eingehakten Provider, wenn keine Transkript-Faehigkeit gewaehlt ist", async () => {
    const dir = await tempProject(beispiel());
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    await writeFile(join(dir, "sources", "s01", "source.wav"), "ton", "utf8");

    const code = await runTranscribe([dir, "s01"], { run: silenceRun("").run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/capabilities\.transcript/);
  });

  it("nennt ohne Argumente die Nutzung und endet mit 2", async () => {
    const code = await runTranscribe([]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("transcribe <ordner> <quelle>");
    expect(out).toEqual([]);
  });

  it("weist unbekannte Schalter als Bedienfehler ab", async () => {
    const code = await runTranscribe(["ordner", "s01", "--schnell"]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });
});

describe("die Befehlsliste", () => {
  it("nennt transcribe und segment in der Hilfe", async () => {
    const code = await runCli(["help"]);
    expect(code).toBe(0);
    expect(text(out)).toContain("transcribe");
    expect(text(out)).toContain("segment");
    expect(err).toEqual([]);
  });
});
