import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { capabilities, detect, renderReport } from "../src/lib/capabilities.js";
import type { Capability, CapabilityState, Run } from "../src/lib/capabilities.js";

/** Ein run, der jeden Erkennungsbefehl verneint. */
const failing: Run = async () => {
  throw new Error("nicht gefunden");
};

describe("capabilities: die Registry", () => {
  it("beginnt mit render (ffmpeg) und music (acestep)", () => {
    const list = capabilities();
    const render = list.find((capability) => capability.id === "render");
    const music = list.find((capability) => capability.id === "music");
    expect(render?.providers.map((provider) => provider.id)).toEqual(["ffmpeg"]);
    expect(music?.providers.map((provider) => provider.id)).toEqual(["acestep"]);
    expect(render?.label).toBeTruthy();
    expect(music?.label).toBeTruthy();
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
  });

  it("meldet ffmpeg als automatisch installierbar, wenn der Befehl fehlt", async () => {
    const report = await detect(failing);
    const render = report.find((entry) => entry.capability.id === "render");
    expect(render?.state).toBe("auto-installable");
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
      providers: [{ id: "elevenlabs", detect: ["elevenlabs", "ping"], install: "key" }],
    };
    const report = await detect(failing, [mitSchluessel]);
    expect(report[0]?.state).toBe("key-required");
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
});

describe("runCli: doctor", () => {
  it("meldet jede Faehigkeit mit einem Zustand und endet mit 0", async () => {
    const code = await runCli(["doctor"]);
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Schnitt/Mix/Render");
    expect(out.join("\n")).toContain("Musik");
    expect(err).toEqual([]);
  });

  it("endet bei zu vielen Argumenten mit 2 und einer Aufrufzeile", async () => {
    const code = await runCli(["doctor", "zu-viel"]);
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Aufruf");
    expect(out).toEqual([]);
  });
});
