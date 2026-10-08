# VideoWizard Etappe 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Geruest von VideoWizard: Projektformat, Doctor, Baustein-Mechanik und ein erster Musik-Provider, plus die ersten Skills.

**Architecture:** Ein Node/TypeScript-Kern (CLI) mit einer Faehigkeiten-Registry und austauschbaren Providern. Skills liegen portabel im Repo, Bausteine ebenfalls und reisen mit dem Plugin. Kein Harness-Code in dieser Etappe.

**Tech Stack:** TypeScript, Node 22, Vitest, tsx, ffmpeg als externer Prozess.

**Spec:** `docs/superpowers/specs/2026-10-08-videowizard-design.md`

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- Ein Projekt hat genau eine Wahrheitsdatei `project.json`, atomar geschrieben.
- Nichts ohne Zustimmung: kein Ueberschreiben, keine Installation, kein Upload.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen.
- Skills: ein Auftrag je Skill, `description` nur mit Ausloesern, `SKILL.md` kurz.
- Bausteine sind selbsttragend, versioniert, mit Lizenz und Eintrag in `blocks/index.json`.

## Review Focus

- Ein `project.json` aus einer aelteren Schema-Version: die Migration darf nichts stillschweigend verlieren.
- Zwei gleichzeitige Schreibvorgaenge auf `project.json`: der atomare Tausch darf keine halbe Datei hinterlassen, auch nicht unter Windows.
- Ein Baustein ohne Eintrag in `index.json` (oder umgekehrt): der Integritaetscheck muss beide Richtungen nennen.
- Ein Provider, der nicht laeuft: der Doctor meldet "fehlt", ohne zu werfen, und der Workflow laeuft nicht ins Leere.
- Ein frischer leere Ordner: `status` und `doctor` verhalten sich definiert, ohne Absturz.

---

### Task 1: Repo-Geruest und Konventionen

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `AGENTS.md` (kurz), `docs/writing-guide.md` (Aufnahmeregeln fuer Skills und Bausteine)

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, `npm run vz` (CLI-Einstieg) sind lauffaehig.

- [ ] **Step 1: `package.json` mit Node 22, `type: module`, Skripten `test`, `typecheck`, `vz`** (tsx auf `src/cli.ts`), Dev-Abhaengigkeiten `typescript`, `vitest`, `tsx`, `@types/node`.
- [ ] **Step 2: `tsconfig.json`** im Stil strikter Node-ESM-Projekte (`module: NodeNext`, `strict`).
- [ ] **Step 3: `npm install`, dann `npm test`** (noch keine Tests, Vitest meldet 0 Dateien ohne Fehler) und `npm run typecheck`.
- [ ] **Step 4: `AGENTS.md`** mit Zweck, Ebenen und den fuenf Regeln gegen Chaos aus der Spec.
- [ ] **Step 5: `docs/writing-guide.md`** mit der Checkliste fuer neue Skills (Frontmatter, ein Auftrag, Laenge) und Bausteine (id, kind, capability, license, version, entry).
- [ ] **Step 6: Commit** `chore: geruest und konventionen`

### Task 2: Projektformat

**Files:**
- Create: `src/lib/types.ts`, `src/lib/project.ts`, `src/lib/paths.ts`
- Create: `tests/project.test.ts`

**Interfaces:**
- Produces: `loadProject(dir): Promise<Project>`, `saveProject(dir, project): Promise<void>` (atomar), `projectPaths(dir)`, `type Project`, `type Block`, `type Format`.

- [ ] **Step 1: Failing tests** in `tests/project.test.ts`: Laden eines gueltigen Projekts; atomares Speichern (schreibt in eine Nebendatei und tauscht); ein unbekanntes `schema` groesser als die aktuelle Version wirft mit klarer Meldung; eine fehlende Datei wirft mit Pfad.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL (Module fehlen).
- [ ] **Step 3: Typen und Funktionen implementieren** nach Abschnitt 7 der Spec (`schema`, `id`, `title`, `format`, `language`, `sources`, `blocks`, `capabilities`, `delivery`). Atomar ueber `<datei>.tmp` plus `rename`.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test` und `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: projektformat mit atomarem speichern`

### Task 3: CLI-Skelett

**Files:**
- Create: `src/cli.ts`, `src/commands/status.ts`
- Create: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `loadProject`, `projectPaths`
- Produces: `runCli(argv: string[]): Promise<number>` (testbar), Befehle `status` und `help`.

- [ ] **Step 1: Failing tests**: `runCli(['status', '<leerer ordner>'])` liefert Code 0 und die Meldung "kein Projekt"; `runCli(['help'])` nennt die Befehle; ein unbekannter Befehl liefert Code 2 und eine Meldung.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** `runCli` ohne `process.exit`, damit der Test laeuft; `src/cli.ts` ruft es nur auf und setzt den Exit-Code.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: cli-skelett mit status`

### Task 4: Faehigkeiten-Registry und Doctor

**Files:**
- Create: `src/lib/capabilities.ts`, `src/commands/doctor.ts`
- Create: `tests/doctor.test.ts`

**Interfaces:**
- Produces: `capabilities(): Capability[]` (jede mit `id`, `label`, `providers[]`), `detect(): Promise<Report>` (`Report` je Faehigkeit: `present | auto-installable | manual | key-required`), `renderReport(report): string`.

- [ ] **Step 1: Failing tests**: `detect()` meldet fuer ffmpeg `present`, wenn der Detektionsbefehl antwortet, sonst `auto-installable`; eine Faehigkeit ohne Anbieter meldet `manual`; `renderReport` nennt je Faehigkeit genau einen Zustand und keine Ausnahme.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Detection ueber ein eingehakbares `run` (wie `ae ping`), damit der Test ohne Werkzeug laeuft. Registry beginnt mit `render` (ffmpeg) und `music` (acestep).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: doctor mit faehigkeiten-registry`

### Task 5: Baustein-Mechanik

**Files:**
- Create: `blocks/index.json`, `blocks/ffmpeg/loudnorm/recipe.md`, `blocks/beats/short-retention/template.md`
- Create: `src/lib/blocks.ts`, `tests/blocks.test.ts`

**Interfaces:**
- Produces: `loadIndex(root): Promise<BlockEntry[]>`, `loadBlock(root, id): Promise<{ entry: BlockEntry; files: string[] }>`, `checkIntegrity(root): Promise<string[]>` (fehlende und verwaiste Eintraege), `type BlockEntry` (`id`, `kind`, `capability`, `purpose`, `inputs`, `requires`, `license`, `version`, `entry`).

- [ ] **Step 1: Failing tests**: `checkIntegrity` meldet eine Datei unter `blocks/` ohne Eintrag und einen Eintrag ohne Datei; `loadBlock` liefert Eintrag und Dateiliste; ein unbekanntes `id` wirft mit dem Namen.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach Abschnitt 6 der Spec. Zwei echte Startbausteine anlegen: das ffmpeg-Rezept `loudnorm` (aus der VideoPipeline uebernommen und als Baustein sauber beschrieben) und die Beat-Vorlage `short-retention` (Hook, Confirm, Payoff, Loop oder CTA).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: bausteine mit verzeichnis und integritaetscheck`

### Task 6: Musik-Provider ACE-Step

**Files:**
- Create: `src/lib/providers/acestep.ts`, `src/lib/providers/music.ts`
- Create: `tests/acestep.test.ts`, `tests/musicprovider.test.ts`

**Interfaces:**
- Consumes: `Capability`, Projekt-`capabilities.music`
- Produces: `type MusicProvider` (`id`, `detect()`, `generate(req): Promise<Buffer>`), `acestepProvider(cfg, deps?): MusicProvider`, `resolveMusicProvider(project, deps?): MusicProvider`.

- [ ] **Step 1: Failing tests**: der ACE-Step-Provider spricht `POST /release_task`, dann `POST /query_result` (Status 1) und `GET /v1/audio`, mit gefaelschtem `fetch`; ein gescheiterter Lauf (Status 2) wirft mit klarer Meldung; `resolveMusicProvider` waehlt anhand von `capabilities.music.provider` und wirft bei unbekanntem Namen.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Die getestete Bruecke aus der VideoPipeline (`src/lib/acestep.ts`) als Vorlage nehmen, aber als Provider hinter den gemeinsamen Vertrag stellen. Keine zweiten Endpunktannahmen erfinden; die Endpunkte stehen in der ACE-Step-API-Doku.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: musik-provider acestep hinter gemeinsamem vertrag`

### Task 7: Die ersten Skills

**Files:**
- Create: `skills/meta/using-videowizard/SKILL.md`
- Create: `skills/planning/planning-short/SKILL.md`
- Create: `skills/producing/making-a-short/SKILL.md`
- Create: `skills/tools/tool-ffmpeg/SKILL.md`
- Create: `skills/tools/tool-ace-step/SKILL.md`
- Create: `skills/reference/blocks/SKILL.md`, `skills/reference/video-anatomy/SKILL.md`

**Interfaces:**
- Consumes: die Kernbefehle aus Task 3 und 4, die Bausteine aus Task 5, den Provider aus Task 6.
- Produces: ladbare Skills mit Frontmatter (`name`, `description`).

- [ ] **Step 1: Failing check** als Test `tests/skills.test.ts`: jede `SKILL.md` hat Frontmatter mit `name` und `description`, `description` beginnt mit "Use when", und `SKILL.md` ist unter 500 Woertern. Erwartet FAIL, weil die Dateien fehlen.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Skills schreiben.** `using-videowizard` als Einstieg (Doctor zuerst, dann Router). `planning-short` nach der Beat-Vorlage, mit Plattform-Specs. `making-a-short` als Ablauf ueber Faehigkeiten, ohne Werkzeugdetails. `tool-ffmpeg` und `tool-ace-step` mit den fuenf Abschnitten (Erkennen, Installieren, Einrichten, Benutzen, Grenzen). `reference/blocks` und `reference/video-anatomy` als Nachschlagewerk.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: erste skills fuer einstieg, planung, produktion und tools`

### Task 8: Katalog-Generator

**Files:**
- Create: `scripts/catalog.mjs`, `docs/catalog.md` (erzeugt)
- Create: `tests/catalog.test.ts`

**Interfaces:**
- Consumes: die Frontmatter der Skills, `blocks/index.json`
- Produces: `buildCatalog(root): Promise<string>`, ein Markdown mit je Skill `name`, `description` und je Baustein `id`, `purpose`, `license`.

- [ ] **Step 1: Failing test**: `buildCatalog` nennt jeden Skill und jeden Baustein genau einmal; eine fehlende `description` erscheint als Fehlerzeile, nicht als Absturz.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Der Generator liest nur, er schreibt nichts; `docs/catalog.md` entsteht durch einen Aufruf und wird eingecheckt.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`. Danach `node scripts/catalog.mjs > docs/catalog.md` und das Ergebnis ansehen.
- [ ] **Step 5: Commit** `feat: katalog aus skills und bausteinen`
