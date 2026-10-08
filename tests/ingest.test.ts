import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CURRENT_SCHEMA, loadProject, saveProject } from "../src/lib/project.js";
import { ingest } from "../src/steps/ingest.js";
import type { RunFn, RunResult } from "../src/lib/ffmpeg.js";
import type { Project } from "../src/lib/types.js";

/** Echte ffprobe-Ausgabe der festgelegten Bildabfrage, gekuerzt auf die Felder. */
function videoProbe(
  width: number, height: number, rate: string, duration: number,
): unknown {
  return {
    programs: [],
    stream_groups: [],
    streams: [{ codec_name: "h264", width, height, r_frame_rate: rate }],
    format: { duration: duration.toFixed(6) },
  };
}

/** Echte ffprobe-Ausgabe der Tonabfrage, wenn eine AAC-Tonspur da ist. */
const AUDIO_PROBE = {
  programs: [],
  stream_groups: [],
  streams: [{ codec_name: "aac" }],
};

/** Echte ffprobe-Ausgabe der Tonabfrage ohne Tonspur. */
const NO_AUDIO_PROBE = {
  programs: [],
  stream_groups: [],
  streams: [],
};

interface FakeRun {
  calls: Array<{ bin: string; args: string[] }>;
  run: RunFn;
}

/**
 * Eingehaktes run: ffprobe liefert die Vorlage (Bild oder Ton am a:0-Merkmal,
 * fuer die abgelegte raw.mp4 die optionale Zielvorlage), ffmpeg legt sein
 * Ausgabeziel an, damit die Pruefsumme es lesen kann.
 */
function fakeRun(
  video: unknown,
  options: { failFfmpeg?: boolean; target?: unknown; audio?: unknown } = {},
): FakeRun {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const run: RunFn = async (bin, args): Promise<RunResult> => {
    calls.push({ bin, args: [...args] });
    if (bin === "ffprobe") {
      const file = args[args.length - 1] ?? "";
      let fixture = video;
      if (args.includes("a:0")) fixture = options.audio ?? AUDIO_PROBE;
      else if (options.target !== undefined && file.endsWith("raw.mp4")) fixture = options.target;
      return { stdout: JSON.stringify(fixture), stderr: "", code: 0 };
    }
    if (options.failFfmpeg) {
      return { stdout: "", stderr: "Fehlerausgabe von ffmpeg", code: 1 };
    }
    const target = args[args.length - 1] ?? "";
    await writeFile(target, "erzeugt", "utf8");
    return { stdout: "", stderr: "", code: 0 };
  };
  return { calls, run };
}

/** Das Beispiel aus Abschnitt 7 der Spezifikation. */
function beispiel(over: Partial<Project> = {}): Project {
  return {
    schema: CURRENT_SCHEMA,
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

/** Ein frischer Projektordner mit Wahrheitsdatei. */
async function tempProject(over: Partial<Project> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vw-ingest-"));
  await saveProject(dir, beispiel(over));
  return dir;
}

/** Eine Datei, die der Ingest als Aufnahme liest. */
async function inputFile(
  dir: string, name: string, bytes: Buffer = Buffer.from("rohe Videodaten"),
): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, bytes);
  return file;
}

describe("ingest", () => {
  it("setzt beim ersten Ingest das Projektformat und legt die Quelle an", async () => {
    const dir = await tempProject();
    const bytes = Buffer.from("rohe Videodaten");
    const videoPath = await inputFile(dir, "aufnahme.mp4", bytes);
    const { calls, run } = fakeRun(videoProbe(1280, 720, "25/1", 7.5));

    const source = await ingest(dir, videoPath, "Kamera A", { run });

    expect(source).toEqual({
      id: "s01",
      label: "Kamera A",
      file: "sources/s01/raw.mp4",
      added: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      duration: 7.5,
      checksum: expect.stringMatching(/^[0-9a-f]{32}$/),
      normalized: false,
    });
    const project = await loadProject(dir);
    expect(project.format).toEqual({ fps: 25, width: 1280, height: 720 });
    expect(project.sources).toEqual([source]);

    // Das Original wird unveraendert kopiert; die Pruefsumme deckt Groesse
    // und Inhalt.
    expect(await readFile(join(dir, "sources", "s01", "raw.mp4"))).toEqual(bytes);
    const erwartet = createHash("sha256")
      .update(String(bytes.length))
      .update(bytes)
      .digest("hex")
      .slice(0, 32);
    expect(source.checksum).toBe(erwartet);

    // Ton als 48-kHz-WAV, Standbilder alle 10 s, mehr laeuft nicht durch ffmpeg.
    // Das eingehakte run sieht das volle argv samt fester Schalter.
    const ffmpeg = calls.filter((call) => call.bin === "ffmpeg");
    expect(ffmpeg).toHaveLength(2);
    expect(ffmpeg[0]?.args).toEqual([
      "-hide_banner", "-nostdin",
      "-y", "-i", join(dir, "sources", "s01", "raw.mp4"),
      "-vn", "-ac", "1", "-ar", "48000",
      join(dir, "sources", "s01", "source.wav"),
    ]);
    expect(ffmpeg[1]?.args).toEqual([
      "-hide_banner", "-nostdin",
      "-y", "-i", join(dir, "sources", "s01", "raw.mp4"),
      "-vf", "fps=1/10", "-pix_fmt", "yuvj420p", "-q:v", "4",
      join(dir, "sources", "s01", "frames", "t%04d.jpg"),
    ]);
  });

  it("bringt eine zweite Quelle mit abweichendem Format auf das Projektformat", async () => {
    const dir = await tempProject();
    const erste = await inputFile(dir, "erste.mp4", Buffer.from("erste"));
    await ingest(dir, erste, "Erste", { run: fakeRun(videoProbe(1280, 720, "25/1", 4)).run });

    const zweite = await inputFile(dir, "zweite.mp4", Buffer.from("zweite"));
    const zweiterLauf = fakeRun(videoProbe(1920, 1080, "30/1", 3), {
      target: videoProbe(1280, 720, "25/1", 2.98),
    });
    const source = await ingest(dir, zweite, "Zweite", { run: zweiterLauf.run });

    expect(source.id).toBe("s02");
    expect(source.normalized).toBe(true);
    expect(source.file).toBe("sources/s02/raw.mp4");
    // Die Dauer stammt vom abgelegten Film, nicht von der Zieldatei davor.
    expect(source.duration).toBe(2.98);

    // Das Projektformat bleibt das der ersten Quelle.
    const project = await loadProject(dir);
    expect(project.format).toEqual({ fps: 25, width: 1280, height: 720 });

    const normalisiert = zweiterLauf.calls.find((call) => call.bin === "ffmpeg");
    expect(normalisiert?.args).toEqual([
      "-hide_banner", "-nostdin",
      "-y", "-i", zweite,
      "-vf", "scale=1280:720:flags=lanczos,fps=25",
      "-c:v", "libx264", "-preset", "medium", "-crf", "16",
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
      join(dir, "sources", "s02", "raw.mp4"),
    ]);
  });

  it("kopiert eine zweite Quelle mit gleichem Format und erkennt dieselbe Datei wieder", async () => {
    const dir = await tempProject();
    const videoPath = await inputFile(dir, "aufnahme.mp4");
    const fixture = videoProbe(1280, 720, "25/1", 7.5);

    const erste = await ingest(dir, videoPath, "Kamera A", { run: fakeRun(fixture).run });
    const zweiterLauf = fakeRun(fixture);
    const zweite = await ingest(dir, videoPath, "Kamera A", { run: zweiterLauf.run });

    expect(erste.id).toBe("s01");
    expect(zweite.id).toBe("s02");
    expect(zweite.normalized).toBe(false);
    expect(await readFile(join(dir, "sources", "s02", "raw.mp4"))).toEqual(
      await readFile(videoPath),
    );
    // Gleiche Datei, gleiche Pruefsumme.
    expect(zweite.checksum).toBe(erste.checksum);
    // Kein Normalisieren: kein ffmpeg-Aufruf mit scale.
    expect(zweiterLauf.calls.filter((call) => call.args.some((arg) => arg.startsWith("scale=")))).toEqual([]);
  });

  it("haelt eine Bildrate innerhalb der Toleranz fuer gleich", async () => {
    const dir = await tempProject();
    const videoPath = await inputFile(dir, "ntsc.mp4");
    await ingest(dir, videoPath, "Erste", {
      run: fakeRun(videoProbe(1920, 1080, "30000/1001", 5)).run,
    });

    // 29,97 statt 29,97002997: innerhalb der Toleranz von 0,01.
    const zweite = await ingest(dir, videoPath, "Zweite", {
      run: fakeRun(videoProbe(1920, 1080, "2997/100", 5)).run,
    });

    expect(zweite.normalized).toBe(false);
  });

  it("nimmt den Dateinamen, wenn kein Label angegeben ist", async () => {
    const dir = await tempProject();
    const videoPath = await inputFile(dir, "kamera-b.mp4");

    const source = await ingest(dir, videoPath, "", {
      run: fakeRun(videoProbe(1280, 720, "25/1", 2)).run,
    });

    expect(source.label).toBe(basename(videoPath));
  });

  it("laesst die Wahrheitsdatei unberuehrt, wenn ffmpeg scheitert", async () => {
    const dir = await tempProject();
    const erste = await inputFile(dir, "erste.mp4");
    await ingest(dir, erste, "Erste", { run: fakeRun(videoProbe(1280, 720, "25/1", 4)).run });
    const vorher = await loadProject(dir);

    const zweite = await inputFile(dir, "zweite.mp4");
    const fehlLauf = fakeRun(videoProbe(1920, 1080, "30/1", 3), { failFfmpeg: true });
    const fehler = await ingest(dir, zweite, "Zweite", { run: fehlLauf.run }).then(
      () => {
        throw new Error("ingest haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("ffmpeg scheiterte (Exit 1)");
    expect(fehler).toContain("Fehlerausgabe von ffmpeg");
    expect(await loadProject(dir)).toEqual(vorher);
  });

  it("lehnt eine Quelle ohne Tonspur ab, bevor etwas angelegt wird", async () => {
    const dir = await tempProject();
    const vorher = await loadProject(dir);
    const videoPath = await inputFile(dir, "stumm.mp4");
    const stummLauf = fakeRun(videoProbe(1280, 720, "25/1", 5), { audio: NO_AUDIO_PROBE });

    const fehler = await ingest(dir, videoPath, "Stumm", { run: stummLauf.run }).then(
      () => {
        throw new Error("ingest haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("keine Tonspur");
    expect(fehler).toContain("stumm.mp4");
    // Nichts angelegt: Wahrheitsdatei unveraendert, kein sources-Ordner.
    expect(await loadProject(dir)).toEqual(vorher);
    expect(await readdir(dir)).not.toContain("sources");
  });

  it("lehnt eine Quelle ohne brauchbares Bildformat ab, bevor das Projektformat gesetzt wird", async () => {
    const dir = await tempProject();
    const vorher = await loadProject(dir);

    // Unlesbare Bildrate ("0/0" wird zu 0) wuerde das Projektformat vergiften.
    const ohneRate = await inputFile(dir, "ohne-rate.mp4");
    const rateFehler = await ingest(dir, ohneRate, "Ohne Rate", {
      run: fakeRun(videoProbe(1920, 1080, "0/0", 5)).run,
    }).then(
      () => {
        throw new Error("ingest haette werfen muessen");
      },
      (error: Error) => error.message,
    );
    expect(rateFehler).toContain("kein brauchbares Bildformat");

    // Fehlende Abmessungen sind genauso unbrauchbar.
    const ohneBild = await inputFile(dir, "ohne-bild.mp4");
    const bildFehler = await ingest(dir, ohneBild, "Ohne Bild", {
      run: fakeRun(videoProbe(0, 0, "25/1", 5)).run,
    }).then(
      () => {
        throw new Error("ingest haette werfen muessen");
      },
      (error: Error) => error.message,
    );
    expect(bildFehler).toContain("kein brauchbares Bildformat");

    expect(await loadProject(dir)).toEqual(vorher);
    expect(await readdir(dir)).not.toContain("sources");
  });

  it("liest fuer die Pruefsumme hoechstens die ersten 8 MB", async () => {
    const dir = await tempProject();
    const gross = Buffer.alloc(9 * 1024 * 1024, 1);
    const videoPath = await inputFile(dir, "gross.mp4", gross);

    const source = await ingest(dir, videoPath, "Gross", {
      run: fakeRun(videoProbe(1280, 720, "25/1", 9)).run,
    });

    const erste8Mb = gross.subarray(0, 8 * 1024 * 1024);
    const erwartet = createHash("sha256")
      .update(String(gross.length))
      .update(erste8Mb)
      .digest("hex")
      .slice(0, 32);
    expect(source.checksum).toBe(erwartet);
  });
});
