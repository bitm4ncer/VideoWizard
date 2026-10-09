import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { capabilities, detect, renderReport } from "../src/lib/capabilities.js";
import { acestepProvider } from "../src/lib/providers/acestep.js";
import type {
  Capability,
  CapabilityState,
  Run,
  ServiceFactories,
} from "../src/lib/capabilities.js";
import type { FetchLike } from "../src/lib/providers/music.js";

/** Ein run, der jeden Erkennungsbefehl verneint. */
const failing: Run = async () => {
  throw new Error("nicht gefunden");
};

describe("capabilities: die Registry", () => {
  it("fuehrt render (ffmpeg), music (acestep), voice (voicebox) und transcript (whisper)", () => {
    const list = capabilities();
    const render = list.find((capability) => capability.id === "render");
    const music = list.find((capability) => capability.id === "music");
    const voice = list.find((capability) => capability.id === "voice");
    const transcript = list.find((capability) => capability.id === "transcript");
    expect(render?.providers.map((provider) => provider.id)).toEqual(["ffmpeg"]);
    expect(music?.providers.map((provider) => provider.id)).toEqual(["acestep"]);
    expect(voice?.providers.map((provider) => provider.id)).toEqual(["voicebox"]);
    expect(transcript?.providers.map((provider) => provider.id)).toEqual(["whisper"]);
    expect(render?.label).toBeTruthy();
    expect(music?.label).toBeTruthy();
    expect(voice?.label).toBeTruthy();
    expect(transcript?.label).toBeTruthy();
  });

  it("traegt je Anbieter die Art Programm oder Dienst", () => {
    const providers = capabilities().flatMap((capability) => capability.providers);
    const kinds = Object.fromEntries(providers.map((provider) => [provider.id, provider.kind]));
    expect(kinds).toEqual({
      ffmpeg: "program",
      acestep: "service",
      voicebox: "service",
      whisper: "program",
    });
  });

  it("fuehrt die Transkript-Faehigkeit genau einmal, mit whisper als Programm", () => {
    const transcript = capabilities().filter((capability) => capability.id === "transcript");
    expect(transcript).toHaveLength(1);
    const [capability] = transcript;
    expect(capability?.label).toBe("Transkript");
    expect(capability?.providers).toHaveLength(1);
    expect(capability?.providers[0]).toMatchObject({
      id: "whisper",
      kind: "program",
      install: "auto",
    });
  });

  it("hat fuer acestep keinen Prozess-Proxy mehr", () => {
    const music = capabilities().find((capability) => capability.id === "music");
    expect(music?.providers[0]).not.toHaveProperty("detect");
  });
});

describe("detect: die Zustaende", () => {
  it("meldet ffmpeg als vorhanden, wenn der Erkennungsbefehl antwortet", async () => {
    const calls: string[][] = [];
    const run: Run = async (args) => {
      calls.push(args);
      return "ffmpeg version 7";
    };
    const report = await detect(run);
    const render = report.find((entry) => entry.capability.id === "render");
    expect(render?.state).toBe("present");
    expect(render?.provider).toBe("ffmpeg");
    expect(calls).toContainEqual(["ffmpeg", "-version"]);
    expect(renderReport(report)).toContain("Schnitt/Mix/Render: vorhanden (Programm: ffmpeg)");
  });

  it("meldet ffmpeg als automatisch installierbar, wenn der Befehl fehlt", async () => {
    const report = await detect(failing);
    const render = report.find((entry) => entry.capability.id === "render");
    expect(render?.state).toBe("auto-installable");
    expect(renderReport(report)).toContain("Schnitt/Mix/Render: automatisch installierbar (ffmpeg)");
  });

  it("meldet whisper als vorhanden, wenn der Erkennungsbefehl antwortet", async () => {
    const calls: string[][] = [];
    const run: Run = async (args) => {
      calls.push(args);
      return "";
    };
    const report = await detect(run);
    const transcript = report.find((entry) => entry.capability.id === "transcript");
    expect(transcript?.state).toBe("present");
    expect(transcript?.provider).toBe("whisper");
    expect(calls).toContainEqual(["whisper-ctranslate2", "--help"]);
    expect(renderReport(report)).toContain("Transkript: vorhanden (Programm: whisper)");
  });

  it("meldet whisper als automatisch installierbar, wenn das Kommando fehlt", async () => {
    const report = await detect(failing);
    const transcript = report.find((entry) => entry.capability.id === "transcript");
    expect(transcript?.state).toBe("auto-installable");
    expect(transcript?.provider).toBeUndefined();
    expect(renderReport(report)).toContain("Transkript: automatisch installierbar (whisper)");
  });

  it("zeigt die Transkript-Zeile genau einmal, auch wenn die Erkennung wirft", async () => {
    const run: Run = async (args) => {
      if (args[0] === "whisper-ctranslate2") throw new Error("kaputt");
      return "";
    };
    const report = await detect(run);
    const lines = renderReport(report)
      .split("\n")
      .filter((line) => line.startsWith("Transkript:"));
    expect(lines).toEqual(["Transkript: automatisch installierbar (whisper)"]);
  });

  it("meldet einen Dienst mit erreichbarem /health als vorhanden (Dienst: acestep)", async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      return new Response("ok", { status: 200 });
    };
    const services: ServiceFactories = { acestep: () => acestepProvider({}, { fetch }) };

    const report = await detect(failing, capabilities(), services);
    const music = report.find((entry) => entry.capability.id === "music");

    expect(music?.state).toBe("present");
    expect(music?.provider).toBe("acestep");
    expect(renderReport(report)).toContain("Musik: vorhanden (Dienst: acestep)");
    expect(calls).toContain("http://127.0.0.1:8001/health");
  });

  it("meldet einen toten Dienst als nur von Hand und wirft nie", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("kein Dienst");
    };
    const services: ServiceFactories = { acestep: () => acestepProvider({}, { fetch }) };

    const report = await detect(failing, capabilities(), services);
    const music = report.find((entry) => entry.capability.id === "music");

    expect(music?.state).toBe("manual");
    expect(music?.provider).toBeUndefined();
    expect(renderReport(report)).toContain("Musik: nur von Hand (acestep)");
  });

  it("meldet einen Dienst ohne Fabrik als nur von Hand, ohne einen Dienst zu fragen", async () => {
    const report = await detect(failing);
    const music = report.find((entry) => entry.capability.id === "music");
    const voice = report.find((entry) => entry.capability.id === "voice");
    expect(music?.state).toBe("manual");
    expect(voice?.state).toBe("manual");
  });

  it("wirft nicht, wenn die Dienst-Erkennung selbst scheitert", async () => {
    const services: ServiceFactories = {
      acestep: () => ({
        detect: async () => {
          throw new Error("kaputt");
        },
      }),
    };
    const report = await detect(failing, capabilities(), services);
    const music = report.find((entry) => entry.capability.id === "music");
    expect(music?.state).toBe("manual");
  });

  it("meldet eine Faehigkeit ohne Anbieter als nur von Hand", async () => {
    const ohneAnbieter: Capability = { id: "voice", label: "Stimme", providers: [] };
    const report = await detect(failing, [ohneAnbieter]);
    expect(report).toHaveLength(1);
    expect(report[0]?.state).toBe("manual");
  });

  it("bereitet Schluesselbedarf als eigenen Zustand vor", async () => {
    const mitSchluessel: Capability = {
      id: "voice",
      label: "Stimme",
      providers: [
        { id: "elevenlabs", kind: "program", detect: ["elevenlabs", "ping"], install: "key" },
      ],
    };
    const report = await detect(failing, [mitSchluessel]);
    expect(report[0]?.state).toBe("key-required");
    expect(renderReport(report)).toBe("Stimme: Schluessel noetig (elevenlabs)");
  });

  it("wirft nicht, wenn der Erkennungsbefehl sofort scheitert", async () => {
    const run: Run = () => {
      throw new Error("kaputt");
    };
    await expect(detect(run)).resolves.toHaveLength(capabilities().length);
  });
});

describe("renderReport: eine Zeile je Faehigkeit", () => {
  const zustandsworte: Record<CapabilityState, string> = {
    present: "vorhanden",
    "auto-installable": "automatisch installierbar",
    manual: "nur von Hand",
    "key-required": "Schluessel noetig",
  };

  it("nennt je Faehigkeit genau eine Zeile mit genau einem Zustand", async () => {
    const report = await detect(failing);
    const lines = renderReport(report).split("\n");
    expect(lines).toHaveLength(report.length);
    report.forEach((entry, index) => {
      const line = lines[index] ?? "";
      expect(line).toContain(entry.capability.label);
      const genannt = Object.values(zustandsworte).filter((wort) => line.includes(wort));
      expect(genannt).toEqual([zustandsworte[entry.state]]);
    });
  });

  it("rendert eine Faehigkeit ohne Anbieter, statt zu werfen", () => {
    const ohneAnbieter: Capability = { id: "voice", label: "Stimme", providers: [] };
    const text = renderReport([{ capability: ohneAnbieter, state: "manual" }]);
    expect(text).toBe("Stimme: nur von Hand");
  });
});

let out: string[] = [];
let err: string[] = [];

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
});

describe("runCli: doctor", () => {
  it("meldet jede Faehigkeit mit einem Zustand und endet mit 0", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
    const code = await runCli(["doctor"]);
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Schnitt/Mix/Render");
    expect(out.join("\n")).toContain("Musik: vorhanden (Dienst: acestep)");
    expect(out.join("\n")).toContain("Stimme: vorhanden (Dienst: voicebox)");
    expect(out.join("\n")).toContain("Transkript:");
    expect(err).toEqual([]);
  });

  it("fragt die Dienste ohne Projekt an ihren Vorgabeadressen", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      urls.push(String(input));
      return new Response("", { status: 200 });
    });
    const code = await runCli(["doctor"]);
    expect(code).toBe(0);
    expect(urls).toContain("http://127.0.0.1:8001/health");
    expect(urls).toContain("http://127.0.0.1:17493/health");
  });

  it("endet bei zu vielen Argumenten mit 2 und einer Aufrufzeile", async () => {
    const code = await runCli(["doctor", "zu-viel"]);
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Aufruf");
    expect(out).toEqual([]);
  });
});
