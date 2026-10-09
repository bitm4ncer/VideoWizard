import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { runHandoff } from "../src/commands/handoff.js";
import {
  buildIndexTsx, buildPackageJson, handoffDir, renderHandoff,
  type HandoffMedia,
} from "../src/lib/handoff.js";
import { CURRENT_SCHEMA, saveProject } from "../src/lib/project.js";
import type { RunFn, RunResult } from "../src/lib/ffmpeg.js";
import type { Block, Project } from "../src/lib/types.js";
import type { TranscriptWord } from "../src/lib/providers/transcript.js";

let out: string[] = [];
let err: string[] = [];
let warn: string[] = [];

// Die Ausgabe laeuft ueber console.log/console.error/console.warn. Der Test
// faengt genau die Zeilen ab, die die Befehle wirklich schreiben.
beforeEach(() => {
  out = [];
  err = [];
  warn = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    err.push(parts.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
    warn.push(parts.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function text(lines: string[]): string {
  return lines.join("\n");
}

/** Absolute Pfade reisen im JSX mit Schraegstrich, nicht mit Backslash. */
function posix(path: string): string {
  return path.split(sep).join("/");
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
  const dir = await mkdtemp(join(tmpdir(), "vw-handoff-"));
  await saveProject(dir, project(over));
  return dir;
}

/** Die Wortzeiten einer Quelle, wie `transcribe` sie ablegt. */
async function writeWords(
  dir: string,
  sourceId: string,
  words: TranscriptWord[],
): Promise<void> {
  const sourceDir = join(dir, "sources", sourceId);
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "words.json"), `${JSON.stringify(words, null, 2)}\n`, "utf8");
}

/** Die Medien eines Aufrufs; Abweichungen kommen ueber over. */
function media(over: Partial<HandoffMedia> = {}): HandoffMedia {
  return {
    pictures: new Map([["b001", "C:/projekt/sources/s01/raw.mp4"]]),
    holds: new Map(),
    audio: new Map(),
    captions: new Map(),
    ...over,
  };
}

interface Call {
  bin: string;
  args: string[];
}

/**
 * Eingehakter run: legt bei Erfolg die Zieldatei des Aufrufs wirklich an,
 * damit der Hand-off auf der Platte stimmt; mit fail scheitert er wie ein
 * kaputtes ffmpeg.
 */
function fakeRun(options: { fail?: boolean } = {}): { calls: Call[]; run: RunFn } {
  const calls: Call[] = [];
  const run: RunFn = async (bin, args): Promise<RunResult> => {
    calls.push({ bin, args: [...args] });
    if (options.fail === true) {
      return { stdout: "", stderr: "kaputt", code: 1 };
    }
    const target = args.at(-1);
    if (target !== undefined) {
      await writeFile(target, "png", "utf8").catch(() => undefined);
    }
    return { stdout: "", stderr: "", code: 0 };
  };
  return { calls, run };
}

describe("handoffDir", () => {
  it("nennt als Ziel handoff/diffusion-studio im Projekt", () => {
    const dir = join(tmpdir(), "vw-handoff-ziel");

    expect(handoffDir(dir)).toBe(join(resolve(dir), "handoff", "diffusion-studio"));
  });
});

describe("buildIndexTsx", () => {
  it("trimmt einen take-Block per sourceIn/sourceOut, stumm, mit absoluter Quelle", () => {
    // segment.ts schreibt "none" in jeden neuen Block; der Hand-off folgt
    // trotzdem dem computeFit-Ergebnis wie der Renderer: 5 s Bild, 5 s
    // Stimme, kein Schnitt moeglich, also wandert das Blockende auf 2,5 + 5.
    const tsx = buildIndexTsx(
      project({ blocks: [block({ source_in: 2.5, source_out: 8, fit: "none" })] }),
      media(),
    );

    expect(tsx.startsWith("export default function Project() {")).toBe(true);
    expect(tsx).toContain(
      '<scene id="b001" width={1080} height={1920} fill="black" active>',
    );
    // sourceIn/sourceOut trimmen die Quelle; start platziert das Kind nach
    // der sequence-Konvention auf der Szenenachse.
    expect(tsx).toContain('<sequence id="b001-sequence" end={5}>');
    expect(tsx).toContain(
      '<video id="b001-video-1" src="C:/projekt/sources/s01/raw.mp4" ' +
      "sourceIn={2.5} sourceOut={7.5} start={0} width={1080} height={1920} muted />",
    );
    expect(tsx).not.toContain("<audio");
    expect(tsx).not.toContain("<captions");
    expect(tsx.endsWith("}\n")).toBe(true);
  });

  it("baut fuer fit-trim eine sequence mit einem Video je behaltenem Bereich", () => {
    // 10 s Bild, 3 s Stimme, Pausen [2,5] und [7,9]: der Schnitt [2,5]
    // greift, das Blockende wandert auf 6; behalten bleiben [0,2] und [5,6].
    const nehmen = block({
      source_in: 0,
      source_out: 10,
      silences: [[2, 5], [7, 9]],
      tts: { file: "audio/tts/b001.wav", duration: 3, hash: "hash", generated_at: "2026-10-08" },
      fit: "trim",
    });

    const tsx = buildIndexTsx(project({ blocks: [nehmen] }), media());

    // Das letzte Kind endet bei 2 + (6 - 5) = 3 = tts.duration + pause_after.
    expect(tsx).toContain('<sequence id="b001-sequence" end={3}>');
    expect(tsx).toContain(
      '<video id="b001-video-1" src="C:/projekt/sources/s01/raw.mp4" ' +
      "sourceIn={0} sourceOut={2} start={0} width={1080} height={1920} muted />",
    );
    expect(tsx).toContain(
      '<video id="b001-video-2" src="C:/projekt/sources/s01/raw.mp4" ' +
      "sourceIn={5} sourceOut={6} start={2} width={1080} height={1920} muted />",
    );
    expect((tsx.match(/<video/g) ?? []).length).toBe(2);
    expect(tsx).toContain("        </sequence>");
  });

  it("setzt bei fit-hold das Haltebild als image hinter das gespielte Bild", () => {
    // 5 s Bild, 6 s Stimme: 0,9-fach verlangsamt (5,556 s), danach traegt
    // das extrahierte Haltebild bis zur Zieldauer 6.
    const halten = block({
      source_in: 0,
      source_out: 5,
      tts: { file: "audio/tts/b001.wav", duration: 6, hash: "hash", generated_at: "2026-10-08" },
      fit: "hold",
    });

    const tsx = buildIndexTsx(project({ blocks: [halten] }), media({
      holds: new Map([["b001", "C:/projekt/handoff/diffusion-studio/media/b001-hold.png"]]),
    }));

    expect(tsx).toContain('<sequence id="b001-sequence" end={6}>');
    expect(tsx).toContain(
      '<video id="b001-video-1" src="C:/projekt/sources/s01/raw.mp4" ' +
      "sourceIn={0} sourceOut={5} start={0} playbackRate={0.9} " +
      "width={1080} height={1920} muted />",
    );
    expect(tsx).toContain(
      '<image id="b001-hold" src="C:/projekt/handoff/diffusion-studio/media/b001-hold.png" ' +
      "start={5.556} end={6} width={1080} height={1920} />",
    );

    // Ohne extrahierten Halteframe bricht der Aufbau mit der Block-ID ab.
    expect(() => buildIndexTsx(project({ blocks: [halten] }), media())).toThrow(/b001/);
  });

  it("bricht bei fit-trim ohne verbleibenden Bildbereich mit der Block-ID ab", () => {
    const leer = block({
      source_in: 0,
      source_out: 10,
      tts: { file: "audio/tts/b001.wav", duration: 0, hash: "hash", generated_at: "2026-10-08" },
      fit: "trim",
    });

    expect(() => buildIndexTsx(project({ blocks: [leer] }), media())).toThrow(/b001/);
  });

  it("nutzt fuer einen still-Block ein image mit der Stimmlaenge als Ende", () => {
    const still = block({
      id: "b002",
      kind: "still",
      source_in: 12,
      source_out: 20,
      freeze_at: 14.25,
      pause_after: 0.5,
      tts: { file: "audio/tts/b002.wav", duration: 4, hash: "h", generated_at: "2026-10-08" },
    });
    const tsx = buildIndexTsx(project({ blocks: [still] }), media({
      pictures: new Map([["b002", "C:/projekt/handoff/diffusion-studio/media/b002.png"]]),
      audio: new Map([["b002", "C:/projekt/audio/tts/b002.wav"]]),
    }));

    expect(tsx).toContain(
      '<image id="b002-image" src="C:/projekt/handoff/diffusion-studio/media/b002.png" ' +
      "end={4.5} width={1080} height={1920} />",
    );
    // Ein still hat keinen Fit-Pfad; die rohe Stimmlaenge kappt das Padding.
    expect(tsx).toContain(
      '<audio id="b002-audio" src="C:/projekt/audio/tts/b002.wav" end={4} />',
    );
    expect(tsx).not.toContain("<video");
    // Ein Bild traegt keinen Quellton; muted gehoert nur ans video.
    expect(tsx).not.toContain("muted");
  });

  it("nimmt ohne Vertonung das Blockfenster als Standbildlaenge", () => {
    const still = block({
      id: "b002",
      kind: "still",
      source_in: 12,
      source_out: 20,
      tts: undefined,
    });
    const tsx = buildIndexTsx(project({ blocks: [still] }), media({
      pictures: new Map([["b002", "C:/projekt/frame.png"]]),
    }));

    expect(tsx).toContain("end={8} ");
  });

  it("kappt ein audio-Element auf die Blocklaenge der Sync-Logik", () => {
    // Echte Dateien sind wegen Encoder-Padding laenger als tts.duration;
    // ohne Ende schiebt der Ton die Szene hinter das Bild (check: Schwarz).
    // Die Blocklaenge ist die Zieldauer, nicht die rohe Stimmlaenge.
    const tsx = buildIndexTsx(project({ blocks: [block({ pause_after: 0.5 })] }), media({
      audio: new Map([["b001", "C:/projekt/audio/tts/b001.wav"]]),
    }));

    expect(tsx).toContain('<sequence id="b001-sequence" end={5.5}>');
    expect(tsx).toContain(
      '<audio id="b001-audio" src="C:/projekt/audio/tts/b001.wav" end={5.5} />',
    );
  });

  it("haengt nur bei vorhandenen Untertiteln ein captions-Element an", () => {
    const tsx = buildIndexTsx(project(), media({
      captions: new Map([["b001", "C:/projekt/handoff/diffusion-studio/captions/b001.srt"]]),
    }));

    expect(tsx).toContain(
      '<captions id="b001-captions" ' +
      'src="C:/projekt/handoff/diffusion-studio/captions/b001.srt" preset="classic" />',
    );
  });

  it("markiert nur die erste Szene als active und laesst Overlays aus", () => {
    const zweiter = block({
      id: "b002",
      overlays: [{ type: "text", at: 0, duration: 2, props: { text: "Overlay" } }],
    });
    const tsx = buildIndexTsx(project({ blocks: [block(), zweiter] }), media({
      pictures: new Map([["b001", "C:/a.mp4"], ["b002", "C:/b.mp4"]]),
    }));

    expect((tsx.match(/\bactive\b/g) ?? []).length).toBe(1);
    expect(tsx).toContain('<scene id="b002"');
    expect(tsx).not.toContain("<text");
    expect(tsx).not.toContain("Overlay");
  });

  it("wirft mit der Block-ID, wenn der Bildpfad fehlt", () => {
    expect(() => buildIndexTsx(project(), media({ pictures: new Map() })))
      .toThrow(/b001/);
  });
});

describe("buildPackageJson", () => {
  it("traegt name aus der Projekt-ID, displayName aus dem Titel und main index.tsx", () => {
    const pkg = JSON.parse(buildPackageJson(project())) as Record<string, unknown>;

    expect(pkg).toEqual({
      name: "2026-10_test",
      displayName: "Test",
      main: "index.tsx",
    });
    expect(buildPackageJson(project()).endsWith("\n")).toBe(true);
  });
});

describe("renderHandoff", () => {
  it("schreibt index.tsx, package.json und README.md und liefert die Dateien", async () => {
    const dir = await tempProject();
    const target = handoffDir(dir);
    const { calls, run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    expect(result.index).toBe(join(target, "index.tsx"));
    const rel = result.files.map((file) => file.slice(target.length + 1).split(sep).join("/"));
    expect(rel).toEqual(["README.md", "index.tsx", "package.json"]);
    for (const file of result.files) {
      expect((await stat(file)).isFile()).toBe(true);
    }

    const index = await readFile(result.index, "utf8");
    expect(index).toContain('<scene id="b001"');
    expect(index).toContain(`src="${posix(join(dir, "sources", "s01", "raw.mp4"))}"`);
    // 10 s Bild, 5 s Stimme ohne Pausen: der Renderer kuerzt hinten auf [0,5].
    expect(index).toContain('<sequence id="b001-sequence" end={5}>');
    expect(index).toContain("sourceIn={0} sourceOut={5} start={0}");
    expect(index).not.toContain("sourceOut={10}");
    expect(index).toContain("muted />");
    expect(index).toContain(
      `<audio id="b001-audio" src="${posix(join(dir, "audio", "tts", "b001.wav"))}" end={5} />`,
    );

    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8")) as {
      name: string;
      displayName: string;
      main: string;
    };
    expect(pkg).toEqual({ name: "2026-10_test", displayName: "Test", main: "index.tsx" });

    const readme = await readFile(join(target, "README.md"), "utf8");
    expect(readme).toContain(
      "Einweg: nach dem Hand-off ist Diffusion Studio fuer dieses Projekt der Master; " +
      "`project.json` bleibt Schnittplan-Snapshot.",
    );
    expect(readme).toContain(`diffusion open ${posix(target)}`);
    expect(readme).toContain("Fit-Schnitte der Sync-Logik");
    expect(readme).toContain(
      "Nicht uebernommen (v1): Overlays des Schnittplans, Musik, Outro.",
    );

    expect(calls.filter((call) => call.bin === "ffmpeg")).toEqual([]);
    expect(warn.join(" ")).toContain("Wortzeiten");
  });

  it("extrahiert ein Standbild bei freeze_at per ffmpeg und nutzt es als image", async () => {
    const still = block({
      id: "b002",
      kind: "still",
      source_in: 12,
      source_out: 20,
      freeze_at: 14.25,
      tts: { file: "audio/tts/b002.wav", duration: 4, hash: "h", generated_at: "2026-10-08" },
    });
    const dir = await tempProject({ blocks: [still] });
    const target = handoffDir(dir);
    const { calls, run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    const frame = join(target, "media", "b002.png");
    const ffmpeg = calls.filter((call) => call.bin === "ffmpeg");
    expect(ffmpeg).toHaveLength(1);
    expect(ffmpeg[0]?.args).toEqual(expect.arrayContaining([
      "-ss", "14.25", "-i", join(dir, "sources", "s01", "raw.mp4"), "-frames:v", "1",
    ]));
    // Extrahiert wird in den Temp-Ordner; der Dateiname ist der des Ziels.
    expect(ffmpeg[0]?.args.at(-1)).toMatch(/media[\\/]b002\.png$/);
    expect((await stat(frame)).isFile()).toBe(true);
    expect(result.files).toContain(frame);

    const index = await readFile(result.index, "utf8");
    expect(index).toContain(
      `<image id="b002-image" src="${posix(frame)}" end={4} width={1080} height={1920} />`,
    );
    expect(index).not.toContain("<video");
  });

  it("nennt bei gescheiterter Extraktion die Block-ID und hinterlaesst kein halbes Ziel", async () => {
    const dir = await tempProject({
      blocks: [block({ id: "b007", kind: "still", freeze_at: 3 })],
    });
    const target = handoffDir(dir);
    const { run } = fakeRun({ fail: true });

    await expect(renderHandoff(dir, target, { run })).rejects.toThrow(/b007/);
    await expect(stat(target)).rejects.toThrow();

    const leftover = (await readdir(join(dir, "handoff")))
      .filter((name) => name.startsWith(".handoff-tmp"));
    expect(leftover).toEqual([]);
  });

  it("verweigert einen belegten Zielordner mit Pfad und laesst ihn unberuehrt", async () => {
    const dir = await tempProject();
    const target = handoffDir(dir);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "alt.txt"), "alt", "utf8");
    const { run } = fakeRun();

    let message = "";
    try {
      await renderHandoff(dir, target, { run });
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    }

    expect(message).toContain(target);
    expect(message).toMatch(/force/i);
    expect(await readFile(join(target, "alt.txt"), "utf8")).toBe("alt");
    await expect(stat(join(target, "index.tsx"))).rejects.toThrow();
  });

  it("ersetzt mit force den belegten Zielordner vollstaendig", async () => {
    const dir = await tempProject();
    const target = handoffDir(dir);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "alt.txt"), "alt", "utf8");
    const { run } = fakeRun();

    const result = await renderHandoff(dir, target, { run, force: true });

    expect((await stat(result.index)).isFile()).toBe(true);
    await expect(stat(join(target, "alt.txt"))).rejects.toThrow();
  });

  it("nimmt einen leeren vorhandenen Zielordner an", async () => {
    const dir = await tempProject();
    const target = handoffDir(dir);
    await mkdir(target, { recursive: true });
    const { run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    expect((await stat(result.index)).isFile()).toBe(true);
  });

  it("legt die Wortzeiten als SRT auf die Ausgangsachse und nennt sie im captions-Element", async () => {
    const dir = await tempProject({ blocks: [block({ source_in: 2, source_out: 8 })] });
    await writeWords(dir, "s01", [
      { start: 1, end: 1.5, text: "davor" },
      { start: 2.5, end: 3, text: "Hallo" },
      { start: 3.1, end: 3.5, text: "Welt" },
      { start: 7.9, end: 8.2, text: "Schluss" },
    ]);
    const target = handoffDir(dir);
    const { run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    // Fit-trim auf [2,7]: "Schluss" liegt hinter dem gekuerzten Blockende
    // und entfaellt; "Hallo" und "Welt" liegen dicht genug fuer eine Zeile.
    const srt = join(target, "captions", "b001.srt");
    const lines = await readFile(srt, "utf8");
    expect(lines).toContain("1\n00:00:00,500 --> 00:00:01,500\nHallo Welt");
    expect(lines).not.toContain("davor");
    expect(lines).not.toContain("Schluss");
    expect(result.files).toContain(srt);

    const index = await readFile(result.index, "utf8");
    expect(index).toContain(
      `<captions id="b001-captions" src="${posix(srt)}" preset="classic" />`,
    );
    expect(warn).toEqual([]);
  });

  it("bildet Captions bei fit-trim auf die Ausgangsachse ab, ohne die Pause zu ueberdecken", async () => {
    // Behaltene Bereiche [0,2] und [5,6]: "Schnitt" endet am Schnittpunkt
    // (2,0), "Nach" beginnt danach (2,2). Ein Cue ueber der entfernten Pause
    // wuerde bis 2,6 reichen und faellt damit weg.
    const nehmen = block({
      source_in: 0,
      source_out: 10,
      silences: [[2, 5], [7, 9]],
      tts: { file: "audio/tts/b001.wav", duration: 3, hash: "hash", generated_at: "2026-10-08" },
      fit: "trim",
    });
    const dir = await tempProject({ blocks: [nehmen] });
    await writeWords(dir, "s01", [
      { start: 0.5, end: 1, text: "Vor" },
      { start: 1.5, end: 2.6, text: "Schnitt" },
      { start: 5.2, end: 6, text: "Nach" },
    ]);
    const target = handoffDir(dir);
    const { run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    const srt = join(target, "captions", "b001.srt");
    const lines = await readFile(srt, "utf8");
    expect(lines).toContain("1\n00:00:00,500 --> 00:00:02,000\nVor Schnitt");
    expect(lines).toContain("2\n00:00:02,200 --> 00:00:03,000\nNach");
    expect(lines).not.toContain("00:00:02,600");
    expect(result.files).toContain(srt);
    expect(warn).toEqual([]);
  });

  it("extrahiert bei fit-hold den Frame am Ende des Bildfensters per ffmpeg", async () => {
    const halten = block({
      source_in: 0,
      source_out: 5,
      tts: { file: "audio/tts/b001.wav", duration: 6, hash: "hash", generated_at: "2026-10-08" },
      fit: "hold",
    });
    const dir = await tempProject({ blocks: [halten] });
    const target = handoffDir(dir);
    const { calls, run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    const hold = join(target, "media", "b001-hold.png");
    const ffmpeg = calls.filter((call) => call.bin === "ffmpeg");
    expect(ffmpeg).toHaveLength(1);
    expect(ffmpeg[0]?.args).toEqual(expect.arrayContaining([
      "-ss", "5", "-i", join(dir, "sources", "s01", "raw.mp4"), "-frames:v", "1",
    ]));
    expect(ffmpeg[0]?.args.at(-1)).toMatch(/media[\\/]b001-hold\.png$/);
    expect((await stat(hold)).isFile()).toBe(true);
    expect(result.files).toContain(hold);

    const index = await readFile(result.index, "utf8");
    expect(index).toContain(
      `<image id="b001-hold" src="${posix(hold)}" start={5.556} end={6} ` +
      "width={1080} height={1920} />",
    );
  });

  it("folgt bei overflow dem vollen Bildfenster mit Zieldauer und warnt im README", async () => {
    const ueber = block({
      source_in: 0,
      source_out: 4,
      tts: { file: "audio/tts/b001.wav", duration: 6, hash: "hash", generated_at: "2026-10-08" },
      fit: "overflow",
    });
    const dir = await tempProject({ blocks: [ueber] });
    const target = handoffDir(dir);
    const { calls, run } = fakeRun();

    const result = await renderHandoff(dir, target, { run });

    // Wie der Render-Plan: das volle Bildfenster als eine kindlose Range,
    // die Szene spannt ueber die Zieldauer; kein Halteanteil.
    const index = await readFile(result.index, "utf8");
    expect(index).toContain('<sequence id="b001-sequence" end={6}>');
    expect(index).toContain(
      `<video id="b001-video-1" src="${posix(join(dir, "sources", "s01", "raw.mp4"))}" ` +
      "sourceIn={0} sourceOut={4} start={0} width={1080} height={1920} muted />",
    );
    expect(index).not.toContain("playbackRate");
    expect(index).not.toContain("<image");
    expect(calls).toEqual([]);

    const readme = await readFile(join(target, "README.md"), "utf8");
    expect(readme).toContain("Ueberlaenge bei b001");
    expect(readme).toContain("Bildfenster bleibt wie gewaehlt");
  });

  it("warnt ohne Wortzeiten und laesst die Untertitel aus, ohne zu scheitern", async () => {
    const dir = await tempProject();
    const { run } = fakeRun();

    const result = await renderHandoff(dir, handoffDir(dir), { run });

    const index = await readFile(result.index, "utf8");
    expect(index).not.toContain("<captions");
    expect(warn.join(" ")).toContain("Wortzeiten");
    expect(warn.join(" ")).toContain("Untertitel");
  });

  it("bricht ohne Quellen, ohne Bloecke oder mit unbekannter Quelle klar ab", async () => {
    const ohneQuellen = await tempProject({ sources: [] });
    await expect(renderHandoff(ohneQuellen, handoffDir(ohneQuellen), {}))
      .rejects.toThrow(/Quellen/);

    const ohneBloecke = await tempProject({ blocks: [] });
    await expect(renderHandoff(ohneBloecke, handoffDir(ohneBloecke), {}))
      .rejects.toThrow(/Bloecke/);

    const unbekannt = await tempProject({ blocks: [block({ source_id: "s99" })] });
    await expect(renderHandoff(unbekannt, handoffDir(unbekannt), {}))
      .rejects.toThrow(/s99/);
  });

  it("meldet eine fehlende Projektdatei klar", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-handoff-"));

    await expect(renderHandoff(dir, join(dir, "out"), {})).rejects.toThrow(/Projektdatei fehlt/);
  });
});

describe("runHandoff", () => {
  it("nennt ohne Ordner die Nutzung samt Schaltern und endet mit 2", async () => {
    const code = await runHandoff([]);

    expect(code).toBe(2);
    expect(text(err)).toContain("handoff <ordner> [--out <pfad>] [--force]");
    expect(out).toEqual([]);
  });

  it("weist unbekannte Schalter und ein leeres --out als Bedienfehler ab", async () => {
    expect(await runHandoff([".", "--schnell"])).toBe(2);
    expect(await runHandoff([".", "--out"])).toBe(2);
  });

  it("weist --out mit leerem Wert als Bedienfehler ab, statt aufs Arbeitsverzeichnis zu zielen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-handoff-"));

    const code = await runHandoff([dir, "--out", ""]);

    expect(code).toBe(2);
    expect(text(err)).toContain("handoff <ordner> [--out <pfad>] [--force]");
    expect(out).toEqual([]);
  });

  it("verweigert mit --force ein Ziel im Projekt oder darueber und laesst das Projekt unberuehrt", async () => {
    const base = await mkdtemp(join(tmpdir(), "vw-handoff-"));
    const dir = join(base, "projekt");
    await saveProject(dir, project());
    await mkdir(join(dir, "sources", "s01"), { recursive: true });
    await writeFile(join(dir, "sources", "s01", "raw.mp4"), "film", "utf8");

    const ziele = [dir, join(dir, "sources"), join(dir, "audio"), base];
    for (const ziel of ziele) {
      const code = await runHandoff([dir, "--out", ziel, "--force"], { run: fakeRun().run });

      expect(code, ziel).toBe(1);
      expect(text(err), ziel).toMatch(/Fehler/);
      expect(err.at(-1), ziel).toContain(ziel);
      expect(await readFile(join(dir, "sources", "s01", "raw.mp4"), "utf8"), ziel).toBe("film");
      expect((await stat(join(dir, "project.json"))).isFile(), ziel).toBe(true);
      await expect(stat(join(dir, "handoff")), ziel).rejects.toThrow();
    }
  });

  it("meldet ein fehlendes Projekt mit Exit 1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-handoff-"));

    const code = await runHandoff([dir], { run: fakeRun().run });

    expect(code).toBe(1);
    expect(text(err)).toMatch(/Fehler/);
    expect(text(err)).toContain("Projektdatei fehlt");
  });

  it("schreibt den Hand-off in den Vorgabeordner und meldet ihn", async () => {
    const dir = await tempProject();

    const code = await runHandoff([dir], { run: fakeRun().run });

    expect(code).toBe(0);
    expect(text(out)).toContain("Hand-off geschrieben");
    expect(text(out)).toContain(handoffDir(dir));
    expect((await stat(join(handoffDir(dir), "index.tsx"))).isFile()).toBe(true);
    expect(text(warn)).toContain("Wortzeiten");
  });

  it("nimmt mit --out einen anderen Zielordner", async () => {
    const dir = await tempProject();
    const custom = join(dir, "woanders");

    const code = await runHandoff([dir, "--out", custom], { run: fakeRun().run });

    expect(code).toBe(0);
    expect((await stat(join(custom, "index.tsx"))).isFile()).toBe(true);
    await expect(stat(handoffDir(dir))).rejects.toThrow();
  });

  it("verweigert einen belegten Zielordner und ersetzt ihn erst mit --force", async () => {
    const dir = await tempProject();
    const target = handoffDir(dir);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "alt.txt"), "alt", "utf8");

    const verweigert = await runHandoff([dir], { run: fakeRun().run });

    expect(verweigert).toBe(1);
    expect(text(err)).toContain(target);
    expect(text(err)).toMatch(/force/i);

    const ersetzt = await runHandoff([dir, "--force"], { run: fakeRun().run });

    expect(ersetzt).toBe(0);
    await expect(stat(join(target, "alt.txt"))).rejects.toThrow();
    expect((await stat(join(target, "index.tsx"))).isFile()).toBe(true);
  });
});
