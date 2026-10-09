import { beforeEach, describe, expect, it } from "vitest";
import {
  POLL_MS,
  parseVoiceboxResponse,
  resetVoiceboxProfileCache,
  toVoiceboxOptions,
  voiceboxProvider,
} from "../src/lib/providers/voicebox.js";
import { resolveVoiceProvider } from "../src/lib/providers/voice.js";
import type { FetchLike, SleepFn, VoiceboxOptions } from "../src/lib/providers/voice.js";
import type { CapabilityChoice, Project } from "../src/lib/types.js";

const BASE = "http://127.0.0.1:17493";
const PROFILE = "Niander";

beforeEach(() => {
  resetVoiceboxProfileCache();
});

/** Eine aufgezeichnete Anfrage: Methode, Adresse und roher Rumpf. */
interface Call {
  method: string;
  url: string;
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
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    const answer = answers[index];
    index += 1;
    if (answer === undefined) {
      throw new Error(`unerwarteter Aufruf: ${url}`);
    }
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

/** Eine Profilantwort mit genau dem gesuchten Profil. */
function profiles(id: string): Response {
  return json({ value: [{ id, name: PROFILE }] });
}

/** Der echte Timer wird nie benutzt; die Wartezeiten werden gezaehlt. */
function slept(): { sleep: SleepFn; waits: number[] } {
  const waits: number[] = [];
  return {
    sleep: async (ms) => {
      waits.push(ms);
    },
    waits,
  };
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

const options: VoiceboxOptions = {
  base_url: BASE,
  profile_name: PROFILE,
  engine: "qwen",
  model_size: "1.7B",
  language: "en",
};

describe("voiceboxProvider: erkennen", () => {
  it("fragt /health und ist bei HTTP 200 wahr", async () => {
    const { fetch, calls } = stubFetch([() => new Response("ok", { status: 200 })]);
    expect(await voiceboxProvider(options, { fetch }).detect()).toBe(true);
    expect(calls).toEqual([{ method: "GET", url: `${BASE}/health` }]);
  });

  it("ist falsch, wenn der Dienst nicht antwortet, statt zu werfen", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("kein Dienst");
    };
    expect(await voiceboxProvider(options, { fetch }).detect()).toBe(false);
  });

  it("ist falsch bei HTTP 503", async () => {
    const { fetch } = stubFetch([() => new Response("", { status: 503 })]);
    expect(await voiceboxProvider(options, { fetch }).detect()).toBe(false);
  });

  it("baut die Adresse ohne abschliessende Schraegstriche", async () => {
    const { fetch, calls } = stubFetch([() => new Response("ok", { status: 200 })]);
    const cfg = { ...options, base_url: `${BASE}/` };
    await voiceboxProvider(cfg, { fetch }).detect();
    expect(calls).toEqual([{ method: "GET", url: `${BASE}/health` }]);
  });

  it("erkennt ohne profile_name, weil detect() nur base_url braucht", async () => {
    const { fetch, calls } = stubFetch([() => new Response("ok", { status: 200 })]);
    expect(await voiceboxProvider({ base_url: BASE }, { fetch }).detect()).toBe(true);
    expect(calls).toEqual([{ method: "GET", url: `${BASE}/health` }]);
  });
});

describe("voiceboxProvider: einen Take erzeugen", () => {
  it("loest das Profil auf, spricht, wartet und holt die Datei", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p1"),
      () => json({ id: "g1", status: "running" }),
      () => json({ id: "g1", status: "running" }),
      () => json({ id: "g1", status: "completed" }),
      () => new Response(new Uint8Array([7, 8]), { status: 200 }),
    ]);
    const { sleep, waits } = slept();

    const take = await voiceboxProvider(options, { fetch, sleep }).speak("Hallo", {});

    expect(take.audio).toEqual(Buffer.from([7, 8]));
    expect(take.alignment).toBeNull();
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", `${BASE}/profiles`],
      ["POST", `${BASE}/generate`],
      ["GET", `${BASE}/generate/g1/status`],
      ["GET", `${BASE}/generate/g1/status`],
      ["GET", `${BASE}/audio/g1`],
    ]);
    expect(bodyOf(calls[1])).toEqual({
      profile_id: "p1",
      text: "Hallo",
      language: "en",
      engine: "qwen",
      model_size: "1.7B",
    });
    expect(waits).toEqual([POLL_MS, POLL_MS]);
  });

  it("bricht ab, wenn die Frist ohne Fertigstellung verstreicht", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p1"),
      () => json({ id: "g1", status: "running" }),
      ...Array.from({ length: 4 }, () => () => json({ id: "g1", status: "running" })),
    ]);
    // Der echte Timer wird nie benutzt: der Schlaf schiebt nur die Uhr vor.
    let clock = 0;
    const waits: number[] = [];
    const sleep: SleepFn = async (ms) => {
      waits.push(ms);
      clock += ms;
    };

    const provider = voiceboxProvider(options, {
      fetch, sleep, now: () => clock, maxWaitMs: 3 * POLL_MS,
    });

    const error = await errorOf(provider.speak("Hallo", {}));

    expect(error.message).toMatch(/g1/);
    expect(error.message).toMatch(/Frist/);
    expect(error.message).toContain(`${3 * POLL_MS} ms`);
    expect(waits).toEqual([POLL_MS, POLL_MS, POLL_MS]);
    expect(calls.filter((call) => call.url.endsWith("/status"))).toHaveLength(3);
  });

  it("fragt nicht, wenn der Lauf schon fertig gemeldet ist", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p2"),
      () => json({ id: "g2", status: "completed" }),
      () => new Response(new Uint8Array([1]), { status: 200 }),
    ]);
    const { sleep, waits } = slept();

    const take = await voiceboxProvider(options, { fetch, sleep }).speak("Hi", {});

    expect(take.audio).toEqual(Buffer.from([1]));
    expect(take.alignment).toBeNull();
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([]);
  });

  it("nimmt auch die Listenform der Profile und opts.language schlaegt die Konfiguration", async () => {
    const { fetch, calls } = stubFetch([
      () => json([{ id: "p3", name: PROFILE }]),
      () => json({ id: "g3", status: "completed" }),
      () => new Response(new Uint8Array([2]), { status: 200 }),
    ]);
    const cfg: VoiceboxOptions = { base_url: BASE, profile_name: PROFILE, language: "en" };

    const take = await voiceboxProvider(cfg, { fetch }).speak("Hi", { language: "de" });

    expect(take.alignment).toBeNull();
    expect(bodyOf(calls[1])).toEqual({ profile_id: "p3", text: "Hi", language: "de" });
  });

  it("gilt als fertig, wenn der POST keinen Status nennt", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p4"),
      () => json({ id: "g4" }),
      () => new Response(new Uint8Array([4]), { status: 200 }),
    ]);
    const { sleep, waits } = slept();

    const take = await voiceboxProvider(options, { fetch, sleep }).speak("Hi", {});

    expect(take.audio).toEqual(Buffer.from([4]));
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([]);
  });

  it("loest das Profil nur einmal je Lauf auf und nach dem Reset erneut", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p1"),
      () => json({ id: "g1", status: "completed" }),
      () => new Response(new Uint8Array([1]), { status: 200 }),
      () => json({ id: "g2", status: "completed" }),
      () => new Response(new Uint8Array([2]), { status: 200 }),
      () => profiles("p9"),
      () => json({ id: "g3", status: "completed" }),
      () => new Response(new Uint8Array([3]), { status: 200 }),
    ]);
    const provider = voiceboxProvider(options, { fetch, sleep: async () => {} });

    await provider.speak("eins", {});
    await provider.speak("zwei", {});
    const beforeReset = calls.filter((call) => call.url === `${BASE}/profiles`).length;
    resetVoiceboxProfileCache();
    await provider.speak("drei", {});
    const afterReset = calls.filter((call) => call.url === `${BASE}/profiles`).length;

    expect(beforeReset).toBe(1);
    expect(afterReset).toBe(2);
  });
});

describe("parseVoiceboxResponse", () => {
  it("liest reines JSON", () => {
    expect(parseVoiceboxResponse('{"id":"g1"}')).toEqual({ id: "g1" });
  });

  it("liest einen Strom aus data-Zeilen und nimmt das letzte Ereignis", () => {
    const sse =
      'event: message\ndata: {"status":"running"}\n\ndata: {"id":"g1","status":"completed"}\n\n';
    expect(parseVoiceboxResponse(sse)).toEqual({ id: "g1", status: "completed" });
  });
});

describe("voiceboxProvider: Fehler", () => {
  it("wirft mit dem Profilnamen, wenn das Profil fehlt", async () => {
    const { fetch, calls } = stubFetch([() => json({ value: [] })]);

    const error = await errorOf(voiceboxProvider(options, { fetch }).speak("Hallo", {}));

    expect(error.message).toMatch(/Niander/);
    expect(error.message).toMatch(/fehlt/);
    expect(error.message).toContain(BASE);
    expect(calls).toHaveLength(1);
  });

  it("wirft, wenn die Generierung scheitert, und nennt den Grund", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p1"),
      () => json({ id: "g1", status: "running" }),
      () => json({ id: "g1", status: "failed", error: "Modell abgestuerzt" }),
    ]);

    const error = await errorOf(
      voiceboxProvider(options, { fetch, sleep: async () => {} }).speak("Hallo", {}),
    );

    expect(error.message).toMatch(/fehlgeschlagen/);
    expect(error.message).toMatch(/Modell abgestuerzt/);
    expect(calls).toHaveLength(3);
  });

  it("wirft mit Adresse bei kaputtem JSON", async () => {
    const { fetch } = stubFetch([() => new Response("kein JSON", { status: 200 })]);

    const error = await errorOf(voiceboxProvider(options, { fetch }).speak("Hallo", {}));

    expect(error.message).toMatch(/keine gueltige JSON-Antwort/);
    expect(error.message).toContain(`${BASE}/profiles`);
  });

  it("wirft mit Adresse und HTTP-Status bei einem Serverfehler", async () => {
    const { fetch } = stubFetch([() => new Response("nope", { status: 500 })]);

    const error = await errorOf(voiceboxProvider(options, { fetch }).speak("Hallo", {}));

    expect(error.message).toContain(`${BASE}/profiles`);
    expect(error.message).toMatch(/HTTP 500/);
  });

  it("wirft mit klarer Meldung, wenn der Profilname fehlt, und fragt den Dienst nicht", async () => {
    const { fetch, calls } = stubFetch([]);

    const error = await errorOf(voiceboxProvider({ base_url: BASE }, { fetch }).speak("Hallo", {}));

    expect(error.message).toMatch(/Voicebox/);
    expect(error.message).toMatch(/profile_name/);
    expect(calls).toEqual([]);
  });

  it("wirft, wenn keine Generierungs-Kennung kommt", async () => {
    const { fetch } = stubFetch([
      () => profiles("p1"),
      () => json({ status: "running" }),
    ]);

    await expect(voiceboxProvider(options, { fetch }).speak("Hallo", {})).rejects.toThrow(
      /Kennung/,
    );
  });

  it("wirft bei HTTP-Fehler beim Holen der Audiodatei", async () => {
    const { fetch } = stubFetch([
      () => profiles("p1"),
      () => json({ id: "g1", status: "completed" }),
      () => new Response("nope", { status: 500 }),
    ]);

    const error = await errorOf(voiceboxProvider(options, { fetch }).speak("Hallo", {}));

    expect(error.message).toContain(`${BASE}/audio/g1`);
    expect(error.message).toMatch(/HTTP 500/);
  });
});

describe("toVoiceboxOptions", () => {
  it("liest die bekannten Optionen und wirft nicht bei gueltigen Angaben", () => {
    expect(toVoiceboxOptions({ ...options })).toEqual(options);
  });

  it("wirft ohne base_url", () => {
    expect(() => toVoiceboxOptions({ profile_name: PROFILE })).toThrow(/base_url/);
  });

  it("laesst profile_name weg, damit detect() ohne Projekt laeuft", () => {
    expect(toVoiceboxOptions({ base_url: BASE })).toEqual({ base_url: BASE });
  });

  it("laesst falsche Typen als nicht gesetzt gelten", () => {
    expect(toVoiceboxOptions({ base_url: BASE, profile_name: PROFILE, engine: 7 })).toEqual({
      base_url: BASE,
      profile_name: PROFILE,
    });
  });

  it("trimmt uebernommene Werte", () => {
    expect(toVoiceboxOptions({
      base_url: `  ${BASE}  `,
      profile_name: ` ${PROFILE} `,
      engine: " qwen ",
      model_size: " 1.7B ",
      language: " en ",
    })).toEqual(options);
  });
});

describe("resolveVoiceProvider: die Wahl", () => {
  it("waehlt voicebox anhand von capabilities.voice.provider", async () => {
    const { fetch, calls } = stubFetch([() => new Response("ok", { status: 200 })]);

    const provider = resolveVoiceProvider(
      voice({ provider: "voicebox", options: { base_url: BASE, profile_name: PROFILE } }),
      { fetch },
    );

    expect(provider.id).toBe("voicebox");
    expect(await provider.detect()).toBe(true);
    expect(calls).toEqual([{ method: "GET", url: `${BASE}/health` }]);
  });

  it("reicht deps durch und liefert den fertigen Take", async () => {
    const { fetch, calls } = stubFetch([
      () => profiles("p1"),
      () => json({ id: "g1", status: "running" }),
      () => json({ id: "g1", status: "completed" }),
      () => new Response(new Uint8Array([5, 6]), { status: 200 }),
    ]);
    const { sleep, waits } = slept();

    const provider = resolveVoiceProvider(
      voice({ provider: "voicebox", options: { base_url: BASE, profile_name: PROFILE } }),
      { fetch, sleep },
    );
    const take = await provider.speak("Hallo", {});

    expect(take.audio).toEqual(Buffer.from([5, 6]));
    expect(take.alignment).toBeNull();
    expect(waits).toEqual([POLL_MS]);
    expect(calls.some((call) => call.url === `${BASE}/generate`)).toBe(true);
  });

  it("wirft, wenn capabilities.voice fehlt", () => {
    expect(() => resolveVoiceProvider(project())).toThrow(/capabilities\.voice/);
    expect(() => resolveVoiceProvider(project())).toThrow(/voicebox/);
  });

  it("wirft, wenn kein Anbieter gewaehlt ist", () => {
    expect(() => resolveVoiceProvider(voice({ provider: "" }))).toThrow(/gewaehlt/);
  });

  it("wirft bei unbekanntem Namen und nennt Name und bekannte Anbieter", () => {
    const unknown = voice({ provider: "elevenlabs" });
    expect(() => resolveVoiceProvider(unknown)).toThrow(/"elevenlabs"/);
    expect(() => resolveVoiceProvider(unknown)).toThrow(/voicebox/);
  });
});
