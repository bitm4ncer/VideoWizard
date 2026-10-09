# VideoWizard Etappe 4 Implementation Plan: Aus den Harnessen benutzbar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VideoWizard aus Claude Code, Codex und OpenCode benutzbar machen: ein MCP-Server ueber die vorhandenen Befehle, dazwischen duenne Hüllen und eine ehrliche Installationsanleitung.

**Architecture:** Der Kern bleibt die CLI. Der MCP-Server ruft dieselben Befehlsfunktionen auf und gibt deren Ausgabe als Text zurueck. Die Hüllen registrieren nur Skills und MCP; sie enthalten keine Fachlogik. Vorbild und Formvorlage ist das lokal installierte Superpowers-Repo.

**Tech Stack:** TypeScript, Node 22, Vitest, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-08-videowizard-design.md`

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen; NodeNext `.js`-Importe.
- Keine zweite Fachlogik: der MCP-Server ruft die bestehenden Befehle auf.
- Schluessel werden nie ausgegeben.
- Nur belegte Formate: Hüllen folgen den echten Dateien des Superpowers-Repos, nichts erfinden.

## Review Focus

- Ein MCP-Werkzeugaufruf mit falschen Argumenten: klare Meldung, kein Absturz, `isError` statt Ausnahme.
- Ein Befehl mit Exit-Code ungleich 0: der Server meldet den Fehler samt Ausgabe, nicht "ok".
- Die Hüllen enthalten keine Fachlogik; sie verweisen nur.
- Die Installationsanleitung nennt keine Datei und keinen Befehl, den es nicht gibt.
- Die Skills bleiben auffindbar: Katalog und Skill-Test bleiben gruen.

---

### Task 1: MCP-Werkzeuge ueber den Befehlen

**Files:**
- Create: `src/mcp/tools.ts`
- Test: `tests/mcptools.test.ts`

**Interfaces:**
- Produces: `export interface ToolDef { name: string; description: string; inputSchema: Record<string, unknown> }`, `listTools(): ToolDef[]`, `callTool(name: string, args: Record<string, unknown>, deps?): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>`.

- [ ] **Step 1: Failing tests**: `listTools` nennt genau die vorhandenen Befehle als Werkzeuge; `callTool('doctor')` ruft den Befehl und gibt dessen Ausgabe als Text zurueck; ein Befehl mit Exit-Code ungleich 0 setzt `isError`; ein unbekanntes Werkzeug oder fehlende Pflichtargumente ergeben `isError` mit klarer Meldung, keine Ausnahme.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Die Ausgabe der Befehle wird waehrend des Aufrufs abgefangen (`console.log`/`console.error`), damit der Server sie als Text liefern kann; das ist im Code ausdruecklich als Bruecke kommentiert. `runCli` und der Aufruf sind einhakbar.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: mcp-werkzeuge ueber den befehlen`

### Task 2: MCP-Server

**Files:**
- Create: `src/mcp/server.ts`
- Modify: `package.json` (Abhaengigkeit `@modelcontextprotocol/sdk`, Skript `mcp`)
- Test: `tests/mcpserver.test.ts`

- [ ] **Step 1: Failing tests**: der Server laesst sich mit einem In-Memory-Transport verbinden, meldet die Werkzeugliste und beantwortet einen Aufruf; ein Fehlerfall kommt als `isError` zurueck.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach der offiziellen SDK-Form (`McpServer`, `registerTool`, `StdioServerTransport`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: mcp-server ueber stdio`

### Task 3: Hüllen und Installationsanleitung

**Files:**
- Create: `.claude-plugin/plugin.json`, `.opencode/plugins/videowizard.js`, `docs/install.md`, `README.md`
- Test: `tests/hulls.test.ts`

- [ ] **Step 1: Failing tests**: `plugin.json` ist gueltiges JSON mit `name`, `description`, `version`; das OpenCode-Plugin exportiert eine Funktion; `docs/install.md` nennt nur existierende Dateien (der Test prueft die genannten Pfade) und enthaelt die MCP-Konfiguration fuer alle drei Harnesse; `README.md` nennt Zweck und den Doctor-Befehl.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Formvorlagen sind die echten Dateien unter
  `C:\Users\konta\.cache\opencode\npm\git-superpowers-0958a5557860\1791469314769\node_modules\superpowers\`:
  `.claude-plugin/plugin.json` und `.opencode/plugins/superpowers.js` (V2-Registrierung ueber `ctx.skill.transform`, V1 ueber den `config`-Hook). Die Huelle registriert nur das `skills/`-Verzeichnis dieses Repos.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: huellen fuer claude, codex und opencode`

### Task 4: Skills und Katalog

**Files:**
- Modify: `skills/meta/using-videowizard/SKILL.md`, `docs/catalog.md`
- Test: `tests/skills.test.ts`, `tests/catalog.test.ts`

- [ ] **Step 1: Tests zuerst**: der Skill-Test bleibt unveraendert gruen; der Katalog-Test faengt die Aenderung, sobald der Skill-Rumpf sich aendert und der Katalog nicht.
- [ ] **Step 2: `using-videowizard` erweitern**: einen Abschnitt "Als MCP" mit der Werkzeugliste und dem Hinweis, dass die Werkzeuge dieselben Befehle aufrufen.
- [ ] **Step 3: Katalog erzeugen** (`npm --silent run catalog > docs/catalog.md`) und einchecken.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `docs: skills und katalog auf dem stand von etappe 4`

## Entscheidungen fuer diese Etappe

- **Der MCP-Server ruft die CLI-Funktionen auf**, nicht das Betriebssystem; kein zweiter Weg durch die Fachlogik.
- **Die Ausgabe wird an der Servergrenze abgefangen** und als Text geliefert; die Befehle selbst bleiben unveraendert.
- **Kein Build-Schritt.** Alles laeuft ueber `tsx`, wie der Rest des Repos.

## Nicht in dieser Etappe

- Improvement Loop (Etappe 5).
- Cavalry, After Effects, Remotion als Bausteine.
