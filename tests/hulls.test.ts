import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";

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

/** Die Plugin-Metadaten, wie Claude Code sie liest. */
async function readPluginJson(): Promise<Record<string, unknown>> {
  const raw = await readFile(repoFile(".claude-plugin/plugin.json"), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Ob der Pfad eine Datei ist; fehlende Pfade sind keine. */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Ob der Pfad ein Verzeichnis ist; fehlende Pfade sind keine. */
async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Die Skill-Ordner, die der Claude-Loader unter einem manifesten Pfad ohne
 * Rekursion findet: nur unmittelbare Kinder <pfad>/<name>/SKILL.md.
 */
async function skillDirsUnder(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (await isFile(join(dir, entry.name, "SKILL.md"))) {
      found.push(entry.name);
    }
  }
  return found;
}

/** Alle SKILL.md unterhalb von dir, rekursiv, relativ zur Repo-Wurzel mit "/". */
async function alleSkillDateien(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await alleSkillDateien(full)));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(relative(repoRoot, full).split(sep).join("/"));
    }
  }
  return found;
}

/**
 * Die Befehlsnamen aus der echten Hilfe des CLIs. Der Aufruf faehrt die
 * Befehlsliste und faengt die Ausgabe ab.
 */
async function cliBefehle(): Promise<string[]> {
  const zeilen: string[] = [];
  const ausgabe = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    zeilen.push(parts.map(String).join(" "));
  });
  try {
    expect(await runCli(["help"])).toBe(0);
  } finally {
    ausgabe.mockRestore();
  }
  // Die erste Zeile ist die Ueberschrift, danach je Befehl "  <name>  <summary>".
  return zeilen.slice(1).map((zeile) => zeile.trim().split(/\s+/)[0] ?? "");
}

/** Die neuen Dateien, fuer die die Geviertstrich-Regel gilt. */
const neueDateien = [
  ".claude-plugin/plugin.json",
  ".opencode/plugins/videowizard.js",
  "docs/install.md",
  "docs/migration-map.md",
  "README.md",
];

describe("die Claude-Code-Huelle", () => {
  it("ist gueltiges JSON mit name, description, version und license", async () => {
    const plugin = await readPluginJson();
    for (const key of ["name", "description", "version", "license"]) {
      const value = plugin[key];
      expect(typeof value, key).toBe("string");
      expect((value as string).length, key).toBeGreaterThan(0);
    }
  });

  it("hat eine Autorenangabe", async () => {
    const plugin = await readPluginJson();
    const author = plugin.author as { name?: unknown } | undefined;
    expect(typeof author?.name, "author.name").toBe("string");
    expect((author?.name as string).length, "author.name").toBeGreaterThan(0);
  });

  it("deklariert Skill-Ordner, die der Claude-Loader ohne Rekursion findet", async () => {
    const plugin = await readPluginJson();
    const skills = plugin.skills;
    expect(Array.isArray(skills), "skills").toBe(true);
    const eintraege = skills as unknown[];
    expect(eintraege.length, "skills").toBeGreaterThan(0);

    // Der Loader liest <pfad>/<name>/SKILL.md, ohne weiter zu rekursieren.
    // Deshalb muss jeder Skills-Ordner direkt als solcher Pfad taugen.
    const ausManifest = new Set<string>();
    for (const eintrag of eintraege) {
      expect(typeof eintrag, "skills-Eintrag").toBe("string");
      const pfad = (eintrag as string).replace(/^\.\//, "").replace(/\/$/, "");
      expect(pfad.length, "skills-Eintrag").toBeGreaterThan(0);
      const absolut = repoFile(pfad);
      expect((await stat(absolut)).isDirectory(), pfad).toBe(true);
      const namen = await skillDirsUnder(absolut);
      expect(namen.length, pfad).toBeGreaterThan(0);
      for (const name of namen) {
        ausManifest.add(`${pfad}/${name}/SKILL.md`);
      }
    }

    // Kein Skill unter skills/ darf durchs Raster fallen.
    const alle = await alleSkillDateien(repoFile("skills"));
    expect([...ausManifest].sort()).toEqual(alle.sort());
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

describe("die Migrationskarte", () => {
  it("existiert, nennt die drei Zustaende und den Pfad der VideoPipeline", async () => {
    const karte = await readFile(repoFile("docs/migration-map.md"), "utf8");
    for (const zustand of ["uebertragen", "offen", "bewusst nicht"]) {
      expect(karte, zustand).toContain(zustand);
    }
    expect(karte).toContain("C:\\GitHub\\VideoPipeline");
  });

  it("nennt nur Befehle der CLI-Liste und nur Skills, die es im Repo gibt", async () => {
    const karte = await readFile(repoFile("docs/migration-map.md"), "utf8");

    // Befehle stehen als `vz <name>` im Text; Fliesstext ohne Backticks zaehlt
    // nicht. Ein Name folgt direkt auf "vz " und besteht aus Kleinbuchstaben.
    const befehle = [...karte.matchAll(/`vz ([a-z][a-z-]*)[^`\n]*`/g)].map(
      (treffer) => treffer[1] as string,
    );
    expect(befehle.length, "genannte Befehle").toBeGreaterThan(0);
    const bekannt = await cliBefehle();
    expect(bekannt.length, "CLI-Befehle").toBeGreaterThan(0);
    for (const befehl of befehle) {
      expect(bekannt, befehl).toContain(befehl);
    }

    // Skills stehen als `skills/<pfad>` im Text; ein angehaengtes `/SKILL.md`
    // wird toleriert, geprueft wird der Ordner mit seiner SKILL.md.
    const skills = [...karte.matchAll(/`(skills\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)`/g)].map(
      (treffer) => treffer[1] as string,
    );
    expect(skills.length, "genannte Skills").toBeGreaterThan(0);
    for (const skill of skills) {
      const ordner = skill.replace(/\/SKILL\.md$/, "");
      const basis = repoFile(ordner);
      expect(await isDir(basis), ordner).toBe(true);
      expect(await isFile(join(basis, "SKILL.md")), ordner).toBe(true);
    }
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
