import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReview } from "../src/commands/review.js";
import {
  analyzeOutput, findingsFor, latestOutput, parseLoudness, parseRanges, renderReviewMarkdown,
  type ReviewMeasurements,
} from "../src/lib/review.js";
import { CURRENT_SCHEMA, saveProject } from "../src/lib/project.js";
import type { RunFn, RunResult } from "../src/lib/ffmpeg.js";
import type { Block, Project } from "../src/lib/types.js";

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
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function text(lines: string[]): string {
  return lines.join("\n");
}

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

/** Das Beispielprojekt mit einer Quelle und einem fertigen Block (5 s Ton). */
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
      duration: 60,
      checksum: "c".repeat(32),
      normalized: false,
    }],
    blocks: [block()],
    capabilities: {},
    delivery: { targets: [] },
    ...over,
  };
}

async function tempProject(over: Partial<Project> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vw-review-"));
  await saveProject(dir, project(over));
  return dir;
}

interface Call {
  bin: string;
  args: string[];
}

/** Beobachtete Bildzeilen samt einer fremden Zeile und einem offenen Anfang. */
const DEFECT_PICTURE = [
  "[blackdetect @ 0x55] black_start:2.5 black_end:3.25 black_duration:0.75",
  "voellig fremde Zeile ohne Messwerte",
  "[freezedetect @ 0x55] lavfi.freezedetect.freeze_start: 4.001",
  "[freezedetect @ 0x55] lavfi.freezedetect.freeze_end: 6.5",
  "[freezedetect @ 0x55] lavfi.freezedetect.freeze_start: 9.0",
].join("\n");

const CLEAN_PICTURE = "keine Auffaelligkeiten";

/** Zwei I:-Zeilen; die Zusammenfassung am Ende zaehlt. */
const CLEAN_LOUDNESS = [
  "[Parsed_ebur128_0 @ 0x1] t: 1.00000 I: -70.0 LUFS LRA: 0.0 LU",
  "  Integrated loudness:",
  "    I:         -14.2 LUFS",
  "    Threshold: -24.6 LUFS",
].join("\n");

const DEFECT_LOUDNESS = [
  "[Parsed_ebur128_0 @ 0x1] Summary:",
  "  Integrated loudness:",
  "    I:         -12.5 LUFS",
].join("\n");

/**
 * Eingehakter run: ffprobe liefert das Projektformat, ffmpeg die Messzeilen.
 * Ohne defects ist die Messung sauber; mit defects sind alle vier Befundarten
 * angelegt.
 */
function fakeReviewRun(
  options: { duration?: number; defects?: boolean } = {},
): { calls: Call[]; run: RunFn } {
  const duration = options.duration ?? 5;
  const calls: Call[] = [];
  const run: RunFn = async (bin, args): Promise<RunResult> => {
    calls.push({ bin, args: [...args] });
    if (bin === "ffprobe") {
      if (args.includes("a:0")) {
        return { stdout: JSON.stringify({ streams: [{ codec_name: "aac" }] }), stderr: "", code: 0 };
      }
      const probe = {
        streams: [{ codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" }],
        format: { duration: duration.toFixed(6) },
      };
      return { stdout: JSON.stringify(probe), stderr: "", code: 0 };
    }
    const defects = options.defects === true;
    if (args.includes("ebur128")) {
      return { stdout: "", stderr: defects ? DEFECT_LOUDNESS : CLEAN_LOUDNESS, code: 0 };
    }
    return { stdout: "", stderr: defects ? DEFECT_PICTURE : CLEAN_PICTURE, code: 0 };
  };
  return { calls, run };
}

/** Eine Messung ohne Auffaelligkeiten; Abweichungen kommen ueber over. */
function measurements(over: Partial<ReviewMeasurements> = {}): ReviewMeasurements {
  return {
    duration: 5,
    width: 1080,
    height: 1920,
    fps: 30,
    hasAudio: true,
    blackRanges: [],
    freezeRanges: [],
    integratedLufs: -14.2,
    captionsPresent: true,
    ...over,
  };
}

describe("parseRanges", () => {
  it("liest Schwarzfenster aus echten blackdetect-Zeilen", () => {
    const stderr = [
      "[blackdetect @ 0x55] black_start:1.25 black_end:2.5 black_duration:1.25",
      "eine fremde Zeile ohne Messwerte",
      "[blackdetect @ 0x55] black_start:4 black_end:4.5 black_duration:0.5",
    ].join("\n");

    expect(parseRanges(stderr, "black_start", "black_end")).toEqual([[1.25, 2.5], [4, 4.5]]);
  });

  it("liest Standbildfenster aus getrennten freezedetect-Zeilen", () => {
    const stderr = [
      "irgendein Log",
      "[freezedetect @ 0x55] lavfi.freezedetect.freeze_start: 5.001",
      "noch eine fremde Zeile",
      "[freezedetect @ 0x55] lavfi.freezedetect.freeze_end: 7.2",
    ].join("\n");

    expect(parseRanges(stderr, "freeze_start", "freeze_end")).toEqual([[5.001, 7.2]]);
  });

  it("ueberspringt kaputte und unvollstaendige Zeilen, ohne zu werfen", () => {
    const stderr = [
      "black_start:keine-zahl black_end:2",
      "black_end:9.5",
      "black_start:4.5",
      "",
    ].join("\n");

    expect(parseRanges(stderr, "black_start", "black_end")).toEqual([]);
  });
});

describe("parseLoudness", () => {
  it("liest die integrierte Lautheit der Zusammenfassung, nicht den Fortschritt", () => {
    expect(parseLoudness(CLEAN_LOUDNESS)).toBe(-14.2);
  });

  it("liefert null ohne Treffer", () => {
    expect(parseLoudness("nur Gemurmel\nThreshold: -24 LUFS")).toBeNull();
    expect(parseLoudness("")).toBeNull();
  });
});

describe("latestOutput", () => {
  it("waehlt die neueste Datei", () => {
    expect(latestOutput([
      { name: "2026-10_test-01.mp4", mtimeMs: 100 },
      { name: "2026-10_test-02.mp4", mtimeMs: 300 },
      { name: "2026-10_test-03.mp4", mtimeMs: 200 },
    ])).toBe("2026-10_test-02.mp4");
  });

  it("ignoriert captions.ass und project.snapshot.json", () => {
    expect(latestOutput([
      { name: "2026-10_test-01.mp4", mtimeMs: 100 },
      { name: "captions.ass", mtimeMs: 300 },
      { name: "project.snapshot.json", mtimeMs: 400 },
    ])).toBe("2026-10_test-01.mp4");
  });

  it("liefert null ohne Ausgabedatei", () => {
    expect(latestOutput([])).toBeNull();
    expect(latestOutput([
      { name: "captions.ass", mtimeMs: 300 },
      { name: "project.snapshot.json", mtimeMs: 400 },
    ])).toBeNull();
  });
});

describe("analyzeOutput", () => {
  it("fuellt alle Messfelder aus Probe und den beiden ffmpeg-Laeufen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-review-"));
    const outDir = join(dir, "out");
    await mkdir(outDir, { recursive: true });
    const output = join(outDir, "2026-10_test-01.mp4");
    await writeFile(output, "video", "utf8");
    await writeFile(join(outDir, "captions.ass"), "untertitel", "utf8");
    const { calls, run } = fakeReviewRun({ duration: 12.5, defects: true });

    const m = await analyzeOutput(output, { captionsExpected: true }, run);

    expect(m).toEqual({
      duration: 12.5,
      width: 1080,
      height: 1920,
      fps: 30,
      hasAudio: true,
      blackRanges: [[2.5, 3.25]],
      freezeRanges: [[4.001, 6.5]],
      integratedLufs: -12.5,
      captionsPresent: true,
    });

    const ffmpeg = calls.filter((call) => call.bin === "ffmpeg");
    expect(ffmpeg).toHaveLength(2);
    expect(ffmpeg[0]?.args).toEqual(expect.arrayContaining([
      "-i", output,
      "-vf", "blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=2",
      "-an", "-f", "null", "-",
    ]));
    expect(ffmpeg[1]?.args).toEqual(expect.arrayContaining([
      "-i", output, "-af", "ebur128", "-f", "null", "-",
    ]));
  });

  it("meldet fehlende Untertitel, wenn sie erwartet sind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-review-"));
    const outDir = join(dir, "out");
    await mkdir(outDir, { recursive: true });
    const output = join(outDir, "2026-10_test-01.mp4");
    await writeFile(output, "video", "utf8");

    const m = await analyzeOutput(output, { captionsExpected: true }, fakeReviewRun().run);

    expect(m.captionsPresent).toBe(false);
  });

  it("ohne erwartete Untertitel gibt es keinen Untertitelbefund", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-review-"));
    const outDir = join(dir, "out");
    await mkdir(outDir, { recursive: true });
    const output = join(outDir, "2026-10_test-01.mp4");
    await writeFile(output, "video", "utf8");

    const m = await analyzeOutput(output, { captionsExpected: false }, fakeReviewRun().run);

    expect(m.captionsPresent).toBe(true);
  });
});

describe("findingsFor", () => {
  it("meldet bei sauberer Messung nichts", () => {
    expect(findingsFor(measurements(), 5, -14)).toEqual([]);
  });

  it("meldet die Dauerabweichung erst ueber 0,5 s", () => {
    expect(findingsFor(measurements({ duration: 5.5 }), 5, -14)).toEqual([]);

    const zuLang = findingsFor(measurements({ duration: 5.6 }), 5, -14);
    expect(zuLang.join(" ")).toContain("Dauer");
    expect(zuLang.join(" ")).toContain("0.60");

    const zuKurz = findingsFor(measurements({ duration: 4.4 }), 5, -14);
    expect(zuKurz.join(" ")).toContain("0.60");
  });

  it("meldet die Lautheit erst ausserhalb von 1 LU", () => {
    expect(findingsFor(measurements({ integratedLufs: -15 }), 5, -14)).toEqual([]);

    const findings = findingsFor(measurements({ integratedLufs: -12.9 }), 5, -14);
    expect(findings.join(" ")).toContain("Lautheit");
    expect(findings.join(" ")).toContain("1 LU");
  });

  it("meldet eine fehlende Lautheitsmessung nicht als Befund", () => {
    expect(findingsFor(measurements({ integratedLufs: null }), 5, -14)).toEqual([]);
  });

  it("meldet jedes Schwarzfenster", () => {
    const findings = findingsFor(measurements({
      blackRanges: [[2.5, 3.25], [7, 7.6]],
    }), 5, -14);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toContain("Schwarzfenster");
    expect(findings[0]).toContain("2.50");
  });

  it("meldet fehlende Untertitel", () => {
    const findings = findingsFor(measurements({ captionsPresent: false }), 5, -14);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("Untertitel");
  });
});

describe("renderReviewMarkdown", () => {
  it("traegt Messwerte, Toleranzen, Befunde und Datum", () => {
    const md = renderReviewMarkdown(
      measurements({
        duration: 12.5,
        blackRanges: [[2.5, 3.25]],
        freezeRanges: [[4.001, 6.5]],
        integratedLufs: -12.5,
        captionsPresent: false,
      }),
      11.75,
      -14,
      [
        "Schwarzfenster: 2.50 s bis 3.25 s (0.75 s).",
        "Untertitel fehlen: captions.ass liegt nicht neben der Ausgabe.",
      ],
      "2026-10-09",
    );

    expect(md).toContain("Datum: 2026-10-09");
    expect(md).toContain("12.50");
    expect(md).toContain("11.75");
    expect(md).toContain("1080x1920");
    expect(md).toContain("-12.5 LUFS");
    expect(md).toContain("4.00 s bis 6.50 s");
    expect(md).toContain("Toleranz 0.50 s");
    expect(md).toContain("1 LU");
    expect(md).toContain("Schwarzfenster: 2.50 s bis 3.25 s");
    expect(md).toContain("Untertitel fehlen");
    expect(md).toContain("## Befunde");
  });
});

describe("runReview", () => {
  it("nennt ohne Ordner die Nutzung und endet mit 2", async () => {
    const code = await runReview([]);

    expect(code).toBe(2);
    expect(text(err)).toContain("review <ordner>");
    expect(out).toEqual([]);
  });

  it("weist unbekannte Schalter als Bedienfehler ab", async () => {
    const code = await runReview([".", "--schnell"]);

    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });

  it("meldet einen fehlenden out-Ordner als Fehler", async () => {
    const dir = await tempProject();

    const code = await runReview([dir], { run: fakeReviewRun().run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/Keine Ausgabe/);
    expect(text(err)).toContain("out");
  });

  it("meldet einen leeren out-Ordner als Fehler", async () => {
    const dir = await tempProject();
    await mkdir(join(dir, "out"), { recursive: true });

    const code = await runReview([dir], { run: fakeReviewRun().run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/Keine Ausgabe/);
    expect(text(err)).toContain("out");
  });

  it("meldet einen ffprobe-Fehler mit Exit 1", async () => {
    const dir = await tempProject();
    await mkdir(join(dir, "out"), { recursive: true });
    await writeFile(join(dir, "out", "2026-10_test-01.mp4"), "video", "utf8");
    const run: RunFn = async () => ({ stdout: "", stderr: "kaputt", code: 1 });

    const code = await runReview([dir], { run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/ffprobe/);
  });

  it("schreibt bei sauberer Messung review.md, auch ueber eine alte Fassung", async () => {
    const dir = await tempProject();
    await mkdir(join(dir, "out"), { recursive: true });
    await writeFile(join(dir, "out", "2026-10_test-01.mp4"), "video", "utf8");
    await writeFile(join(dir, "out", "captions.ass"), "untertitel", "utf8");
    await writeFile(join(dir, "review.md"), "alt", "utf8");
    const { run } = fakeReviewRun();

    const code = await runReview([dir], {
      run,
      now: () => new Date("2026-10-09T12:00:00Z"),
    });

    expect(code).toBe(0);
    const md = await readFile(join(dir, "review.md"), "utf8");
    expect(md.startsWith("# Review")).toBe(true);
    expect(md).toContain("Datum: 2026-10-09");
    expect(md).toContain("Keine Befunde.");
    expect(text(out)).toContain("review.md");
    expect(err).toEqual([]);
  });

  it("berichtet Befunde, blockiert aber nicht: Exit 0 trotz Abweichungen", async () => {
    const dir = await tempProject();
    await mkdir(join(dir, "out"), { recursive: true });
    await writeFile(join(dir, "out", "2026-10_test-01.mp4"), "video", "utf8");
    const { run } = fakeReviewRun({ duration: 12.5, defects: true });

    const code = await runReview([dir], {
      run,
      now: () => new Date("2026-10-09T12:00:00Z"),
    });

    expect(code).toBe(0);
    const md = await readFile(join(dir, "review.md"), "utf8");
    for (const wort of ["Dauer", "Lautheit", "Schwarzfenster", "Untertitel"]) {
      expect(md).toContain(wort);
    }
  });
});
