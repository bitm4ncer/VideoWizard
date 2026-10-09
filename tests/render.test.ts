import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { nextOutputName, renderProject } from "../src/steps/render.js";
import { CURRENT_SCHEMA, saveProject } from "../src/lib/project.js";
import type { RunFn, RunResult } from "../src/lib/ffmpeg.js";
import type { Block, Project } from "../src/lib/types.js";

/** Ein fertiger Block; Abweichungen kommen ueber over. */
function block(over: Partial<Block> = {}): Block {
  return {
    id: "b001",
    kind: "take",
    source_id: "s01",
    source_in: 0,
    source_out: 10,
    silences: [],
    text: "Der Text",
    tts: {
      file: "audio/tts/b001.wav",
      duration: 5,
      hash: "hash",
      generated_at: "2026-10-08",
    },
    pause_after: 0,
    fit: "none",
    overlays: [],
    ...over,
  };
}

/** Das Beispielprojekt mit einer Quelle und einem fertigen Block. */
function project(over: Partial<Project> = {}): Project {
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
      duration: 10,
      checksum: "c".repeat(32),
      normalized: false,
    }],
    blocks: [block()],
    capabilities: {},
    delivery: { targets: [] },
    ...over,
  };
}

/**
 * Pruefsumme wie der Ingest: Sha256 ueber Dateigroesse und Inhalt, auf
 * 32 Zeichen gekuerzt. Im Test eigenstaendig gerechnet; die Vorlagen bleiben
 * deutlich unter den 8 MB des Ingests.
 */
async function checksumFor(file: string): Promise<string> {
  const bytes = await readFile(file);
  return createHash("sha256")
    .update(String(bytes.length))
    .update(bytes)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Ein frischer Projektordner mit Wahrheitsdatei. Jede Quelle liegt als Datei
 * bereit und ihre Pruefsumme passt; sonst wuerde der Quellencheck den Lauf
 * schon vor dem Plan abbrechen.
 */
async function tempProject(over: Partial<Project> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vw-render-"));
  const p = project(over);
  for (const source of p.sources) {
    const file = join(dir, source.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `Material ${source.id}`, "utf8");
    source.checksum = await checksumFor(file);
  }
  await saveProject(dir, p);
  return dir;
}

interface Call {
  bin: string;
  args: string[];
}

/** Echte ffprobe-Ausgabe der Bildabfrage, gekuerzt auf die gelesenen Felder. */
function videoProbe(duration = 10): unknown {
  return {
    streams: [{ codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" }],
    format: { duration: duration.toFixed(6) },
  };
}

/** Echte ffprobe-Ausgabe der Tonabfrage mit einer AAC-Tonspur. */
const AUDIO_PROBE = { streams: [{ codec_name: "aac" }] };

/**
 * Eingehaktes run: ffprobe antwortet mit der Vorlage, der Outro-Cache ist wie
 * eine fehlende Datei, ffmpeg legt sein Ausgabeziel an. Auf Wunsch scheitert
 * jeder NVENC-Lauf.
 */
function fakeRun(options: { failNvenc?: boolean } = {}): { calls: Call[]; run: RunFn } {
  const calls: Call[] = [];
  const run: RunFn = async (bin, args): Promise<RunResult> => {
    calls.push({ bin, args: [...args] });
    if (bin === "ffprobe") {
      const file = args[args.length - 1] ?? "";
      if (file.includes("outro-")) {
        return { stdout: "", stderr: "No such file or directory", code: 1 };
      }
      return {
        stdout: JSON.stringify(args.includes("a:0") ? AUDIO_PROBE : videoProbe()),
        stderr: "",
        code: 0,
      };
    }
    if (options.failNvenc === true && args.includes("h264_nvenc")) {
      return { stdout: "", stderr: "nvenc nicht verfuegbar", code: 1 };
    }
    await writeFile(args[args.length - 1] ?? "", "erzeugt", "utf8");
    return { stdout: "", stderr: "", code: 0 };
  };
  return { calls, run };
}

/** Nur die ffmpeg-Aufrufe eines Laufs. */
function ffmpegCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.bin === "ffmpeg");
}

/** Der Wert hinter einem Schalter, etwa hinter -filter_complex. */
function valueAfter(args: string[], flag: string): string {
  return args[args.indexOf(flag) + 1] ?? "";
}

describe("nextOutputName", () => {
  it("beginnt bei 01", () => {
    expect(nextOutputName([], "2026-10_test")).toBe("2026-10_test-01.mp4");
  });

  it("zaehlt hoch, statt zu ueberschreiben", () => {
    const existing = ["2026-10_test-01.mp4", "2026-10_test-02.mp4", "project.snapshot.json"];
    expect(nextOutputName(existing, "2026-10_test")).toBe("2026-10_test-03.mp4");
  });

  it("ignoriert fremde Dateien", () => {
    expect(nextOutputName(["anderes-07.mp4"], "2026-10_test")).toBe("2026-10_test-01.mp4");
  });

  it("fuellt zweistellig auf", () => {
    const existing = Array.from({ length: 9 }, (_, index) => `p-0${index + 1}.mp4`);
    expect(nextOutputName(existing, "p")).toBe("p-10.mp4");
  });
});

describe("renderProject", () => {
  it("rendert den Plan und legt das Video samt Projektstand in out ab", async () => {
    const dir = await tempProject();
    const { calls, run } = fakeRun();

    const output = await renderProject(dir, {}, { run });

    expect(output).toBe(join(dir, "out", "2026-10_test-01.mp4"));
    expect(await readFile(output, "utf8")).toBe("erzeugt");
    expect(await readFile(join(dir, "out", "project.snapshot.json"), "utf8")).toContain('"id"');

    const ffmpeg = ffmpegCalls(calls);
    // Der Schnitt ist auf die verbleibende Bilddauer gekuerzt, die
    // Zwischenformate bleiben yuv420p.
    const schnitt = ffmpeg.find((call) =>
      call.args.some((arg) => arg.includes("trim=start=0:end=5")));
    expect(schnitt).toBeDefined();
    expect(valueAfter(schnitt!.args, "-filter_complex")).toContain("fps=30[vout]");
    expect(schnitt!.args).toContain("yuv420p");

    // Stimme auf -16 LUFS, ohne Musik die Mischung auf -14 LUFS.
    const stimme = ffmpeg.find((call) =>
      call.args.some((arg) => arg.includes("loudnorm=I=-16:TP=-1.5:LRA=11")));
    expect(stimme).toBeDefined();
    const mischung = ffmpeg.find((call) => call.args.includes("-af"));
    expect(valueAfter(mischung!.args, "-af")).toBe("loudnorm=I=-14:TP=-1.5:LRA=11");

    // Der Endlauf encodiert mit NVENC; Ton als AAC mit 256k und 48 kHz.
    const final = ffmpeg[ffmpeg.length - 1];
    expect(final!.args).toContain("h264_nvenc");
    expect(final!.args).toEqual(expect.arrayContaining([
      "-preset", "p5", "-rc", "vbr", "-cq", "19",
    ]));
    expect(final!.args).toEqual(expect.arrayContaining([
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    ]));
  });

  it("zaehlt die Ausgabedatei hoch und ueberschreibt nie", async () => {
    const dir = await tempProject();
    await mkdir(join(dir, "out"), { recursive: true });
    await writeFile(join(dir, "out", "2026-10_test-01.mp4"), "alt", "utf8");
    const { run } = fakeRun();

    const output = await renderProject(dir, {}, { run });

    expect(output).toBe(join(dir, "out", "2026-10_test-02.mp4"));
    expect(await readFile(join(dir, "out", "2026-10_test-01.mp4"), "utf8")).toBe("alt");
  });

  it("bricht bei fehlender Musikdatei mit klarer Meldung ab, bevor etwas laeuft", async () => {
    const dir = await tempProject({ audio: { music: { file: "musik/bett.mp3" } } });
    const { calls, run } = fakeRun();

    await expect(renderProject(dir, {}, { run }))
      .rejects.toThrow(/Musikdatei fehlt: musik\/bett\.mp3/);

    expect(calls).toEqual([]);
  });

  it("bricht bei geaenderter Quelldatei mit Kennung, Beschriftung und Pfad ab, bevor ffmpeg laeuft", async () => {
    const dir = await tempProject();
    // Gleiche Groesse, anderer Inhalt: die Pruefsumme deckt den Inhalt.
    await writeFile(join(dir, "sources", "s01", "raw.mp4"), "Ausgetauscht", "utf8");
    const { calls, run } = fakeRun();

    const fehler = await renderProject(dir, {}, { run }).then(
      () => {
        throw new Error("render haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("s01");
    expect(fehler).toContain("Kamera A");
    expect(fehler).toContain("sources/s01/raw.mp4");
    expect(fehler).toMatch(/geaendert/);
    // Weder ffprobe noch ffmpeg laufen.
    expect(calls).toEqual([]);
  });

  it("mischt Musik mit den Vorgabewerten, wenn das Projekt sie nicht setzt", async () => {
    const dir = await tempProject({ audio: { music: { file: "musik/bett.mp3" } } });
    await mkdir(join(dir, "musik"), { recursive: true });
    await writeFile(join(dir, "musik", "bett.mp3"), "takt", "utf8");
    const { calls, run } = fakeRun();

    await renderProject(dir, {}, { run });

    const mix = ffmpegCalls(calls).find((call) =>
      valueAfter(call.args, "-filter_complex").includes("sidechaincompress="));
    expect(mix).toBeDefined();
    const filter = valueAfter(mix!.args, "-filter_complex");
    expect(filter).toContain("volume=-22dB");
    expect(filter).toContain("sidechaincompress=threshold=0.03");
    expect(filter).toContain("loudnorm=I=-14:TP=-1.5:LRA=11[aout]");
  });

  it("rendert ohne Outro und warnt, wenn die Datei fehlt", async () => {
    const dir = await tempProject({ outro: { file: "outro/fehlt.mp4" } });
    const { calls, run } = fakeRun();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const output = await renderProject(dir, {}, { run });

      expect(await readFile(output, "utf8")).toBe("erzeugt");
      const gemeldet = warn.mock.calls.map((entry) => String(entry[0])).join(" ");
      expect(gemeldet).toContain("Outro fehlt");
      expect(gemeldet).toContain("outro/fehlt.mp4");
      expect(ffmpegCalls(calls).some((call) => call.args.some((arg) => arg.includes("xfade="))))
        .toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it("bringt das Outro auf das Projektformat und blendet mit dem Vorgabewert ueber", async () => {
    const dir = await tempProject({ outro: { file: "outro/ende.mp4" } });
    await mkdir(join(dir, "outro"), { recursive: true });
    await writeFile(join(dir, "outro", "ende.mp4"), "outro", "utf8");
    const { calls, run } = fakeRun();

    await renderProject(dir, {}, { run });

    const ffmpeg = ffmpegCalls(calls);
    const normalisiert = ffmpeg.find((call) =>
      call.args.some((arg) => arg.includes("scale=1080:1920:flags=lanczos,fps=30")));
    expect(normalisiert).toBeDefined();
    const final = ffmpeg[ffmpeg.length - 1];
    const filter = valueAfter(final!.args, "-filter_complex");
    // Hauptvideo ist laut probe 10 s lang, der Vorgabewert ist 0.5 s.
    expect(filter).toContain("xfade=transition=fade:duration=0.5:offset=9.5");
    expect(filter).toContain("acrossfade=d=0.5");
  });

  it("weicht auf libx264 aus, wenn NVENC scheitert", async () => {
    const dir = await tempProject();
    const { calls, run } = fakeRun({ failNvenc: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const output = await renderProject(dir, {}, { run });

      expect(await readFile(output, "utf8")).toBe("erzeugt");
      const letzte = ffmpegCalls(calls).slice(-2);
      expect(letzte[0]!.args).toContain("h264_nvenc");
      expect(letzte[1]!.args).toEqual(expect.arrayContaining([
        "libx264", "-preset", "slow", "-crf", "18",
      ]));
      expect(warn.mock.calls.map((entry) => String(entry[0])).join(" "))
        .toContain("libx264");
    } finally {
      warn.mockRestore();
    }
  });

  it("haelt fuer einen still-Block einen Frame ueber die volle Dauer", async () => {
    const still = block({
      kind: "still",
      freeze_at: 3,
      tts: { file: "audio/tts/b001.wav", duration: 4, hash: "h", generated_at: "x" },
    });
    const dir = await tempProject({ blocks: [still] });
    const { calls, run } = fakeRun();

    await renderProject(dir, {}, { run });

    const ffmpeg = ffmpegCalls(calls);
    const frame = ffmpeg.find((call) => call.args.includes("-frames:v"));
    expect(frame!.args).toEqual([
      "-hide_banner", "-nostdin",
      "-y", "-ss", "3", "-i", join(dir, "sources", "s01", "raw.mp4"),
      "-frames:v", "1",
      join(dir, ".cache", "render", "frame-b001.png"),
    ]);
    const halten = ffmpeg.find((call) => call.args.includes("-loop"));
    expect(halten!.args).toEqual([
      "-hide_banner", "-nostdin",
      "-y", "-loop", "1", "-t", "4",
      "-i", join(dir, ".cache", "render", "frame-b001.png"),
      "-vf", "fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-an",
      join(dir, ".cache", "render", "seg-b001.mp4"),
    ]);
  });

  it("verweigert ein Projektformat mit ungeraden Kanten", async () => {
    const dir = await tempProject({ format: { fps: 30, width: 1081, height: 1920 } });
    const { calls, run } = fakeRun();

    await expect(renderProject(dir, {}, { run })).rejects.toThrow(/ungerade Kanten/);

    expect(calls).toEqual([]);
  });

  it("warnt ohne Wortzeiten und rendert ohne Untertitel, wenn captions gesetzt ist", async () => {
    const dir = await tempProject();
    const { calls, run } = fakeRun();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const output = await renderProject(dir, { captions: true }, { run });

      expect(await readFile(output, "utf8")).toBe("erzeugt");
      expect(warn.mock.calls.map((entry) => String(entry[0])).join(" "))
        .toMatch(/Untertitel/);
      expect(ffmpegCalls(calls).some((call) =>
        call.args.some((arg) => arg.includes("subtitles=")))).toBe(false);
      await expect(readFile(join(dir, "out", "captions.ass"), "utf8")).rejects.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  it("brennt mit captions die Wortzeiten als ASS und nimmt sie in den Endlauf", async () => {
    const dir = await tempProject();
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    await writeFile(join(dir, "sources", "s01", "words.json"), JSON.stringify([
      { start: 0.5, end: 1.2, text: "Hallo" },
      { start: 1.4, end: 2.0, text: "Welt" },
    ]), "utf8");
    const { calls, run } = fakeRun();

    await renderProject(dir, { captions: true }, { run });

    const assFile = join(dir, "out", "captions.ass");
    expect(await readFile(assFile, "utf8")).toContain(
      "Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Hallo Welt",
    );

    const ffmpeg = ffmpegCalls(calls);
    const brennen = ffmpeg.find((call) => valueAfter(call.args, "-vf").startsWith("subtitles="));
    expect(brennen).toBeDefined();
    const maskiert = assFile.replace(/\\/g, "/").replace(/:/g, "\\:");
    expect(valueAfter(brennen!.args, "-vf")).toBe(`subtitles='${maskiert}'`);

    // Der Endlauf nimmt die gebrannte Fassung.
    const final = ffmpeg[ffmpeg.length - 1];
    expect(valueAfter(final!.args, "-i")).toBe(join(dir, ".cache", "render", "main-captions.mp4"));
  });

  it("brennt vor dem Outro, der Endlauf blendet die Untertitel-Fassung ueber", async () => {
    const dir = await tempProject({ outro: { file: "outro/ende.mp4" } });
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    await mkdir(join(dir, "outro"), { recursive: true });
    await writeFile(join(dir, "sources", "s01", "words.json"), JSON.stringify([
      { start: 1, end: 2, text: "Hallo" },
    ]), "utf8");
    await writeFile(join(dir, "outro", "ende.mp4"), "outro", "utf8");
    const { calls, run } = fakeRun();

    await renderProject(dir, { captions: true }, { run });

    const ffmpeg = ffmpegCalls(calls);
    const brennenIndex = ffmpeg.findIndex((call) =>
      valueAfter(call.args, "-vf").startsWith("subtitles="));
    const final = ffmpeg[ffmpeg.length - 1];
    expect(brennenIndex).toBeGreaterThanOrEqual(0);
    expect(ffmpeg.indexOf(final!)).toBeGreaterThan(brennenIndex);
    expect(valueAfter(final!.args, "-i")).toBe(join(dir, ".cache", "render", "main-captions.mp4"));
    expect(valueAfter(final!.args, "-filter_complex")).toContain("xfade=");
  });
});
