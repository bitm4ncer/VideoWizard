# VideoWizard Etappe 8 Implementation Plan: Abschluss (Fit-treuer Handoff und Restpolitur)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Hand-off auf das Niveau des eigenen Renderers bringen (Fit-Schnitte, Haltebilder, Captions auf der Ausgangsachse), Audio/Captions/Stills live in Diffusion Studio verifizieren, die kleinen offenen Punkte schliessen, README auf Wahrheit bringen.

**Architecture:** Erweiterung von `src/lib/handoff.ts`; die vorhandene Sync-Logik (`src/lib/fit.ts`) und die Caption-Abbildung des Renderers werden wiederverwendet, nicht nachgebaut. Verifikation ueber die laufende DS-App (MCP). Keine Schemaaenderung, keine neue Abhaengigkeit.

**Tech Stack:** TypeScript/Node 22, Vitest, ffmpeg-Wrapper.

**Spec:** `docs/superpowers/plans/2026-10-09-videowizard-etappe-7.md` plus `docs/research/2026-10-09-diffusion-studio-spike.md`; Etappe-8-Punkte stammen aus der Etappe-7-Schlusspruefung.

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends; Kommentare Deutsch, Bezeichner Englisch, NodeNext `.js`; kein `process.exit` in der Logik.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen; keine neue Abhaengigkeit, keine Schemaaenderung.
- Kein Ueberschreiben ohne Zustimmung bleibt; Schutzguards aus Etappe 7 unveraendert.
- DS-JSX nur nach installierter Doku (`app-0.210.0\resources\docs`), nichts erfinden.

## Review Focus

- Fit `trim` mit mehreren behaltenen Bereichen: Szene zeigt dieselben Bildbereiche wie `vz render`, Dauer = Ziel-Dauer, Captions auf der Ausgangsachse.
- Fit `hold`: Haltebilder als extrahierte Frames, kein springendes Bild.
- Wortzeiten, die ueber Schnitte laufen: keine Caption zeigt ueber einen entfernten Bereich.
- Live-Fixture mit Audio und Captions: `check` ohne Befund, Capture zeigt Untertitel.
- README sagt die Wahrheit ueber den Etappenstand.

---

### Task 1: Fit-treuer Handoff

**Files:**
- Modify: `src/lib/handoff.ts`, `tests/handoff.test.ts`

**Interfaces:**
- Consumes: `src/lib/fit.ts` (`computeFit` und die Bereichsfunktion, z. B. `remainingRanges`), Caption-Abbildung des Renderers (`mapWordsToOutput`/`toCues`, in `src/lib/renderplan.ts` bzw. `src/lib/captions.ts` nachsehen), vorhandene Frame-Extraktion und `renderHandoff`/`buildIndexTsx` aus Etappe 7.
- Produces: `buildIndexTsx` erzeugt fuer `take`-Bloecke mit Fit eine `<sequence>` aus stummen, getrimmten `<video>`-Kindern gemaess den behaltenen Bereichen (expliziter `start` je Kind, wie die DS-Doku es verlangt); Szenendauer = Ziel-Dauer aus der Sync-Logik; `hold`-Anteile als extrahierte Frames (`<image>`); Captions je Block auf der Ausgangsachse.

- [ ] **Step 1: Failing tests** in `tests/handoff.test.ts`:
  - `trim` mit zwei behaltenen Bereichen: Szene enthaelt zwei `<video>`-Kinder mit den exakten `sourceIn/sourceOut` und `start`-Werten; Szenendauer = `tts.duration + pause_after`.
  - `hold`: das Haltebild erscheint als `<image>` am richtigen Zeitpunkt; Frame-Extraktion eingehakt.
  - Caption-Abbildung: Woerter ueber einer geschnittenen Pause erzeugen zwei getrennte Cues, keiner ueberdeckt den entfernten Bereich.
  - `overflow`: Verhalten dokumentiert und getestet (Bildfenster wie bisher, Warnung).
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** durch Wiederverwendung der Renderer-Funktionen; README im Handoff-Ordner aktualisieren (Fit jetzt uebernommen; was weiterhin nicht: Musik, Outro, Overlays).
- [ ] **Step 4: Tests**, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: fit-treuer handoff`

### Task 2: Live-Verifikation mit reichem Fixture (Verifikation)

**Files:** keine im Repo (Fixture im Temp; Ergebnis ins Ledger)

- [ ] **Step 1:** Fixture mit einem `take` mit Fit-`trim`, einem `still`, einer TTS-Datei (per ffmpeg erzeugter Ton oder Voicebox-Ausgabe) und Wortzeiten; `vz handoff` ausfuehren.
- [ ] **Step 2:** In der laufenden DS-App oeffnen; `check` auf beide Szenen; `capture` auf kritische Zeitpunkte (Caption sichtbar, Haltebild); `waveform` fuer die Tonspur.
- [ ] **Step 3:** Ergebnis ins Ledger: verifiziert / nicht verifiziert, Befunde als Fix oder geduldeter Minor.

### Task 3: Restpolitur

**Files:**
- Modify: `src/lib/learnings.ts` oder `src/commands/learn.ts` (lokales Datum, leerer Slug), `tests/learnings.test.ts`, `tests/commandslearn.test.ts`, `blocks/scaffolds/client-asset/plan.md`, `tests/blocks.test.ts`, `README.md`

- [ ] **Step 1: Failing tests**: (a) `vz learn` mit reiner Zeichensetzung als Titel ist ein Bedienfehler (Exit 2), kein Junk-File; (b) Datum kommt lokal (Test mit fester Zeitzone oder hereingereichtem `now`), nicht UTC; (c) Scaffold-`plan.md` traegt Ort und Termin (oder offenen Punkt) fuer `aufnehmen`-Shots.
- [ ] **Step 2: Implementieren.** Datum als gemeinsamer Helfer (auch `ingest` nutzt ihn, dort mit testen); README: Etappenstand auf "Etappe 8 ist fertig" bzw. vollstaendige Liste, falls dort eine Statuszeile steht.
- [ ] **Step 3: Tests**, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 4: Commit** `fix: abschlusspolitur (learn-datum, slug, scaffold, readme)`

## Entscheidungen

- Fit wird aus den vorhandenen Sync-Funktionen abgeleitet, nicht neu implementiert.
- `hold` als extrahiertes `<image>`; `overflow` bleibt Bildfenster wie bisher, dokumentiert.
- Die Schlussglocke: nach Etappe 8 gibt es keinen offenen Etappenpunkt; Restledger-Minors werden bewusst abgeschlossen oder als "geduldet" benannt.
