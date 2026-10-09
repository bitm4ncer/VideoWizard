# VideoWizard Etappe 7 Implementation Plan: Finish fuer Menschen (Diffusion-Studio-Hand-off)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `vz handoff <ordner>` erzeugt aus einem VideoWizard-Projekt einen Diffusion-Studio-Projektordner (Einweg), damit ein Mensch dort visuell feinschleifen und ausgeben kann; verdrahtet und dokumentiert.

**Architecture:** Reine Dateierzeugung im Kern (`src/lib/handoff.ts`, `src/commands/handoff.ts`) plus MCP-Werkzeug. Kein zweiter Renderer, keine neue Abhaengigkeit. Medien ueber absolute Pfade (im Spike verifiziert). DS-Konventionen (JSX, audio, captions) werden aus den installierten DS-Docs gelesen, nicht geraten.

**Tech Stack:** TypeScript/Node 22, Vitest, vorhandener ffmpeg-Wrapper (Frameextraktion fuer Standbilder).

**Spec/Design:** `docs/research/2026-10-09-diffusion-studio-spike.md` (Spike-Ergebnis) plus Hauptspezifikation Etappe 7.

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, Bezeichner Englisch; NodeNext `.js`-Importe.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen; keine neue Abhaengigkeit.
- Kein Ueberschreiben ohne Zustimmung: vorhandener Zielordner wird verweigert, `--force` ueberschreibt.
- DS-Doc-Quelle: `C:\Users\konta\AppData\Local\DiffusionStudio\app-0.210.0\resources\docs` (nur lesen). Keine erfundene DS-API.
- Kein Befehl in Skills, den es nicht gibt (CLI waechst um `handoff`; MCP-Werkzeuge dann 11).

## Review Focus

- Projekt ohne Bloecke oder ohne Quellen: klare Meldung, Exit 1, kein halber Zielordner.
- Standbild-Block ohne extrahierbaren Frame: klare Meldung mit Block-ID, Exit 1.
- Keine Wortzeiten vorhanden: Captions werden ausgelassen und gewarnt, kein Fehler.
- Zielordner existiert bereits: Verweigerung mit Pfad; `--force` ueberschreibt; Fehler hinterlassen keinen Mischzustand.
- Generiertes `index.tsx` ist syntaktisch plausibles JSX und nennt nur DS-Elemente aus der installierten Doku.

---

### Task 1: `vz handoff` Kern

**Files:**
- Create: `src/lib/handoff.ts`, `src/commands/handoff.ts`
- Modify: `src/cli.ts`, `src/mcp/tools.ts`
- Test: `tests/handoff.test.ts`, `tests/mcptools.test.ts`

**Interfaces:**
- Produces in `src/lib/handoff.ts`:
  - `handoffDir(projectDir: string): string` (Ziel `<projekt>/handoff/diffusion-studio`)
  - `buildIndexTsx(project: Project, media: HandoffMedia): string` (DS-JSX als Text; `HandoffMedia` traegt je Block den Videopfad oder Bildpfad, Audiofiles, Captions-Eintraege)
  - `buildPackageJson(project: Project): string` (name/`projectId`/`displayName`/`main: index.tsx`; keine devDependencies noetig, da DS sie selbst setzt)
  - `renderHandoff(projectDir: string, out: string, deps?: { run?: RunFn; force?: boolean }): Promise<{ index: string; files: string[] }>`
- Command `vz handoff <ordner> [--out <pfad>] [--force]`; MCP-Werkzeug `handoff` (`dir` Pflicht, `out`/`force` optional).

- [ ] **Step 1: Failing tests** in `tests/handoff.test.ts` (Temp-Projekt-Fixture wie `tests/review.test.ts`):
  - Mapping: je `take`-Block eine `<scene id="b001">` mit `<video src src=... start={source_in} end={source_out}>`; absolute Pfade mit Schraegstrichen.
  - `still`-Block: ffmpeg-Aufruf (eingehakt) extrahiert den Frame bei `freeze_at` nach `handoff/media/<block>.png`, Szene nutzt `<image>`; fehlgeschlagene Extraktion: Fehler nennt Block-ID.
  - TTS: Block mit `tts.file` erzeugt ein `<audio>`; ohne TTS kein Audio-Element.
  - Captions: vorhandene Wortzeiten (Transkriptdatei des Projekts) erzeugen ein `<captions>`-Element nach der installierten DS-Doku; fehlen sie, wird gewarnt und ausgelassen.
  - `project.json`-Fehler, keine Quellen, keine Bloecke: Exit 1 mit klarer Meldung.
  - Vorhandener Zielordner: Exit 1 mit Pfad; mit `force` wird ersetzt; kein Mischzustand bei Fehlern (erst bauen, dann schreiben).
  - `tests/mcptools.test.ts`: 11 Werkzeuge; argv `["handoff", dir]`, mit `--out`/`--force`.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** DS-Doku lesen fuer `<audio>`, `<captions>`, `<image>`, `<scene>`-Props; Dateien atomar (Temp-Ordner im Ziel, dann umbenennen). `handoff/` in der Projektstruktur dokumentieren (README im Handoff-Ordner mit Hinweis "Einweg: nach dem Hand-off ist DS der Master").
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: vz handoff nach diffusion studio`

### Task 2: Live-Gegenpruefung in Diffusion Studio

**Files:** keine (Verifikation; Findings werden zu Fix-Auftraegen oder geduldeten Minors im Ledger)

- [ ] **Step 1:** Aus einem echten kleinen Projekt (oder Fixture mit Clip, TTS-Sample, Wortzeiten) `vz handoff` ausfuehren.
- [ ] **Step 2:** Ordner in der laufenden DS-App oeffnen (MCP `tools.diffusion.open`), `check` auf die Szenen, `capture` auf kritische Zeitpunkte; Audio- und Captions-Element sichtbar pruefen.
- [ ] **Step 3:** Ergebnis ins Ledger (verifiziert/nicht verifiziert), Befunde als Minors oder Fix-Auftraege.

### Task 3: Doku und Verdrahtung

**Files:**
- Create: `skills/producing/handoff-to-diffusion/SKILL.md`
- Modify: `skills/producing/making-a-short/SKILL.md`, `skills/meta/using-videowizard/SKILL.md`, `docs/migration-map.md`, `docs/catalog.md`, `README.md`

- [ ] **Step 1: Failing tests**: Skill-Liste um `handoff-to-diffusion` ergaenzen (RED), Migration-Map-Test deckt den neuen `vz handoff`-Span.
- [ ] **Step 2: Schreiben.** Skill: wann der Hand-off faellig ist, Einweg-Regel (nach dem Hand-off DS ist Master), was mitkommt und was nicht (Overlays v1 ausgenommen). `making-a-short`: Schritt "Finish fuer Menschen" mit `vz handoff`. `using-videowizard`: 11 Werkzeuge. Migration-Map: DS-Zeile auf `uebertragen (Einweg)` mit Beleg `vz handoff` und Spike-Doc. Katalog neu erzeugen.
- [ ] **Step 3: Tests gruen**, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 4: Commit** `docs: handoff-skill und verdrahtung`

## Entscheidungen

- **Einweg.** Nach dem Hand-off ist DS fuer dieses Projekt der Master; `project.json` bleibt Schnittplan-Snapshot. Kein Round-Trip.
- **Absolute Medienpfade** (im Spike verifiziert); Portabilitaet ist nachrangig, Kopieren waere teuer.
- **Standbilder als extrahierte `<image>`-Frames**, nicht als Pseudo-Video.
- **Overlays v1 ausgenommen**, im Skill benannt.
- **Ziel `handoff/diffusion-studio/`**, `--force` noetig zum Ersetzen.
