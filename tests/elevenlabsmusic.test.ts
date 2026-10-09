import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  elevenlabsMusicProvider,
  toElevenLabsMusicOptions,
} from "../src/lib/providers/elevenlabs_music.js";
import { resolveMusicProvider } from "../src/lib/providers/music.js";
import type { FetchLike } from "../src/lib/providers/music.js";
import type { CapabilityChoice, Project } from "../src/lib/types.js";

const KEY = "sk-eleven-darf-nie-auftauchen";
const URL = "https://api.elevenlabs.io/v1/music";

/** Eine aufgezeichnete Anfrage: Methode, Adresse, Kopfzeilen und roher Rumpf. */
interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** fetch-Ersatz: antwortet der Reihe nach und zeichnet jede Anfrage auf. */
function stubFetch(answers: Array<() => Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      method: init?.method ?? "GET",
      url,
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    const answer = answers[index];
    index += 1;
    if (answer === undefined) throw new Error(`unerwarteter Aufruf: ${url}`);
    return answer();
  };
  return { fetch, calls };
}

/** Rohe Audiodaten als Antwort: der Musik-Endpunkt liefert kein JSON. */
function audio(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes), { status: 200 });
}

/** Der Rumpf einer aufgezeichneten Anfrage als Objekt. */
function bodyOf(call: Call | undefined): unknown {
  return JSON.parse(call?.body ?? "null");
}

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

/** Ein Projekt mit genau der Musikwahl. */
function music(choice: CapabilityChoice): Project {
  return project({ capabilities: { music: choice } });
}

describe("elevenlabsMusicProvider: erkennen", () => {
  it("ist wahr, wenn der Schluessel in der Vorgabe-Umgebungsvariable steht", async () => {
    const provider = elevenlabsMusicProvider({}, { env: { ELEVENLABS_API_KEY: KEY } });

    await expect(provider.detect()).resolves.toBe(true);
  });

  it("ist falsch ohne Schluessel und wirft nie, auch wenn das Netz nicht erreichbar waere", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("darf nicht aufgerufen werden");
    };
    const provider = elevenlabsMusicProvider({}, { fetch, env: {} });

    await expect(provider.detect()).resolves.toBe(false);
  });

  it("nimmt den Namen der Umgebungsvariable aus der gesetzten Quelle", async () => {
    const provider = elevenlabsMusicProvider(
      { secret: { env: "MEIN_ELEVEN_KEY" } },
      { env: { MEIN_ELEVEN_KEY: KEY } },
    );

    await expect(provider.detect()).resolves.toBe(true);
  });

  it("liest den Schluessel auch aus einer Datei der Quelle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-eleven-music-"));
    const file = join(dir, "key");
    await writeFile(file, `${KEY}\n`, "utf8");
    const provider = elevenlabsMusicProvider(
      { secret: { env: "ELEVENLABS_API_KEY", file } },
      { env: {} },
    );

    await expect(provider.detect()).resolves.toBe(true);
  });
});

describe("elevenlabsMusicProvider: einen Take erzeugen", () => {
  it("ruft /v1/music mit xi-api-key und dem Rumpf der Vorlage und liefert die Audiodaten", async () => {
    const bytes = [1, 2, 3];
    const { fetch, calls } = stubFetch([() => audio(bytes)]);
    const provider = elevenlabsMusicProvider(
      { model: "music_v2" },
      { fetch, env: { ELEVENLABS_API_KEY: KEY } },
    );

    const out = await provider.generate({ prompt: "deep house, 124 bpm", seconds: 60 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.headers["xi-api-key"]).toBe(KEY);
    expect(bodyOf(calls[0])).toEqual({
      prompt: "deep house, 124 bpm",
      music_length_ms: 60_000,
      model_id: "music_v2",
    });
    expect(out).toEqual(Buffer.from(bytes));
  });

  it("rechnet seconds um und nutzt ohne Modell die Vorgabe music_v2", async () => {
    const { fetch, calls } = stubFetch([() => audio([4])]);
    const provider = elevenlabsMusicProvider({}, { fetch, env: { ELEVENLABS_API_KEY: KEY } });

    await provider.generate({ prompt: "lofi", seconds: 12.5 });

    expect(bodyOf(calls[0])).toEqual({
      prompt: "lofi",
      music_length_ms: 12_500,
      model_id: "music_v2",
    });
  });

  it("ignoriert einen mitgegebenen Seed: er kommt nicht in den Rumpf", async () => {
    const { fetch, calls } = stubFetch([() => audio([5])]);
    const provider = elevenlabsMusicProvider({}, { fetch, env: { ELEVENLABS_API_KEY: KEY } });

    await provider.generate({ prompt: "lofi", seconds: 30, seed: 7 });

    expect(bodyOf(calls[0])).toEqual({
      prompt: "lofi",
      music_length_ms: 30_000,
      model_id: "music_v2",
    });
  });
});

describe("elevenlabsMusicProvider: fehlender Schluessel", () => {
  it("wirft mit dem Namen der Umgebungsvariable und fragt den Dienst nicht", async () => {
    const { fetch, calls } = stubFetch([]);
    const provider = elevenlabsMusicProvider({}, { fetch, env: {} });

    const error = await errorOf(provider.generate({ prompt: "lofi", seconds: 30 }));

    expect(error.message).toMatch(/ELEVENLABS_API_KEY/);
    expect(error.message).toMatch(/fehlt/);
    expect(calls).toEqual([]);
  });

  it("nennt den Namen der gesetzten Quelle statt immer ELEVENLABS_API_KEY", async () => {
    const { fetch } = stubFetch([]);
    const provider = elevenlabsMusicProvider(
      { secret: { env: "MEIN_ELEVEN_KEY" } },
      { fetch, env: {} },
    );

    const error = await errorOf(provider.generate({ prompt: "lofi", seconds: 30 }));

    expect(error.message).toMatch(/MEIN_ELEVEN_KEY/);
    expect(error.message).not.toMatch(/ELEVENLABS_API_KEY/);
  });
});

describe("elevenlabsMusicProvider: HTTP-Fehler", () => {
  it("wirft mit Status, gekuerzter Antwort und ohne den Schluessel", async () => {
    const long = `bad key ${KEY} ` + "x".repeat(500) + " abschneiden";
    const { fetch } = stubFetch([() => new Response(long, { status: 401 })]);
    const provider = elevenlabsMusicProvider({}, { fetch, env: { ELEVENLABS_API_KEY: KEY } });

    const error = await errorOf(provider.generate({ prompt: "lofi", seconds: 30 }));

    expect(error.message).toMatch(/HTTP 401/);
    expect(error.message).toContain("bad key");
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain("abschneiden");
  });
});

describe("toElevenLabsMusicOptions", () => {
  it("liest das Modell und fuellt die Vorgabe-Quelle", () => {
    expect(toElevenLabsMusicOptions({ model: "music_v2" })).toEqual({
      model: "music_v2",
      secret: { env: "ELEVENLABS_API_KEY" },
    });
  });

  it("gilt ohne Angaben als nur die Vorgabe-Quelle", () => {
    expect(toElevenLabsMusicOptions()).toEqual({ secret: { env: "ELEVENLABS_API_KEY" } });
  });

  it("laesst falsche Typen als nicht gesetzt gelten und trimmt uebernommene Werte", () => {
    expect(
      toElevenLabsMusicOptions({
        model: 7,
        secret: { env: " MEIN_ELEVEN_KEY ", file: " key.txt " },
      }),
    ).toEqual({ secret: { env: "MEIN_ELEVEN_KEY", file: "key.txt" } });
  });
});

describe("resolveMusicProvider: die Wahl", () => {
  it("waehlt elevenlabs anhand von capabilities.music.provider und reicht Optionen und Umgebung durch", async () => {
    const bytes = [9];
    const { fetch, calls } = stubFetch([() => audio(bytes)]);
    const provider = resolveMusicProvider(
      music({ provider: "elevenlabs", options: { model: "music_v2" } }),
      { fetch, env: { ELEVENLABS_API_KEY: KEY } },
    );

    expect(provider.id).toBe("elevenlabs");
    await expect(provider.detect()).resolves.toBe(true);
    expect(await provider.generate({ prompt: "lofi", seconds: 45 })).toEqual(Buffer.from(bytes));
    expect(bodyOf(calls[0])).toEqual({
      prompt: "lofi",
      music_length_ms: 45_000,
      model_id: "music_v2",
    });
  });

  it("nennt bei unbekanntem Namen acestep und elevenlabs", () => {
    const unknown = music({ provider: "mubert" });

    expect(() => resolveMusicProvider(unknown)).toThrow(/"mubert"/);
    expect(() => resolveMusicProvider(unknown)).toThrow(/acestep/);
    expect(() => resolveMusicProvider(unknown)).toThrow(/elevenlabs/);
  });
});
