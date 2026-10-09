import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { runMusic } from "../src/commands/music.js";
import { CURRENT_SCHEMA, loadProject, saveProject } from "../src/lib/project.js";
import type { MusicProvider, MusicRequest } from "../src/lib/providers/music.js";
import type { Block, Project } from "../src/lib/types.js";

let out: string[] = [];
let err: string[] = [];

// Die Ausgabe laeuft ueber console.log/console.error. Der Test faengt genau
// die Zeilen ab, die der Befehl wirklich schreibt.
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function text(lines: string[]): string {
  return lines.join("\n");
}

/** Ein Projekt mit acestep als Musik-Anbieter; Abweichungen kommen ueber over. */
function beispiel(over: Partial<Project> = {}): Project {
  return {
    schema: CURRENT_SCHEMA,
    id: "2026-10_test",
    title: "Test",
    format: { fps: 30, width: 1080, height: 1920 },
    language: { recorded: "de", output: "en" },
    sources: [],
    blocks: [],
    capabilities: { music: { provider: "acestep" } },
    delivery: { targets: [] },
    ...over,
  };
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

/** Ein frischer Projektordner mit Wahrheitsdatei. */
async function tempProject(project: Project): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vw-music-"));
  await saveProject(dir, project);
  return dir;
}

/**
 * Ein Musik-Anbieter, der die Wuensche aufzeichnet. `generate` weicht ueber den
 * uebergebenen Haken ab; die Kennung ist einstellbar, damit die Datei-Endung je
 * Anbieter pruefbar ist.
 */
function fakeProvider(
  generate: (req: MusicRequest) => Promise<Buffer>,
  id = "acestep",
): MusicProvider & { requests: MusicRequest[] } {
  const requests: MusicRequest[] = [];
  return {
    id,
    requests,
    detect: async () => true,
    generate: async (req) => {
      requests.push(req);
      return generate(req);
    },
  };
}

describe("runMusic: Datei uebernehmen", () => {
  it("kopiert nach audio/music.<endung>, legt audio an, meldet Vorhandenes und ersetzt es", async () => {
    const dir = await tempProject(beispiel({ audio: { voice_lufs: -15 } }));
    const erste = join(dir, "erste.WAV");
    await writeFile(erste, "erste Musik", "utf8");

    const code = await runMusic([dir, erste]);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    // Ohne vorhandene Musik gibt es keine Vorwarnung.
    expect(text(out)).not.toContain("Vorhandene Musik");
    let project = await loadProject(dir);
    expect(project.audio).toEqual({
      voice_lufs: -15,
      music: { file: "audio/music.wav", gain_db: -22, duck_db: -12 },
    });
    expect(await readFile(join(dir, "audio", "music.wav"))).toEqual(Buffer.from("erste Musik"));

    // Der zweite Lauf nennt die vorhandene Musik und ersetzt sie.
    const zweite = join(dir, "zweite.mp3");
    await writeFile(zweite, "zweite Musik", "utf8");
    out = [];

    const zweiterCode = await runMusic([dir, zweite]);

    expect(zweiterCode).toBe(0);
    expect(err).toEqual([]);
    expect(text(out)).toContain("Vorhandene Musik");
    expect(text(out)).toContain("audio/music.wav");
    expect(text(out)).toContain("gain_db -22");
    expect(text(out)).toContain("duck_db -12");
    project = await loadProject(dir);
    expect(project.audio).toEqual({
      voice_lufs: -15,
      music: {
        file: "audio/music.mp3",
        gain_db: -22,
        duck_db: -12,
      },
    });
    expect(await readFile(join(dir, "audio", "music.mp3"))).toEqual(Buffer.from("zweite Musik"));
  });

  it("meldet eine fehlende Datei mit dem Pfad und laesst das Projekt unberuehrt", async () => {
    const dir = await tempProject(beispiel({ audio: { voice_lufs: -15, master_lufs: -13 } }));
    const fehlt = join(dir, "gibtsnicht.mp3");

    const code = await runMusic([dir, fehlt]);

    expect(code).toBe(1);
    expect(text(err)).toContain(fehlt);
    // Nichts eingetragen: audio bleibt unveraendert.
    expect((await loadProject(dir)).audio).toEqual({ voice_lufs: -15, master_lufs: -13 });
    expect(existsSync(join(dir, "audio", "music.mp3"))).toBe(false);
  });
});

describe("runMusic: generate", () => {
  it("verweigert ohne --yes mit Kostenmeldung, ohne Provider-Aufruf und ohne Datei", async () => {
    const dir = await tempProject(beispiel());
    const provider = fakeProvider(async () => Buffer.from("klang"));

    const code = await runMusic(
      [dir, "generate", "--prompt", "ruhig, 90 bpm", "--seconds", "12.5"],
      { provider },
    );

    expect(code).toBe(1);
    expect(text(err)).toContain("acestep");
    expect(text(err)).toContain("12.5");
    expect(text(err)).toContain("--yes");
    expect(provider.requests).toEqual([]);
    expect(existsSync(join(dir, "audio"))).toBe(false);
    expect((await loadProject(dir)).audio?.music).toBeUndefined();
  });

  it("erzeugt mit --yes ueber den Anbieter und traegt audio/music.wav mit -22/-12 ein", async () => {
    const dir = await tempProject(beispiel());
    const provider = fakeProvider(async (req) => Buffer.from(`klang:${req.prompt}:${req.seconds}`));

    const code = await runMusic(
      [dir, "generate", "--prompt", "ruhig, 90 bpm", "--seconds", "12.5", "--yes"],
      { provider },
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(text(out)).toMatch(/erzeugt/);
    expect(provider.requests).toEqual([{ prompt: "ruhig, 90 bpm", seconds: 12.5 }]);
    const project = await loadProject(dir);
    expect(project.audio?.music).toEqual({
      file: "audio/music.wav",
      gain_db: -22,
      duck_db: -12,
    });
    expect(await readFile(join(dir, "audio", "music.wav"))).toEqual(
      Buffer.from("klang:ruhig, 90 bpm:12.5"),
    );
  });

  it("schreibt mit dem ElevenLabs-Anbieter audio/music.mp3", async () => {
    const dir = await tempProject(
      beispiel({ capabilities: { music: { provider: "elevenlabs" } } }),
    );
    const provider = fakeProvider(async () => Buffer.from("mp3"), "elevenlabs");

    const code = await runMusic(
      [dir, "generate", "--prompt", "ruhig", "--seconds", "3", "--yes"],
      { provider },
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const project = await loadProject(dir);
    expect(project.audio?.music?.file).toBe("audio/music.mp3");
    expect(await readFile(join(dir, "audio", "music.mp3"))).toEqual(Buffer.from("mp3"));
  });

  it("findet eine relative Schluesseldatei neben dem Projekt, auch aus einem fremden Arbeitsverzeichnis", async () => {
    const key = "sk-woanders-nie-auftauchen";
    const dir = await tempProject(beispiel({
      capabilities: { music: { provider: "elevenlabs", options: { secret: { file: "key.txt" } } } },
    }));
    await writeFile(join(dir, "key.txt"), `${key}\n`, "utf8");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const bytes = [4, 5, 6];
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
    const original = process.cwd();
    const elsewhere = await mkdtemp(join(tmpdir(), "vw-music-woanders-"));
    process.chdir(elsewhere);
    try {
      const code = await runMusic([dir, "generate", "--prompt", "ruhig", "--seconds", "5", "--yes"]);

      expect(code).toBe(0);
      expect(err).toEqual([]);
      expect(await readFile(join(dir, "audio", "music.mp3"))).toEqual(Buffer.from(bytes));
    } finally {
      process.chdir(original);
    }
  });

  it("nimmt ohne --seconds die Summe der Stimmdauern und Pausen vertonter Bloecke", async () => {
    const dir = await tempProject(beispiel({
      blocks: [
        block({
          id: "b001",
          pause_after: 1.5,
          tts: { file: "audio/tts/b001.wav", duration: 5.5, hash: "h", generated_at: "x" },
        }),
        // Ohne Ton zaehlt der Block nicht mit, auch nicht seine Pause.
        block({ id: "b002", text: undefined, pause_after: 2 }),
      ],
    }));
    const provider = fakeProvider(async () => Buffer.from("klang"));

    const code = await runMusic([dir, "generate", "--prompt", "ruhig", "--yes"], { provider });

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(provider.requests).toEqual([{ prompt: "ruhig", seconds: 7 }]);
  });

  it("wirft ohne --seconds und ohne Bloecke mit klarem Hinweis", async () => {
    const dir = await tempProject(beispiel());
    const provider = fakeProvider(async () => Buffer.from("klang"));

    const code = await runMusic([dir, "generate", "--prompt", "ruhig"], { provider });

    expect(code).toBe(1);
    expect(text(err)).toContain("--seconds");
    expect(text(err)).toMatch(/vertont/);
    expect(provider.requests).toEqual([]);
    expect(existsSync(join(dir, "audio"))).toBe(false);
  });

  it("wirft bei unbekanntem Anbieter mit Name und bekannten Endungen", async () => {
    const dir = await tempProject(beispiel());
    const provider = fakeProvider(async () => Buffer.from("klang"), "suno");

    const code = await runMusic(
      [dir, "generate", "--prompt", "ruhig", "--seconds", "5", "--yes"],
      { provider },
    );

    expect(code).toBe(1);
    expect(text(err)).toContain("suno");
    expect(text(err)).toMatch(/Endung/);
    expect(text(err)).toContain("acestep");
    expect(text(err)).toContain("elevenlabs");
    expect(provider.requests).toEqual([]);
    expect(existsSync(join(dir, "audio", "music.wav"))).toBe(false);
  });

  it("wirft bei unbekanntem Anbieter in der Projektdatei mit dem Namen", async () => {
    const dir = await tempProject(
      beispiel({ capabilities: { music: { provider: "suno" } } }),
    );

    const code = await runMusic(
      [dir, "generate", "--prompt", "ruhig", "--seconds", "5", "--yes"],
    );

    expect(code).toBe(1);
    expect(text(err)).toContain("suno");
    expect(text(err)).toContain("acestep");
  });
});

describe("runMusic: Bedienung", () => {
  it("nennt ohne Argumente die Nutzung und endet mit 2", async () => {
    const code = await runMusic([]);

    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
    expect(text(err)).toContain("music <ordner>");
    expect(out).toEqual([]);
  });

  it("weist fehlende Werte und unbekannte Schalter als Bedienfehler ab", async () => {
    // Nur der Ordner.
    expect(await runMusic(["."])).toBe(2);
    // generate ohne --prompt.
    expect(await runMusic(["ordner", "generate", "--seconds", "5"])).toBe(2);
    // Unbrauchbare Sekunden.
    expect(await runMusic(["ordner", "generate", "--prompt", "x", "--seconds", "viel"])).toBe(2);
    expect(await runMusic(["ordner", "generate", "--prompt", "x", "--seconds", "0"])).toBe(2);
    // Unbekannter Schalter beim Uebernehmen.
    expect(await runMusic(["ordner", "datei.mp3", "--lauter"])).toBe(2);
    // Erzeugungs-Schalter ohne generate.
    expect(await runMusic(["ordner", "datei.mp3", "--yes"])).toBe(2);
  });
});

describe("die Befehlsliste", () => {
  it("nennt music in der Hilfe", async () => {
    const code = await runCli(["help"]);

    expect(code).toBe(0);
    expect(text(out)).toContain("music");
    expect(err).toEqual([]);
  });

  it("leitet music ueber das CLI weiter", async () => {
    const code = await runCli(["music"]);

    expect(code).toBe(2);
    expect(text(err)).toMatch(/Aufruf/);
  });
});
