import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Die Huellen und die Installationsanleitung am Rand: geprueft wird, was ein
 * Harness wirklich liest. Die Tests benutzen die echten Dateien des Repos,
 * damit eine Anleitung nichts nennt, was es nicht gibt.
 */

/** Die Repo-Wurzel, in der die echten Dateien liegen. */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Ein Repo-Pfad als Systempfad. */
function repoFile(relativePath: string): string {
  return join(repoRoot, ...relativePath.split("/"));
}

/** Die neuen Dateien, fuer die die Geviertstrich-Regel gilt. */
const neueDateien = [
  ".claude-plugin/plugin.json",
  ".opencode/plugins/videowizard.js",
  "docs/install.md",
  "README.md",
];

describe("die Claude-Code-Huelle", () => {
  it("ist gueltiges JSON mit name, description, version und license", async () => {
    const raw = await readFile(repoFile(".claude-plugin/plugin.json"), "utf8");
    const plugin = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["name", "description", "version", "license"]) {
      const value = plugin[key];
      expect(typeof value, key).toBe("string");
      expect((value as string).length, key).toBeGreaterThan(0);
    }
  });
});

describe("das OpenCode-Plugin", () => {
  it("laedt als ESM und exportiert eine Funktion", async () => {
    const file = pathToFileURL(repoFile(".opencode/plugins/videowizard.js")).href;
    const plugin = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    const funktionen = Object.values(plugin).filter((value) => typeof value === "function");
    expect(funktionen.length).toBeGreaterThan(0);
  });

  it("bietet die V1- und V2-Eingaenge", async () => {
    const file = pathToFileURL(repoFile(".opencode/plugins/videowizard.js")).href;
    const plugin = (await import(/* @vite-ignore */ file)) as {
      default?: { id?: unknown; server?: unknown; setup?: unknown };
    };
    expect(plugin.default?.id).toBe("videowizard");
    expect(typeof plugin.default?.server).toBe("function");
    expect(typeof plugin.default?.setup).toBe("function");
  });
});

describe("die Installationsanleitung", () => {
  it("nennt die drei Harnesse als Ueberschriften und den Marker npm --silent", async () => {
    const install = await readFile(repoFile("docs/install.md"), "utf8");
    for (const harness of ["Claude Code", "OpenCode", "Codex"]) {
      expect(install).toMatch(new RegExp(`^## ${harness}\\s*$`, "m"));
    }
    expect(install).toContain("npm --silent");
  });

  it("nennt nur Pfade, die es im Repo wirklich gibt", async () => {
    const install = await readFile(repoFile("docs/install.md"), "utf8");
    const pfade = [
      ".claude-plugin/plugin.json",
      ".opencode/plugins/videowizard.js",
      "src/mcp/server.ts",
      "skills/",
    ];
    for (const pfad of pfade) {
      expect(install, pfad).toContain(pfad);
      const info = await stat(repoFile(pfad));
      expect(pfad.endsWith("/") ? info.isDirectory() : info.isFile(), pfad).toBe(true);
    }
  });
});

describe("die README", () => {
  it("nennt den Doctor-Befehl und den MCP-Start", async () => {
    const readme = await readFile(repoFile("README.md"), "utf8");
    expect(readme).toContain("npm --silent run vz -- doctor");
    expect(readme).toContain("npm --silent run mcp");
  });
});

describe("die neuen Dateien", () => {
  it("enthalten keine Geviertstriche", async () => {
    for (const datei of neueDateien) {
      const text = await readFile(repoFile(datei), "utf8");
      expect(text.includes("\u2014"), datei).toBe(false);
    }
  });
});
