import { describe, expect, it } from "vitest";
import { POLL_MS } from "../src/lib/providers/acestep.js";
import { resolveMusicProvider } from "../src/lib/providers/music.js";
import type { FetchLike, SleepFn } from "../src/lib/providers/music.js";
import type { CapabilityChoice, Project } from "../src/lib/types.js";

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

/** Eine Huelle, wie ACE-Step sie liefert. */
function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ data, code: 200, error: null, timestamp: 1, extra: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveMusicProvider: die Wahl", () => {
  it("waehlt acestep anhand von capabilities.music.provider", async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      return envelope({ status: "ok" });
    };

    const provider = resolveMusicProvider(
      music({ provider: "acestep", options: { base_url: "http://127.0.0.1:9999" } }),
      { fetch },
    );

    expect(provider.id).toBe("acestep");
    expect(await provider.detect()).toBe(true);
    expect(urls).toEqual(["http://127.0.0.1:9999/health"]);
  });

  it("nutzt ohne Optionen die Vorgabe http://127.0.0.1:8001", async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      return envelope({ status: "ok" });
    };

    await resolveMusicProvider(music({ provider: "acestep" }), { fetch }).detect();

    expect(urls).toEqual(["http://127.0.0.1:8001/health"]);
  });

  it("reicht deps durch und liefert den fertigen Take", async () => {
    const answers: Array<() => Response> = [
      () => envelope({ task_id: "t1" }),
      () => envelope([{ task_id: "t1", status: 0 }]),
      () => envelope([
        { task_id: "t1", status: 1, result: JSON.stringify([{ file: "/v1/audio?path=x" }]) },
      ]),
      () => new Response(new Uint8Array([5, 6]), { status: 200 }),
    ];
    let index = 0;
    const fetch: FetchLike = async (url) => {
      const answer = answers[index];
      index += 1;
      if (answer === undefined) {
        throw new Error(`unerwarteter Aufruf: ${url}`);
      }
      return answer();
    };
    const waits: number[] = [];
    const sleep: SleepFn = async (ms) => {
      waits.push(ms);
    };

    const provider = resolveMusicProvider(music({ provider: "acestep" }), { fetch, sleep });
    const audio = await provider.generate({ prompt: "dnb", seconds: 60 });

    expect(audio).toEqual(Buffer.from([5, 6]));
    expect(waits).toEqual([POLL_MS]);
  });
});

describe("resolveMusicProvider: Fehler", () => {
  it("wirft, wenn capabilities.music fehlt", () => {
    expect(() => resolveMusicProvider(project())).toThrow(/capabilities\.music/);
    expect(() => resolveMusicProvider(project())).toThrow(/acestep/);
  });

  it("wirft, wenn kein Anbieter gewaehlt ist", () => {
    expect(() => resolveMusicProvider(music({ provider: "" }))).toThrow(/gewaehlt/);
  });

  it("wirft bei unbekanntem Namen und nennt Name und bekannte Anbieter", () => {
    const unbekannt = music({ provider: "suno" });
    expect(() => resolveMusicProvider(unbekannt)).toThrow(/"suno"/);
    expect(() => resolveMusicProvider(unbekannt)).toThrow(/acestep/);
  });
});
