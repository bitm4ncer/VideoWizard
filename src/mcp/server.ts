import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callTool, listTools, type ToolDeps, type ToolResult } from "./tools.js";

/**
 * Der MCP-Server ueber den Werkzeugen aus tools.ts: er registriert genau, was
 * listTools liefert, und gibt die gesammelte Ausgabe der Befehle als Text
 * zurueck. Die Fachlogik bleibt in den Befehlen.
 */

/** Name und Version, die der Client beim Verbinden sieht. */
const SERVER_INFO = { name: "videowizard", version: "0.1.0" };

/** Das Schema, das die SDK beim Registrieren erwartet. */
type JsonSchema = Parameters<typeof z.fromJSONSchema>[0];

/** Uebertraegt das Ergebnis aus tools.ts in die Form der SDK. */
function toCallToolResult(result: ToolResult): CallToolResult {
  return {
    content: result.content,
    ...(result.isError === true ? { isError: true } : {}),
  };
}

/**
 * Erzeugt den Server mit allen Werkzeugen aus listTools. Die Aufrufe laufen
 * serialisiert: die Konsolenbruecke in tools.ts ist prozessweit. Ohne
 * Warteschlange koennten zwei gleichzeitige Aufrufe ihre Ausgabe vermischen
 * und einen toten Sammler hinterlassen.
 */
export function createServer(deps: ToolDeps = {}): McpServer {
  const server = new McpServer(SERVER_INFO);

  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  for (const tool of listTools()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: z.fromJSONSchema(tool.inputSchema as JsonSchema),
      },
      (args: unknown) => {
        const toolArgs = (args ?? {}) as Record<string, unknown>;
        return enqueue(async () => toCallToolResult(await callTool(tool.name, toolArgs, deps)));
      },
    );
  }

  return server;
}

/**
 * Startet den Server auf stdin/stdout. Kein process.exit: Fehler eines
 * Werkzeugs kommen als isError zurueck; endet der Transport, endet der Prozess.
 */
export async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

// Nur beim direkten Start verbinden; beim Import (Tests) bleibt der Prozess
// unberuehrt. Dasselbe Muster wie in cli.ts.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
