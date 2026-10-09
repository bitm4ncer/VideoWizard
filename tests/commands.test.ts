import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIngest } from "../src/commands/ingest.js";
import { runRender } from "../src/commands/render.js";
import { runVoice } from "../src/commands/voice.js";
import { probeDuration } from "../src/lib/ffmpeg.js";
import { ttsHash } from "../src/lib/hash.js";
import { CURRENT_SCHEMA, loadProject, saveProject } from "../src/lib/project.js";
import type { RunFn } from "../src/lib/ffmpeg.js";
import type { VoiceProvider } from "../src/lib/providers/voice.js";
import type { Block, Project } from "../src/lib/types.js";

let out: string[] = [];
let err: string[] = [];
let warning: string[] = [];

// Die Ausgabe laeuft ueber console.log/console.error/console.warn. Der Test
// faengt genau die Zeilen ab, die die Befehle wirklich schreiben.
beforeEach(() => {
  out = [];
  err = [];
  warning = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    err.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
    warning.push(parts.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function text(lines: string[]): string {
  return lines.join("\n");
}

/** Ein Block; Abweichungen kommen ueber over. */
function block(over: Partial<Block> = {}): Block {
  return {
    id: "b001",
    kind: "take",
    source_id: "s01",
    source_in: 0,
    source_out: 10,
    silences: [],
    text: "Der Text",
    pause_after: 0,
    fit: "none",
    overlays: [],
    ...over,
  };
}

/** Ein Projekt mit einer Quelle und den uebergebenen Bloecken. */
function beispiel(blocks: Block[] = [], over: Partial<Project> = {}): Project {
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
      duration: 100,
      checksum: "c".repeat(32),
      normalized: false,
    }],
    blocks,
    capabilities: {
      voice: {
        provider: "voicebox",
        options: { base_url: "http://127.0.0.1:17493", profile_name: "Niander" },
      },
    },
    delivery: { targets: [] },
    ...over,
  };
}

/** Ein frischer Projektordner mit Wahrheitsdatei. */
async function tempProject(project: Project): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vw-commands-"));
  await saveProject(dir, project);
  return dir;
}

/** ffprobe liefert genau diese Dauer; jede Anfrage wird aufgezeichnet. */
function probeRun(duration: number): { calls: Array<{ bin: string; args: string[] }>; run: RunFn } {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const run: RunFn = async (bin, args) => {
    calls.push({ bin, args: [...args] });
    return {
      stdout: JSON.stringify({ format: { duration: String(duration) } }),
      stderr: "",
      code: 0,
    };
  };
  return { calls, run };
}

/** Jeder Prozessaufruf wird aufgezeichnet und scheitert. */
function recordingRun(): { calls: Array<{ bin: string; args: string[] }>; run: RunFn } {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const run: RunFn = async (bin, args) => {
    calls.push({ bin, args: [...args] });
    return { stdout: "", stderr: "absichtlich kaputt", code: 1 };
  };
  return { calls, run };
}

/**
 * Ein Sprach-Anbieter, der die gesprochenen Texte aufzeichnet und die Sprache
 * aus dem Aufruf uebernimmt. `speak` weicht ueber den uebergebenen Haken ab.
 */
function fakeProvider(
  speak: (text: string) => Promise<Buffer>,
): VoiceProvider & { spoken: Array<{ text: string; language?: string }> } {
  const spoken: Array<{ text: string; language?: string }> = [];
  return {
    id: "voicebox",
    spoken,
    detect: async () => true,
    speak: async (text, opts) => {
      spoken.push(opts.language === undefined ? { text } : { text, language: opts.language });
      return { audio: await speak(text), alignment: null };
    },
  };
}

/**
 * Eingehaktes run fuer den Ingest: ffprobe antwortet mit einem brauchbaren
 * Film, ffmpeg legt sein Ausgabeziel an. Die Aufnahme kennt der Haken nur als
 * Pfad; die abgelegte raw.mp4 bekommt eine leicht andere Dauer, damit die
 * Messung am Ziel erkennbar ist.
 */
function ingestRun(videoPath: string): RunFn {
  const video = {
    streams: [{ codec_name: "h264", width: 1280, height: 720, r_frame_rate: "25/1" }],
    format: { duration: "7.500000" },
  };
  const target = {
    streams: [{ codec_name: "h264", width: 1280, height: 720, r_frame_rate: "25/1" }],
    format: { duration: "7.400000" },
  };
  const ton = { streams: [{ codec_name: "aac" }] };
  return async (bin, args) => {
    if (bin === "ffprobe") {
      const file = args[args.length - 1] ?? "";
      if (args.includes("a:0")) {
        return { stdout: JSON.stringify(ton), stderr: "", code: 0 };
      }
      return { stdout: JSON.stringify(file === videoPath ? video : target), stderr: "", code: 0 };
    }
    await writeFile(args[args.length - 1] ?? "", "erzeugt", "utf8");
    return { stdout: "", stderr: "", code: 0 };
  };
}

describe("ttsHash", () => {
  it("ist sha256 ueber Text und Anbieter, auf 16 Zeichen gekuerzt", () => {
    expect(ttsHash("Hallo Welt", "voicebox")).toBe("40ff92f19f2b2559");
    expect(ttsHash("Hallo Welt", "voicebox")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("bleibt fuer denselben Text und Anbieter gleich", () => {
    expect(ttsHash("Hallo Welt", "voicebox")).toBe(ttsHash("Hallo Welt", "voicebox"));
  });

  it("haengt vom Text und von der Anbieter-Kennung ab", () => {
    expect(ttsHash("Hallo Welt", "voicebox")).not.toBe(ttsHash("Anderer Text", "voicebox"));
    expect(ttsHash("Hallo Welt", "voicebox")).not.toBe(ttsHash("Hallo Welt", "other"));
  });
});

describe("probeDuration", () => {
  it("misst die Dauer per ffprobe, ohne eine Bildspur zu verlangen", async () => {
    const { calls, run } = probeRun(2.5);

    expect(await probeDuration("ton.wav", run)).toBe(2.5);
    expect(calls).toEqual([{
      bin: "ffprobe",
      args: ["-v", "error", "-show_entries", "format=duration", "-of", "json", "ton.wav"],
    }]);
  });

  it("wirft, wenn ffprobe scheitert", async () => {
    const run: RunFn = async () => ({ stdout: "", stderr: "kaputt", code: 1 });

    await expect(probeDuration("ton.wav", run)).rejects.toThrow(/ffprobe scheiterte/);
  });

  it("wirft, wenn keine brauchbare Dauer gemessen wird", async () => {
    const run: RunFn = async () => ({
      stdout: JSON.stringify({ format: { duration: "0" } }),
      stderr: "",
      code: 0,
    });

    await expect(probeDuration("ton.wav", run)).rejects.toThrow(/brauchbare Dauer/);
  });
});

describe("runVoice", () => {
  it("nennt ohne Ordner die Nutzung und endet mit 2", async () => {
    const code = await runVoice([]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("voice <ordner>");
    expect(out).toEqual([]);
  });

  it("weist unbekannte Schalter als Bedienfehler ab", async () => {
    const code = await runVoice([".", "--lauter"]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });

  it("meldet ein fehlendes Projekt als Fehler", async () => {
    const leer = await mkdtemp(join(tmpdir(), "vw-commands-"));

    const code = await runVoice([leer]);

    expect(code).toBe(1);
    expect(text(err)).toMatch(/Fehler/);
    expect(out).toEqual([]);
  });

  it("vertont nur fehlende oder veraltete Bloecke und schreibt audio/tts/<id>.wav", async () => {
    const dir = await tempProject(beispiel([
      block({ id: "b001", text: "Frisch" }),
      block({
        id: "b002",
        text: "Schon da",
        tts: {
          file: "audio/tts/b002.wav",
          duration: 1.5,
          hash: ttsHash("Schon da", "voicebox"),
          generated_at: "2026-10-01T00:00:00.000Z",
        },
      }),
      block({ id: "b003", text: undefined }),
      block({
        id: "b004",
        text: " Alt ",
        tts: {
          file: "audio/tts/b004.wav",
          duration: 9,
          hash: "veraltet",
          generated_at: "2026-10-01T00:00:00.000Z",
        },
      }),
    ]));
    await mkdir(join(dir, "audio", "tts"), { recursive: true });
    await writeFile(join(dir, "audio", "tts", "b004.wav"), "alter Ton", "utf8");
    const provider = fakeProvider(async (spoken) => Buffer.from(`ton:${spoken}`));
    const { run } = probeRun(4.2);

    const code = await runVoice([dir], { provider, run });

    expect(code).toBe(0);
    // Nur die veralteten Bloecke werden gesprochen, der Text dabei getrimmt,
    // die Sprache ist die Ausgabesprache des Projekts.
    expect(provider.spoken).toEqual([
      { text: "Frisch", language: "en" },
      { text: "Alt", language: "en" },
    ]);
    expect(text(out)).toContain("2 erzeugt, 2 uebersprungen, 0 fehlgeschlagen");
    expect(err).toEqual([]);

    const project = await loadProject(dir);
    expect(project.blocks[0]?.tts).toEqual({
      file: "audio/tts/b001.wav",
      duration: 4.2,
      hash: ttsHash("Frisch", "voicebox"),
      generated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(project.blocks[1]?.tts).toEqual({
      file: "audio/tts/b002.wav",
      duration: 1.5,
      hash: ttsHash("Schon da", "voicebox"),
      generated_at: "2026-10-01T00:00:00.000Z",
    });
    expect(project.blocks[2]?.tts).toBeUndefined();
    expect(project.blocks[3]?.tts).toEqual({
      file: "audio/tts/b004.wav",
      duration: 4.2,
      hash: ttsHash("Alt", "voicebox"),
      generated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(await readFile(join(dir, "audio", "tts", "b001.wav"))).toEqual(Buffer.from("ton:Frisch"));
    expect(await readFile(join(dir, "audio", "tts", "b004.wav"))).toEqual(Buffer.from("ton:Alt"));
    expect((await readdir(join(dir, "audio", "tts"))).sort()).toEqual(["b001.wav", "b004.wav"]);
  });

  it("haelt den Lauf bei einem Blockfehler nicht an und meldet ihn", async () => {
    const dir = await tempProject(beispiel([
      block({ id: "b001", text: "Kaputt" }),
      block({ id: "b002", text: "Gut" }),
    ]));
    const provider = fakeProvider(async (spoken) => {
      if (spoken === "Kaputt") throw new Error("Dienst weg");
      return Buffer.from(`ton:${spoken}`);
    });
    const { run } = probeRun(3);

    const code = await runVoice([dir], { provider, run });

    expect(code).toBe(1);
    expect(text(out)).toContain("1 erzeugt, 0 uebersprungen, 1 fehlgeschlagen");
    expect(text(err)).toContain("b001");
    expect(text(err)).toContain("Dienst weg");

    // Der erfolgreiche Block ist gespeichert, der kaputte behaelt seinen alten Ton.
    const project = await loadProject(dir);
    expect(project.blocks[0]?.tts).toBeUndefined();
    expect(project.blocks[1]?.tts?.file).toBe("audio/tts/b002.wav");
    expect(await readFile(join(dir, "audio", "tts", "b002.wav"))).toEqual(Buffer.from("ton:Gut"));
    expect((await readdir(join(dir, "audio", "tts"))).sort()).toEqual(["b002.wav"]);
  });

  it("behaelt den alten Ton, wenn die Messung scheitert", async () => {
    const alt = {
      file: "audio/tts/b001.wav",
      duration: 1,
      hash: "alt",
      generated_at: "2026-10-01T00:00:00.000Z",
    };
    const dir = await tempProject(beispiel([block({ id: "b001", text: "Neu", tts: alt })]));
    await mkdir(join(dir, "audio", "tts"), { recursive: true });
    await writeFile(join(dir, "audio", "tts", "b001.wav"), "alter Ton", "utf8");
    const provider = fakeProvider(async () => Buffer.from("neuer Ton"));
    const run: RunFn = async () => ({ stdout: "", stderr: "kein Ton", code: 1 });

    const code = await runVoice([dir], { provider, run });

    expect(code).toBe(1);
    expect(text(err)).toContain("b001");
    expect(text(err)).toMatch(/ffprobe scheiterte/);
    const project = await loadProject(dir);
    expect(project.blocks[0]?.tts).toEqual(alt);
    // Die alte Datei ist unberuehrt, keine Nebendatei bleibt liegen.
    expect(await readFile(join(dir, "audio", "tts", "b001.wav"), "utf8")).toBe("alter Ton");
    expect((await readdir(join(dir, "audio", "tts"))).sort()).toEqual(["b001.wav"]);
  });
});

describe("runRender", () => {
  it("nennt ohne Ordner die Nutzung und endet mit 2", async () => {
    const code = await runRender([]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("render <ordner>");
    expect(out).toEqual([]);
  });

  it("weist unbekannte Schalter als Bedienfehler ab", async () => {
    const code = await runRender([".", "--schnell"]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });

  it("meldet ein fehlendes Projekt als Fehler", async () => {
    const leer = await mkdtemp(join(tmpdir(), "vw-commands-"));

    const code = await runRender([leer]);

    expect(code).toBe(1);
    expect(text(err)).toMatch(/Fehler/);
    expect(out).toEqual([]);
  });

  it("verweigert Ueberlaenge ohne --allow-overflow und nennt die Bloecke", async () => {
    const dir = await tempProject(beispiel([
      block({ tts: { file: "audio/tts/b001.wav", duration: 20, hash: "h", generated_at: "x" } }),
    ]));
    const { calls, run } = recordingRun();

    const code = await runRender([dir], { run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/Ueberlaenge bei: b001/);
    expect(out).toEqual([]);
    // Der Plan bricht ab, bevor ein Prozess laeuft.
    expect(calls).toEqual([]);
  });

  it("laesst Ueberlaenge mit --allow-overflow durch und warnt", async () => {
    const dir = await tempProject(beispiel([
      block({ tts: { file: "audio/tts/b001.wav", duration: 20, hash: "h", generated_at: "x" } }),
    ]));
    const { calls, run } = recordingRun();

    const code = await runRender([dir, "--allow-overflow"], { run });

    // Der eingehakte Prozess scheitert; wichtig ist, dass der Lauf nicht schon
    // am Plan abbricht und der Schalter ankommt.
    expect(code).toBe(1);
    expect(text(err)).toContain("ffmpeg scheiterte");
    expect(text(err)).not.toMatch(/Ueberlaenge bei/);
    expect(text(warning)).toMatch(/Ueberlaenge/);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("verweigert unfertige Bloecke ohne --allow-incomplete und nennt die Bloecke", async () => {
    const dir = await tempProject(beispiel([
      block({ tts: { file: "audio/tts/b001.wav", duration: 8, hash: "h", generated_at: "x" } }),
      block({ id: "b002", text: undefined, tts: undefined }),
    ]));
    const { calls, run } = recordingRun();

    const code = await runRender([dir], { run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/b002/);
    expect(out).toEqual([]);
    // Der Plan bricht ab, bevor ein Prozess laeuft.
    expect(calls).toEqual([]);
  });

  it("rendert unfertige Bloecke mit --allow-incomplete und warnt", async () => {
    const dir = await tempProject(beispiel([
      block({ tts: { file: "audio/tts/b001.wav", duration: 8, hash: "h", generated_at: "x" } }),
      block({ id: "b002", text: undefined, tts: undefined }),
    ]));
    const { calls, run } = recordingRun();

    const code = await runRender([dir, "--allow-incomplete"], { run });

    // Der eingehakte Prozess scheitert; wichtig ist, dass der Lauf nicht schon
    // am Plan abbricht und der Schalter ankommt.
    expect(code).toBe(1);
    expect(text(err)).toContain("ffmpeg scheiterte");
    expect(text(err)).not.toMatch(/Unfertige Bloecke/);
    expect(text(warning)).toMatch(/b002/);
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("runIngest", () => {
  it("nennt ohne Pfade die Nutzung und endet mit 2", async () => {
    const code = await runIngest([]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("ingest <ordner> <video>");
    expect(out).toEqual([]);
  });

  it("nennt mit nur einem Pfad die Nutzung", async () => {
    const code = await runIngest(["ordner"]);
    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });

  it("weist unbekannte Schalter als Bedienfehler ab", async () => {
    const dir = await tempProject(beispiel());

    const code = await runIngest([dir, "video.mp4", "--schnell"], { run: recordingRun().run });

    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    // Nichts angefasst: die Wahrheitsdatei bleibt unveraendert.
    expect(await loadProject(dir)).toEqual(beispiel());
  });

  it("nimmt --label an und meldet die neue Quelle", async () => {
    const dir = await tempProject(beispiel([], { sources: [] }));
    const video = join(dir, "aufnahme.mp4");
    await writeFile(video, "rohe Videodaten", "utf8");

    const code = await runIngest([dir, video, "--label", "Kamera A"], { run: ingestRun(video) });

    expect(code).toBe(0);
    expect(text(out)).toContain("s01");
    expect(text(out)).toContain("Kamera A");
    expect(err).toEqual([]);
    const project = await loadProject(dir);
    expect(project.sources).toHaveLength(1);
    expect(project.sources[0]?.label).toBe("Kamera A");
    // Die Dauer stammt von der abgelegten Datei, nicht von der Quelle davor.
    expect(project.sources[0]?.duration).toBe(7.4);
  });
});
