import { describe, expect, it } from "vitest";
import type { RunFn, RunResult } from "../src/lib/ffmpeg.js";
import { detectSilences, parseSilences } from "../src/lib/silence.js";

/**
 * Echte silencedetect-Zeilen aus der ffmpeg-Fehlerausgabe: zwei vollstaendige
 * Paare, dazwischen Rauschen, am Ende ein Start ohne Ende.
 */
const LOG = [
  "[silencedetect @ 0x55d1] silence_start: 1.25",
  "[silencedetect @ 0x55d1] silence_end: 2.5 | silence_duration: 1.25",
  "frame=  125 fps=0.0 q=-0.0 size=N/A time=00:00:05.00 bitrate=N/A speed= 250x",
  "[silencedetect @ 0x55d1] silence_start: 5",
  "[silencedetect @ 0x55d1] silence_end: 6.75 | silence_duration: 1.75",
  "[silencedetect @ 0x55d1] silence_start: 9.5",
].join("\n");

/** Eingehaektes run: zeichnet jeden Aufruf auf und antwortet mit der Vorlage. */
function recorder(handler: (bin: string, args: string[]) => RunResult): {
  calls: Array<{ bin: string; args: string[] }>;
  run: RunFn;
} {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const run: RunFn = async (bin, args) => {
    calls.push({ bin, args: [...args] });
    return handler(bin, args);
  };
  return { calls, run };
}

describe("parseSilences", () => {
  it("liest zwei vollstaendige Paare und ignoriert einen Start ohne Ende", () => {
    expect(parseSilences(LOG)).toEqual([
      [1.25, 2.5],
      [5, 6.75],
    ]);
  });

  it("liefert ohne Paare eine leere Liste", () => {
    expect(parseSilences("")).toEqual([]);
    // Ein Ende ohne Start ergibt kein Paar.
    expect(parseSilences("frame=1\nsilence_end: 3.5")).toEqual([]);
  });
});

describe("detectSilences", () => {
  it("ruft ffmpeg mit dem erprobten Filter und liest stderr", async () => {
    const stderr = "silence_start: 1.25\nsilence_end: 2.5 | silence_duration: 1.25\n";
    const { calls, run } = recorder(() => ({ stdout: "wird nicht gelesen", stderr, code: 0 }));

    const silences = await detectSilences("aufnahme.wav", { run });

    expect(silences).toEqual([[1.25, 2.5]]);
    expect(calls).toEqual([
      {
        bin: "ffmpeg",
        args: [
          "-hide_banner", "-nostdin",
          "-i", "aufnahme.wav",
          "-af", "silencedetect=noise=-32dB:d=0.35",
          "-f", "null", "-",
        ],
      },
    ]);
  });

  it("nennt Befehl und Ende der Ausgabe, wenn ffmpeg scheitert", async () => {
    const { run } = recorder(() => ({
      stdout: "",
      stderr: "kaputt.wav: No such file or directory",
      code: 1,
    }));

    const fehler = await detectSilences("kaputt.wav", { run }).then(
      () => {
        throw new Error("detectSilences haette werfen muessen");
      },
      (error: Error) => error.message,
    );

    expect(fehler).toContain("silencedetect=noise=-32dB:d=0.35");
    expect(fehler).toContain("No such file or directory");
  });
});
