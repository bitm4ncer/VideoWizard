import { describe, expect, it } from "vitest";
import { POLL_MS, acestepProvider } from "../src/lib/providers/acestep.js";
import type { FetchLike, SleepFn } from "../src/lib/providers/music.js";

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

/** Die Antworthuelle von ACE-Step, immer HTTP 200. */
function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ data, code: 200, error: null, timestamp: 1, extra: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Eine Fehlerhuelle: gesetztes error, trotzdem HTTP 200. */
function envelopeError(error: string): Response {
  return new Response(JSON.stringify({ data: null, code: 500, error, timestamp: 1, extra: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Ein `result`, wie ACE-Step es als JSON-Zeichenkette liefert. */
function result(file: string): string {
  return JSON.stringify([{ file, status: 1 }]);
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

describe("acestepProvider: erkennen", () => {
  it("detect ist wahr, wenn /health mit HTTP 200 antwortet", async () => {
    const { fetch, calls } = stubFetch([() => envelope({ status: "ok" })]);
    expect(await acestepProvider({}, { fetch }).detect()).toBe(true);
    expect(calls).toEqual([{ method: "GET", url: "http://127.0.0.1:8001/health" }]);
  });

  it("detect ist falsch, wenn der Dienst nicht antwortet, statt zu werfen", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("kein Dienst");
    };
    expect(await acestepProvider({}, { fetch }).detect()).toBe(false);
  });

  it("detect ist falsch bei HTTP 503", async () => {
    const { fetch } = stubFetch([() => new Response("", { status: 503 })]);
    expect(await acestepProvider({}, { fetch }).detect()).toBe(false);
  });
});

describe("acestepProvider: einen Take erzeugen", () => {
  it("legt an, fragt bis Status 1 und holt die Datei", async () => {
    const { fetch, calls } = stubFetch([
      () => envelope({ task_id: "t1", status: "queued" }),
      () => envelope([{ task_id: "t1", status: 0 }]),
      () => envelope([{ task_id: "t1", status: 0 }]),
      () => envelope([{ task_id: "t1", status: 1, result: result("/v1/audio?path=x") }]),
      () => new Response(new Uint8Array([7, 8]), { status: 200 }),
    ]);
    const { sleep, waits } = slept();

    const provider = acestepProvider({}, { fetch, sleep });
    const audio = await provider.generate({ prompt: "dnb", seconds: 200 });

    expect(provider.id).toBe("acestep");
    expect(audio).toEqual(Buffer.from([7, 8]));
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "http://127.0.0.1:8001/release_task"],
      ["POST", "http://127.0.0.1:8001/query_result"],
      ["POST", "http://127.0.0.1:8001/query_result"],
      ["POST", "http://127.0.0.1:8001/query_result"],
      ["GET", "http://127.0.0.1:8001/v1/audio?path=x"],
    ]);
    expect(bodyOf(calls[0])).toEqual({
      prompt: "dnb",
      lyrics: "",
      audio_format: "wav",
      audio_duration: 200,
      thinking: true,
    });
    expect(bodyOf(calls[1])).toEqual({ task_id_list: ["t1"] });
    expect(waits).toEqual([POLL_MS, POLL_MS]);
  });

  it("bricht ab, wenn die Frist ohne Fertigstellung verstreicht", async () => {
    const { fetch, calls } = stubFetch([
      () => envelope({ task_id: "t8" }),
      ...Array.from({ length: 4 }, () => () => envelope([{ task_id: "t8", status: 0 }])),
    ]);
    // Der echte Timer wird nie benutzt: der Schlaf schiebt nur die Uhr vor.
    let clock = 0;
    const waits: number[] = [];
    const sleep: SleepFn = async (ms) => {
      waits.push(ms);
      clock += ms;
    };

    const provider = acestepProvider({}, { fetch, sleep, now: () => clock, maxWaitMs: 3 * POLL_MS });

    await expect(provider.generate({ prompt: "x", seconds: 10 })).rejects.toThrow(
      `${3 * POLL_MS} ms`,
    );
    expect(waits).toEqual([POLL_MS, POLL_MS, POLL_MS]);
    expect(calls.filter((call) => call.url.endsWith("/query_result"))).toHaveLength(4);
  });

  it("sendet model, seed und use_random_seed nur nach Angabe", async () => {
    const { fetch, calls } = stubFetch([
      () => envelope({ task_id: "t2" }),
      () => envelope([{ task_id: "t2", status: 1, result: result("/v1/audio?path=y") }]),
      () => new Response(new Uint8Array([1]), { status: 200 }),
    ]);
    const provider = acestepProvider(
      { base_url: "http://127.0.0.1:9999/", model: "acestep-v15-turbo", thinking: false },
      { fetch, sleep: async () => {} },
    );

    await provider.generate({ prompt: "lofi", seconds: 30, seed: 7 });

    expect(bodyOf(calls[0])).toEqual({
      prompt: "lofi",
      lyrics: "",
      audio_format: "wav",
      audio_duration: 30,
      thinking: false,
      model: "acestep-v15-turbo",
      seed: 7,
      use_random_seed: false,
    });
    expect(calls[0]?.url).toBe("http://127.0.0.1:9999/release_task");
    expect(calls[2]?.url).toBe("http://127.0.0.1:9999/v1/audio?path=y");
  });

  it("nutzt eine absolute Dateiadresse unveraendert", async () => {
    const absolut = "http://127.0.0.1:9999/v1/audio?path=z";
    const { fetch, calls } = stubFetch([
      () => envelope({ task_id: "t6" }),
      () => envelope([{ task_id: "t6", status: 1, result: result(absolut) }]),
      () => new Response(new Uint8Array([3]), { status: 200 }),
    ]);

    await acestepProvider({}, { fetch }).generate({ prompt: "x", seconds: 10 });

    expect(calls[2]?.url).toBe(absolut);
  });
});

describe("acestepProvider: Fehler", () => {
  it("wirft bei gesetztem error auch bei HTTP 200", async () => {
    const { fetch } = stubFetch([() => envelopeError("Denken fehlgeschlagen")]);
    await expect(
      acestepProvider({}, { fetch }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow("Denken fehlgeschlagen");
  });

  it("wirft mit klarer Meldung, wenn die Aufgabe scheitert", async () => {
    const { fetch } = stubFetch([
      () => envelope({ task_id: "t3" }),
      () => envelope([{ task_id: "t3", status: 2 }]),
    ]);
    await expect(
      acestepProvider({}, { fetch, sleep: async () => {} }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow(/ACE-Step-Generierung fehlgeschlagen/);
  });

  it("wirft, wenn der fertige Lauf keine Datei nennt", async () => {
    const { fetch } = stubFetch([
      () => envelope({ task_id: "t4" }),
      () => envelope([{ task_id: "t4", status: 1 }]),
    ]);
    await expect(
      acestepProvider({}, { fetch, sleep: async () => {} }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow(/keine Datei/);
  });

  it("wirft, wenn /query_result die Aufgabe nicht kennt", async () => {
    const { fetch } = stubFetch([
      () => envelope({ task_id: "t7" }),
      () => envelope([]),
    ]);
    await expect(
      acestepProvider({}, { fetch, sleep: async () => {} }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow(/t7/);
  });

  it("wirft, wenn keine task_id kommt", async () => {
    const { fetch } = stubFetch([() => envelope({ status: "queued" })]);
    await expect(
      acestepProvider({}, { fetch }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow(/task_id/);
  });

  it("wirft mit Adresse bei kaputtem JSON", async () => {
    const { fetch } = stubFetch([() => new Response("kein JSON", { status: 200 })]);
    await expect(
      acestepProvider({}, { fetch }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow(/keine gueltige JSON-Antwort/);
  });

  it("wirft bei HTTP-Fehler beim Holen der Datei", async () => {
    const { fetch } = stubFetch([
      () => envelope({ task_id: "t5" }),
      () => envelope([{ task_id: "t5", status: 1, result: result("/v1/audio?path=z") }]),
      () => new Response("nope", { status: 500 }),
    ]);
    await expect(
      acestepProvider({}, { fetch }).generate({ prompt: "x", seconds: 10 }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
