import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  elevenlabsVoiceProvider,
  toElevenLabsVoiceOptions,
} from "../src/lib/providers/elevenlabs.js";
import { resolveVoiceProvider } from "../src/lib/providers/voice.js";
import type { FetchLike } from "../src/lib/providers/voice.js";
import type { CapabilityChoice, Project } from "../src/lib/types.js";

const KEY = "sk-eleven-darf-nie-auftauchen";
const VOICE_ID = "bAFkvitDGeDMmqo9gJzO";
const URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;

/** Echte Zeichenzeiten mit vielen Nachkommastellen: nichts darf gerundet werden. */
const ALIGNMENT = {
  characters: ["H", "a", "l", "l", "o"],
  character_start_times_seconds: [0, 0.083333333333, 0.166666666666, 0.25, 0.333333333333],
  character_end_times_seconds: [0.083333333333, 0.166666666666, 0.25, 0.333333333333, 0.42],
};

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

function json(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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

/** Ein Projekt mit genau der Sprachwahl. */
function voice(choice: CapabilityChoice): Project {
  return project({ capabilities: { voice: choice } });
}

describe("elevenlabsVoiceProvider: erkennen", () => {
  it("ist wahr, wenn der Schluessel in der Vorgabe-Umgebungsvariable steht", async () => {
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID },
      { env: { ELEVENLABS_API_KEY: KEY } },
    );

    await expect(provider.detect()).resolves.toBe(true);
  });

  it("ist falsch ohne Schluessel und wirft nie, auch wenn der Dienst nicht erreichbar waere", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("darf nicht aufgerufen werden");
    };
    const provider = elevenlabsVoiceProvider({ voice_id: VOICE_ID }, { fetch, env: {} });

    await expect(provider.detect()).resolves.toBe(false);
  });

  it("nimmt den Namen der Umgebungsvariable aus der gesetzten Quelle", async () => {
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID, secret: { env: "MEIN_ELEVEN_KEY" } },
      { env: { MEIN_ELEVEN_KEY: KEY } },
    );

    await expect(provider.detect()).resolves.toBe(true);
  });

  it("liest den Schluessel auch aus einer Datei der Quelle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vw-eleven-voice-"));
    const file = join(dir, "key");
    await writeFile(file, `${KEY}\n`, "utf8");
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID, secret: { env: "ELEVENLABS_API_KEY", file } },
      { env: {} },
    );

    await expect(provider.detect()).resolves.toBe(true);
  });
});

describe("elevenlabsVoiceProvider: einen Take erzeugen", () => {
  const cfg = {
    voice_id: VOICE_ID,
    model: "eleven_multilingual_v2",
    stability: 0.5,
    similarity_boost: 0.75,
    speed: 1.1,
  };

  it("ruft den mit-timestamps-Endpunkt mit xi-api-key und liefert Audio und echte Zeichenzeiten", async () => {
    const audio = Buffer.from([1, 2, 3]);
    const { fetch, calls } = stubFetch([
      () => json({ audio_base64: audio.toString("base64"), alignment: ALIGNMENT }),
    ]);
    const provider = elevenlabsVoiceProvider(cfg, {
      fetch,
      env: { ELEVENLABS_API_KEY: KEY },
    });

    const take = await provider.speak("Hallo Welt", {});

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.headers["xi-api-key"]).toBe(KEY);
    expect(bodyOf(calls[0])).toEqual({
      text: "Hallo Welt",
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.1 },
    });
    expect(take.audio).toEqual(audio);
    // Die Zeiten kommen unveraendert durch: der Vergleich verlangt genau diese Werte.
    expect(take.alignment).toEqual(ALIGNMENT);
  });

  it("laesst nicht gesetzte Felder aus dem Rumpf weg", async () => {
    const { fetch, calls } = stubFetch([
      () => json({ audio_base64: Buffer.from([4]).toString("base64"), alignment: ALIGNMENT }),
    ]);
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID, speed: 1.2 },
      { fetch, env: { ELEVENLABS_API_KEY: KEY } },
    );

    await provider.speak("Nur Text", {});

    expect(bodyOf(calls[0])).toEqual({
      text: "Nur Text",
      voice_settings: { speed: 1.2 },
    });
  });

  it("ergibt null fuer alignment, wenn die Antwort keine Zeiten enthaelt", async () => {
    const audio = Buffer.from([5, 6]);
    const { fetch } = stubFetch([() => json({ audio_base64: audio.toString("base64") })]);
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID },
      { fetch, env: { ELEVENLABS_API_KEY: KEY } },
    );

    const take = await provider.speak("Hallo", {});

    expect(take.audio).toEqual(audio);
    expect(take.alignment).toBeNull();
  });

  it("wirft bei HTTP-Fehler mit Status, ohne den Schluessel in der Meldung", async () => {
    const { fetch } = stubFetch([() => new Response(`bad key ${KEY}`, { status: 401 })]);
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID },
      { fetch, env: { ELEVENLABS_API_KEY: KEY } },
    );

    const error = await errorOf(provider.speak("Hallo", {}));

    expect(error.message).toMatch(/HTTP 401/);
    expect(error.message).not.toContain(KEY);
  });

  it("wirft ohne Audio in der Antwort", async () => {
    const { fetch } = stubFetch([() => json({ alignment: ALIGNMENT })]);
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID },
      { fetch, env: { ELEVENLABS_API_KEY: KEY } },
    );

    await expect(provider.speak("Hallo", {})).rejects.toThrow(/Audio/);
  });
});

describe("elevenlabsVoiceProvider: fehlender Schluessel", () => {
  it("wirft mit dem Namen der Umgebungsvariable und fragt den Dienst nicht", async () => {
    const { fetch, calls } = stubFetch([]);
    const provider = elevenlabsVoiceProvider({ voice_id: VOICE_ID }, { fetch, env: {} });

    const error = await errorOf(provider.speak("Hallo", {}));

    expect(error.message).toMatch(/ELEVENLABS_API_KEY/);
    expect(error.message).toMatch(/fehlt/);
    expect(calls).toEqual([]);
  });

  it("nennt den Namen der gesetzten Quelle statt immer ELEVENLABS_API_KEY", async () => {
    const { fetch } = stubFetch([]);
    const provider = elevenlabsVoiceProvider(
      { voice_id: VOICE_ID, secret: { env: "MEIN_ELEVEN_KEY" } },
      { fetch, env: {} },
    );

    const error = await errorOf(provider.speak("Hallo", {}));

    expect(error.message).toMatch(/MEIN_ELEVEN_KEY/);
    expect(error.message).not.toMatch(/ELEVENLABS_API_KEY/);
  });
});

describe("toElevenLabsVoiceOptions", () => {
  it("liest die bekannten Optionen und fuellt die Vorgabe-Quelle", () => {
    expect(
      toElevenLabsVoiceOptions({
        voice_id: VOICE_ID,
        model: "eleven_multilingual_v2",
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.1,
      }),
    ).toEqual({
      voice_id: VOICE_ID,
      model: "eleven_multilingual_v2",
      stability: 0.5,
      similarity_boost: 0.75,
      speed: 1.1,
      secret: { env: "ELEVENLABS_API_KEY" },
    });
  });

  it("wirft ohne voice_id", () => {
    expect(() => toElevenLabsVoiceOptions({})).toThrow(/voice_id/);
  });

  it("laesst falsche Typen als nicht gesetzt gelten und trimmt uebernommene Werte", () => {
    expect(
      toElevenLabsVoiceOptions({
        voice_id: `  ${VOICE_ID}  `,
        model: 7,
        stability: "viel",
        similarity_boost: Number.NaN,
        speed: null,
      }),
    ).toEqual({ voice_id: VOICE_ID, secret: { env: "ELEVENLABS_API_KEY" } });
  });

  it("uebernimmt eine gesetzte Quelle und trimmt deren Werte", () => {
    expect(
      toElevenLabsVoiceOptions({
        voice_id: VOICE_ID,
        secret: { env: " MEIN_ELEVEN_KEY ", file: " key.txt " },
      }),
    ).toEqual({
      voice_id: VOICE_ID,
      secret: { env: "MEIN_ELEVEN_KEY", file: "key.txt" },
    });
  });
});

describe("resolveVoiceProvider: die Wahl", () => {
  it("waehlt elevenlabs anhand von capabilities.voice.provider", async () => {
    const provider = resolveVoiceProvider(
      voice({ provider: "elevenlabs", options: { voice_id: VOICE_ID } }),
      { env: { ELEVENLABS_API_KEY: KEY } },
    );

    expect(provider.id).toBe("elevenlabs");
    await expect(provider.detect()).resolves.toBe(true);
  });

  it("nennt bei unbekanntem Namen voicebox und elevenlabs", () => {
    const unknown = voice({ provider: "chatterbox" });

    expect(() => resolveVoiceProvider(unknown)).toThrow(/"chatterbox"/);
    expect(() => resolveVoiceProvider(unknown)).toThrow(/voicebox/);
    expect(() => resolveVoiceProvider(unknown)).toThrow(/elevenlabs/);
  });
});
