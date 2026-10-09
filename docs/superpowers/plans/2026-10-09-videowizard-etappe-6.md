# VideoWizard Etappe 6 Implementation Plan: Kreativschicht fuer Kundenarbeit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storyboarding mit Gates, Referenz-Analyse, Treatment-Vorlage, Style-Karten und die gemessene Nachschau `vz review` bauen, ohne Schemaaenderung und ohne neue Abhaengigkeit.

**Architecture:** Die Kreativschicht ist Text und Konvention: neue Skills schreiben `plan.md`-Abschnitte (Visuelles Thema, Shotliste, Freigaben, Entscheidungen); Bausteine liefern Vorlagen (Scaffold, Style-Karten). Nur `vz review` ist Code und folgt dem ueblichen Muster: eingehakbarer `run`, tolerante Parser, ein Befehl plus MCP-Werkzeug.

**Tech Stack:** TypeScript/Node 22, Vitest, ffmpeg/ffprobe ueber den vorhandenen Wrapper.

**Spec:** `docs/superpowers/specs/2026-10-09-kreativschicht-design.md`

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch; NodeNext-Importe mit `.js`.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen.
- Keine Schemaaenderung, keine neue Abhaengigkeit.
- Skills: ein Auftrag, `description` mit "Use when" ohne Ablauf, `SKILL.md` unter 500 Woertern.
- Kein Befehl und kein Pfad in einem Skill, den der Code nicht hat.
- `vz review` berichtet, blockiert nie; Schwellen stehen im Bericht.

## Review Focus

- `vz review` auf ein Projekt ohne Ausgabe in `out/`: klare Meldung, Exit 1, nichts geschrieben.
- Ausgabe da, ffprobe scheitert: klare Meldung, Exit 1, kein Absturz.
- Unerwartete Zeilen in ffmpeg-Ausgaben: Parser ueberspringen sie, sie werfen nicht.
- Die `project.json`-Vorlage des Scaffolds ist mit dem Projektformat lesbar (Pflichtfelder aus `src/lib/types.ts`).
- Neue Bausteine: der Integritaetscheck deckt jede Datei unter `blocks/` (kein verwaister Baustein).

---

### Task 1: Skill `planning/storyboarding`

**Files:**
- Create: `skills/planning/storyboarding/SKILL.md`
- Modify: `tests/skills.test.ts` (feste Skill-Liste), `docs/catalog.md` (neu erzeugen)

**Interfaces:**
- Produces: Skill mit den plan.md-Abschnitten `Visuelles Thema`, `Shotliste`, `Freigaben`, `Entscheidungen`; Inhalt ist Voraussetzung fuer Task 5 (Verweise).

- [ ] **Step 1: Failing test**: die feste Liste in `tests/skills.test.ts` um `storyboarding` ergaenzen; Test laeuft und scheitert, weil die Datei fehlt.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL (`npm test -- tests/skills.test.ts`).
- [ ] **Step 3: SKILL.md schreiben.** Inhalt bindend:
  - Ein Auftrag: "aus der abgenommenen Beat-Struktur eine Shotliste machen".
  - Shotliste 6 bis 18 Shots; je Shot: Nummer, Zweck, Bildinhalt, Quelle (`aufnehmen` | `finden` | `generieren`), Text (falls on-screen), Audio beziehungsweise Voiceover-Zeile, Dauer.
  - `Visuelles Thema`: Palette, Licht, Typografie, Motion, Do und Don't; wahlweise aus einer Style-Karte (`blocks/styles/<name>`), sonst frei.
  - `Freigaben`: drei Gates Story (Beats), Look (Visuelles Thema), Storyboard (Shotliste), je Status `offen` | `freigegeben` und Datum; bei kurzen Privatstuecken zusammengefasst erlaubt, bei Kundenarbeit alle drei Pflicht.
  - `Entscheidungen`: je Entscheidung hoechstens drei Zeilen (Entscheidung, Alternative, Grund).
  - Regeln: erfindet nichts, fragt fehlende Angaben ab; keine Prompt-Heuristiken ohne Beleg; Ergebnis nach `plan.md`.
  - `description`: englisch, beginnt "Use when", nennt nur den Ausloeser.
- [ ] **Step 4: Katalog erzeugen** (`npm --silent run catalog > docs/catalog.md`), Tests gruen, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: skill storyboarding mit gates`

### Task 2: Skill `planning/reference-analysis`

**Files:**
- Create: `skills/planning/reference-analysis/SKILL.md`
- Modify: `tests/skills.test.ts`, `docs/catalog.md`

**Interfaces:**
- Consumes: vorhandene Befehle `vz ingest`, `vz transcribe`, `vz segment`; Ergebnisdatei `reference.md`.

- [ ] **Step 1: Failing test**: Skill-Liste um `reference-analysis` ergaenzen; Test laeuft und scheitert.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: SKILL.md schreiben.** Inhalt bindend:
  - Ein Auftrag: "aus einem geliebten Referenzvideo einen belastbaren Brief machen".
  - Ablauf: Datei liegt lokal (kein Download, keine Weitergabe); Messung in einem Wegwerf-Projekt ueber `vz ingest`, `vz transcribe`, `vz segment` und `ffprobe`; gemessen werden Wortrate, Pausen, Schnittstruktur, Hook-Zeitpunkt.
  - Ergebnis `reference.md` im Zielprojekt: Messwerte, "das behalten / das aendern", zwei bis drei Konzepte mit Ein-Satz-Begruendung.
  - Ehrliche Grenze: Wortzeiten brauchen einen Transkript-Anbieter; das Whisper-Rezept ist nachgeschlagen, nicht gegengeprueft; ohne Anbieter bleibt nur die Pausen- und Strukturmessung.
- [ ] **Step 4: Katalog erzeugen**, Tests gruen, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: skill referenz-analyse`

### Task 3: Bausteine Scaffold und Style-Karten

**Files:**
- Create: `blocks/scaffolds/client-asset/plan.md`, `blocks/scaffolds/client-asset/project.json`
- Create: `blocks/styles/clean-tutorial/STYLE.md`, `blocks/styles/bold-short/STYLE.md`
- Modify: `blocks/index.json`, `tests/blocks.test.ts`

**Interfaces:**
- Produces: Eintraege `scaffold-client-asset` (`kind: "scaffold"`, `capability: "planning"`, entry `scaffolds/client-asset/plan.md`), `style-clean-tutorial` und `style-bold-short` (`kind: "style"`, `capability: "style"`, entry `styles/<name>/STYLE.md`).

- [ ] **Step 1: Failing tests** in `tests/blocks.test.ts`:
  - `loadBlock` findet die drei Eintraege; `checkIntegrity` bleibt leer.
  - Die Scaffold-`plan.md` traegt die Abschnitte Treatment, Visuelles Thema, Shotliste, Freigaben, Entscheidungen.
  - Die Scaffold-`project.json` ist gueltiges JSON mit den Pflichtfeldern aus `src/lib/types.ts` (`schema`, `id`, `title`, `format`, `language`, `sources`, `blocks`, `capabilities`, `delivery`); keine erfundenen Felder.
  - Jede `STYLE.md` traegt die Abschnitte Palette, Typografie, Motion, Grading, Regeln, Frame-Checkliste.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Dateien schreiben.** Treatment-Abschnitt mit Ausgangslage, Zielgruppe, Kernbotschaft, Ton, Referenzen, Anforderungen, Ausschluesse; Style-Karten selbst formuliert, Lizenz MIT; `blocks/index.json` um die drei Eintraege ergaenzen (`inputs: []`, `requires: { tools: [], providers: [] }`, `version: 1`, `license: "MIT"`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: bausteine scaffold und style-karten`

### Task 4: `vz review` mit Messnachschau

**Files:**
- Create: `src/lib/review.ts`, `src/commands/review.ts`
- Modify: `src/cli.ts` (Befehlsliste), `src/mcp/tools.ts` (Werkzeug `review`)
- Test: `tests/review.test.ts`, `tests/mcptools.test.ts`

**Interfaces:**
- Produces in `src/lib/review.ts`:
  - `interface ReviewMeasurements { duration: number; width: number; height: number; fps: number; hasAudio: boolean; blackRanges: Array<[number, number]>; freezeRanges: Array<[number, number]>; integratedLufs: number | null; captionsPresent: boolean; }`
  - `parseRanges(text: string, startKey: string, endKey: string): Array<[number, number]>` (tolerant; fuer `black_start/black_end` und `freeze_start/freeze_end`)
  - `parseLoudness(stderr: string): number | null` (sucht `I: <zahl> LUFS`)
  - `latestOutput(files: Array<{ name: string; mtimeMs: number }>): string | null` (neueste Datei, ignoriert `captions.ass` und `project.snapshot.json`)
  - `analyzeOutput(output: string, opts: { captionsExpected: boolean }, run: RunFn): Promise<ReviewMeasurements>`
  - `findingsFor(m: ReviewMeasurements, plannedDuration: number, masterLufs: number): string[]`
  - `renderReviewMarkdown(m: ReviewMeasurements, plannedDuration: number, masterLufs: number, findings: string[], date: string): string`
- Produces in `src/commands/review.ts`: `runReview(args: string[], deps?: { run?: RunFn; now?: () => Date }): Promise<number>`; Aufruf `videowizard review <ordner>`; Exit 2 bei Bedienfehler, Exit 1 bei Fehlern, sonst 0.
- MCP-Werkzeug `review` mit Pflichtfeld `dir`, argv `["review", dir]`.

- [ ] **Step 1: Failing tests** in `tests/review.test.ts`:
  - `parseRanges` liest echte `blackdetect`- und `freezedetect`-Zeilen und ueberspringt fremde Zeilen ohne zu werfen.
  - `parseLoudness` liest `I: -14.2 LUFS` und liefert `null` bei fehlender Zeile.
  - `latestOutput` waehlt die neueste Datei und ignoriert `captions.ass`/`project.snapshot.json`.
  - `analyzeOutput` mit eingehaktem `run` (ffprobe-Vorlage plus ffmpeg-Ausgaben mit Schwarz-, Standbild- und Lautheitszeilen) fuellt alle Felder.
  - `findingsFor` meldet Dauerabweichung ueber 0,5 s, Lautheit ausserhalb 1 LU, Schwarzfenster, fehlende Untertitel; `renderReviewMarkdown` traegt Messwerte, Toleranzen, Befunde und Datum.
  - `runReview` in leerem `out/`: Exit 1, Meldung nennt `out/`; ffprobe-Fehler: Exit 1; Erfolgsfall: Exit 0, `review.md` geschrieben.
  - `tests/mcptools.test.ts`: die Werkzeugliste enthaelt `review` (10 Werkzeuge), argv ist `["review", dir]`; fehlendes `dir` ergibt `isError`.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** `analyzeOutput` nutzt den vorhandenen `probe`-Wrapper und zwei ffmpeg-Laeufe (`-vf blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=2 -an -f null -` und `-af ebur128 -f null -`). Die erwartete Dauer kommt aus dem Renderplan: die Benutzung in `src/steps/render.ts` ablesen und dieselbe Funktion aus `src/lib/renderplan.ts` verwenden; `master_lufs` aus `project.audio` mit Vorgabe -14. `review.md` wird bewusst neu geschrieben (abgeleitetes Messprotokoll). Text in `review.md` Deutsch, Schwellen und Toleranzen ausgewiesen.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: vz review mit messnachschau`

### Task 5: Verdrahtung, Katalog, README

**Files:**
- Modify: `skills/planning/planning-short/SKILL.md`, `skills/producing/making-a-short/SKILL.md`, `skills/meta/using-videowizard/SKILL.md`, `README.md`
- Modify: `docs/catalog.md` (neu erzeugen)

**Interfaces:**
- Consumes: Skills aus Task 1/2, Befehl `vz review` aus Task 4.

- [ ] **Step 1: Tests zuerst**: nichts Neues erfinden; sicherstellen, dass `tests/skills.test.ts` und `tests/catalog.test.ts` weiterlaufen (Grundlauf notieren).
- [ ] **Step 2: Texte aktualisieren.**
  - `planning-short`: Abschnitt "Weiter" mit Verweis auf `storyboarding` (Beats sind die Eingabe der Shotliste).
  - `making-a-short`: Ablauf um Gates (Verweis auf `plan.md`-Abschnitt `Freigaben`) und als letzten Schritt `vz review <ordner>` ergaenzen; bei wiederkehrenden Befunden `vz learn`.
  - `using-videowizard`: Werkzeugliste um `review` ergaenzen (10 Werkzeuge), neue Planungs-Skills nennen.
- [ ] **Step 3: Katalog erzeugen** (`npm --silent run catalog > docs/catalog.md`); README: Etappe-6-Zeile auf "ist fertig" erst im Merge-Commit, hier nur den Befehl `vz review` bei den Befehlen ergaenzen, falls dort eine Liste steht.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `docs: verdrahtung und katalog fuer etappe 6`

## Selbstpruefung des Plans

- Spec 2.1/2.2/2.3 -> Task 1; Spec 3 -> Task 2; Spec 4.1/4.2 -> Task 3; Spec 5 -> Task 4; Spec 6 -> Task 5.
- Typen konsistent: `review` heisst ueberall `review`; `latestOutput` liefert einen Dateinamen.
- Jede Review-Focus-Zeile hat einen Test in der zustaendigen Aufgabe.
