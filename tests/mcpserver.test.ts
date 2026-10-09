import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult, CompatibilityCallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/mcp/server.js";
import { listTools, type ToolDeps } from "../src/mcp/tools.js";

/**
 * Der MCP-Server am Rand: Ein Client spricht ueber In-Memory-Transporte mit
 * einer frischen Serverinstanz. Die Befehle selbst sind durch ToolDeps ersetzt,
 * damit die Tests ohne Dateisystem und ohne echte Provider laufen.
 */

/** Ein Werkzeugergebnis, wie der Client es liefert; auch die alte Form. */
type ToolCallResult = CallToolResult | CompatibilityCallToolResult;

/** Der Text eines Werkzeugergebnisses. */
function resultText(result: ToolCallResult): string {
  const content: unknown = "content" in result ? result.content : undefined;
  if (!Array.isArray(content)) return "";
  return (content as CallToolResult["content"])
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n");
}

/** Ob ein Werkzeugergebnis als Fehler gekennzeichnet ist. */
function isErrorResult(result: ToolCallResult): boolean {
  return "isError" in result && result.isError === true;
}

/** Verbindet einen frischen Server ueber In-Memory-Transporte mit einem Client. */
async function connect(
  deps: ToolDeps = {},
): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "videowizard test", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP-Server ueber In-Memory-Transport", () => {
  it("meldet die elf Werkzeuge, die listTools liefert", async () => {
    const { client, close } = await connect();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(listTools().map((tool) => tool.name));
      expect(tools).toHaveLength(11);

      const status = tools.find((tool) => tool.name === "status");
      expect(status?.inputSchema["type"]).toBe("object");
      expect(status?.inputSchema["required"]).toContain("dir");
    } finally {
      await close();
    }
  });

  it("beantwortet einen Werkzeugaufruf mit der Ausgabe des Befehls", async () => {
    const calls: string[][] = [];
    const { client, close } = await connect({
      runCli: async (argv) => {
        calls.push([...argv]);
        console.log("Doctor: alles vorhanden");
        return 0;
      },
    });
    try {
      const result = await client.callTool({ name: "doctor", arguments: {} });
      expect(calls).toEqual([["doctor"]]);
      expect(isErrorResult(result)).toBe(false);
      expect(resultText(result)).toBe("Doctor: alles vorhanden");
    } finally {
      await close();
    }
  });

  it("liefert einen fehlgeschlagenen Befehl als isError zurueck", async () => {
    const { client, close } = await connect({
      runCli: async () => {
        console.log("kein Projekt in kaputt");
        console.error("Fehler: Projektdatei ist kaputt");
        return 1;
      },
    });
    try {
      const result = await client.callTool({ name: "status", arguments: { dir: "kaputt" } });
      expect(isErrorResult(result)).toBe(true);
      const text = resultText(result);
      expect(text).toContain("kein Projekt in kaputt");
      expect(text).toContain("Fehler: Projektdatei ist kaputt");
    } finally {
      await close();
    }
  });

  it("liefert falsche Argumente als isError zurueck", async () => {
    const { client, close } = await connect({
      runCli: async () => {
        throw new Error("Der Befehl darf bei falschen Argumenten nicht laufen.");
      },
    });
    try {
      const result = await client.callTool({ name: "status", arguments: {} });
      expect(isErrorResult(result)).toBe(true);
      expect(resultText(result)).toContain("dir");
    } finally {
      await close();
    }
  });

  it("serialisiert zwei gleichzeitige Aufrufe ohne vermischte Ausgabe", async () => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let secondStarted!: () => void;
    const secondStartedPromise = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    let calls = 0;
    const { client, close } = await connect({
      runCli: async () => {
        calls += 1;
        const call = calls;
        console.log(`${call} Anfang`);
        if (call === 1) {
          firstStarted();
          await firstGate;
          console.log("eins Ende");
        } else {
          secondStarted();
          await secondGate;
          console.log("zwei Ende");
        }
        return 0;
      },
    });

    const first = client.callTool({ name: "doctor", arguments: {} });
    const second = client.callTool({ name: "doctor", arguments: {} });
    try {
      await firstStartedPromise;

      // Dem zweiten Aufruf Gelegenheit geben, ohne Warteschlange zu starten.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(calls).toBe(1);

      releaseFirst();
      await secondStartedPromise;
      releaseSecond();

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(resultText(firstResult)).toBe("1 Anfang\neins Ende");
      expect(resultText(secondResult)).toBe("2 Anfang\nzwei Ende");
      expect(console.log).toBe(originalLog);
      expect(console.error).toBe(originalError);
      expect(console.warn).toBe(originalWarn);
    } finally {
      // Beide Aufrufe sicher beenden, auch wenn eine Zusicherung oben fehlschlug.
      releaseFirst();
      releaseSecond();
      await Promise.allSettled([first, second]);
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      await close();
    }
  });
});
