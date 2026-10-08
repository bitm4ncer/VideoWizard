import { describe, expect, it } from "vitest";
import { probe, runFfmpeg } from "../src/lib/ffmpeg.js";
import type { RunFn, RunResult } from "../src/lib/ffmpeg.js";

/**
 * Echte ffprobe-Ausgabe der festgelegten Bildabfrage, erzeugt mit
 * `ffprobe -v error -select_streams v:0 -show_entries
 * stream=width,height,r_frame_rate,codec_name -show_entries format=duration
 * -of json` aus einer 1920x1080-Datei mit 30000/1001 Bildern je Sekunde.
 */
const VIDEO_JSON = `{
    "programs": [

    ],
    "stream_groups": [

    ],
    "streams": [
        {
            "codec_name": "h264",
            "width": 1920,
            "height": 1080,
            "r_frame_rate": "30000/1001"
        }
    ],
    "format": {
        "duration": "12.345000"
    }
}`;

/** Echte ffprobe-Ausgabe der Tonabfrage, wenn eine AAC-Tonspur da ist. */
const AUDIO_JSON = `{
    "programs": [

    ],
    "stream_groups": [

    ],
    "streams": [
        {
            "codec_name": "aac"
        }
    ]
}`;

/** Echte ffprobe-Ausgabe der Tonabfrage ohne Tonspur. */
const NO_AUDIO_JSON = `{
    "programs": [

    ],
    "stream_groups": [

    ],
    "streams": [

    ]
}`;

/** Eingehaktes run: zeichnet jeden Aufruf auf und antwortet mit der Vorlage. */
function recorder(
  handler: (bin: string, args: string[]) => RunResult | Promise<RunResult>,
): { calls: Array<{ bin: string; args: string[] }>; run: RunFn } {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const run: RunFn = async (bin, args) => {
    calls.push({ bin, args: [...args] });
    return handler(bin, args);
  };
  return { calls, run };
}

/** Die festgelegte Bildabfrage; die Tonabfrage ist am a:0 zu erkennen. */
function probeHandler(video: string, audio: string) {
  return (_bin: string, args: string[]): RunResult => ({
    stdout: args.includes("a:0") ? audio : video,
    stderr: "",
    code: 0,
  });
}

describe("probe", () => {
  it("liest die festgelegte JSON-Abfrage und rechnet r_frame_rate um", async () => {
    const { calls, run } = recorder(probeHandler(VIDEO_JSON, AUDIO_JSON));

    const info = await probe("quelle.mp4", run);

    expect(info).toEqual({
      width: 1920,
      height: 1080,
      fps: 30000 / 1001,
      duration: 12.345,
      codec: "h264",
      hasAudio: true,
    });
    expect(calls[0]).toEqual({
      bin: "ffprobe",
      args: [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,codec_name",
        "-show_entries", "format=duration",
        "-of", "json",
        "quelle.mp4",
      ],
    });
    // Die festgelegte Abfrage sieht nur die Bildspur; der Ton braucht eine
    // eigene kleine JSON-Abfrage.
    expect(calls[1]).toEqual({
      bin: "ffprobe",
      args: [
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name",
        "-of", "json",
        "quelle.mp4",
      ],
    });
  });

  it("meldet hasAudio false, wenn keine Tonspur da ist", async () => {
    const { run } = recorder(probeHandler(VIDEO_JSON, NO_AUDIO_JSON));

    const info = await probe("stumm.mp4", run);

    expect(info.hasAudio).toBe(false);
  });

  it("wirft, wenn die Bildspur fehlt", async () => {
    const ohneBild = `{"streams": [], "format": {"duration": "1.000000"}}`;
    const { run } = recorder(() => ({ stdout: ohneBild, stderr: "", code: 0 }));

    await expect(probe("nur-ton.mp4", run)).rejects.toThrow(/keine Bildspur/);
  });

  it("nennt Befehl und Ausgabe, wenn ffprobe scheitert", async () => {
    const { run } = recorder(() => ({
      stdout: "",
      stderr: "fehlt.mp4: No such file or directory",
      code: 1,
    }));

    const fehler = await probe("fehlt.mp4", run).then(
      () => {
        throw new Error("probe haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("ffprobe scheiterte (Exit 1)");
    expect(fehler).toContain("-select_streams v:0");
    expect(fehler).toContain("fehlt.mp4");
    expect(fehler).toContain("No such file or directory");
  });

  it("nennt den Befehl, wenn ffprobe kein JSON liefert", async () => {
    const { run } = recorder(() => ({ stdout: "stream #0:0", stderr: "", code: 0 }));

    const fehler = await probe("kaputt.mp4", run).then(
      () => {
        throw new Error("probe haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("kein gueltiges JSON");
    expect(fehler).toContain("kaputt.mp4");
    expect(fehler).toContain("stream #0:0");
  });
});

describe("runFfmpeg", () => {
  it("liefert die Fehlerausgabe zurueck und setzt die festen Schalter", async () => {
    const { calls, run } = recorder(() => ({
      stdout: "wird nicht gelesen",
      stderr: "frame= 42 fps=0.0",
      code: 0,
    }));

    const ausgabe = await runFfmpeg(["-i", "in.mp4", "out.mp4"], run);

    expect(ausgabe).toBe("frame= 42 fps=0.0");
    expect(calls).toEqual([
      { bin: "ffmpeg", args: ["-hide_banner", "-nostdin", "-i", "in.mp4", "out.mp4"] },
    ]);
  });

  it("wirft mit Befehl und dem Ende der Ausgabe, wenn ffmpeg scheitert", async () => {
    const stderr = [
      "Anfang der Ausgabe",
      ...Array.from({ length: 15 }, (_, index) => `Zeile ${index}`),
      "Ende der Ausgabe",
    ].join("\n");
    const { run } = recorder(() => ({ stdout: "", stderr, code: 1 }));

    const fehler = await runFfmpeg(["-y", "-i", "in.mp4", "out.mp4"], run).then(
      () => {
        throw new Error("runFfmpeg haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("ffmpeg scheiterte (Exit 1)");
    expect(fehler).toContain("ffmpeg -hide_banner -nostdin -y -i in.mp4 out.mp4");
    expect(fehler).toContain("Ende der Ausgabe");
    expect(fehler).not.toContain("Anfang der Ausgabe");
  });
});
