# VideoWizard Etappe 2b Implementation Plan: Aus der Aufnahme

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus einer Aufnahme entstehen Bloecke und Captions: transkribieren, Pausen erkennen, segmentieren, untertiteln. Damit rendert ein Short ohne von Hand geschriebene Bloecke.

**Architecture:** Zwei neue Faehigkeiten-Anbieter (Transkript) und zwei reine Rechenmodule (Pausen, Segmentierung) neben dem bestehenden Kern. Captions laufen als ffmpeg-Baustein ueber die vorhandenen Wort-Zeitstempel. Kein zweiter Motor.

**Tech Stack:** TypeScript, Node 22, Vitest, ffmpeg (`silencedetect`, `subtitles`), whisper-ctranslate2 als empfohlenes lokales Rezept.

**Spec:** `docs/superpowers/specs/2026-10-08-videowizard-design.md`

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- `project.json` bleibt die einzige Wahrheit, Schreibvorgaenge atomar.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen; Testausgabe ohne Rauschen.
- NodeNext: relative Importe mit `.js`-Endung.
- Nur belegte Werte. Wo ein Wert aus der VideoPipeline stammt, steht das dabei; wo ein Rezept nicht gegengeprueft ist, steht das ebenfalls dabei.
- Keine erfundenen Zeitstempel: wo es keine echten Wortzeiten gibt, gibt es keine.

## Review Focus

- Eine Quelle ohne `words.json` oder ohne `silences.json`: die Befehle melden klar, statt zu raten.
- Worte und Pausen, die sich widersprechen (Wort in einer Pause): die Segmentierung darf nicht werfen und keine Grenze mitten ins Wort legen.
- Zwei Bloecke mit derselben Kennung: das muss auffallen, bevor Dateien einander ueberschreiben.
- Eine verschobene oder getauschte Quelldatei: der Render bricht mit klarer Meldung ab, nicht mit falschem Bild.
- Captions mit Sonderzeichen (`:`, `'`, Umgebungen mit Leerzeichen): die Untertiteldatei darf den ffmpeg-Lauf nicht zerreissen.
- Ein Projekt ohne Woerter: `--captions` meldet klar und rendert ohne Untertitel, statt zu sterben.

---

### Task 1: Transkript-Provider und Whisper-Rezept

**Files:**
- Create: `src/lib/providers/transcript.ts`, `src/lib/providers/whisper.ts`
- Test: `tests/transcriptprovider.test.ts`

**Interfaces:**
- Produces: `export interface TranscriptWord { start: number; end: number; text: string }`, `export interface TranscriptProvider { id: string; detect(): Promise<boolean>; transcribe(audioFile: string): Promise<TranscriptWord[]> }`, `export interface WhisperOptions { command: string[] }`, `whisperProvider(cfg, deps?): TranscriptProvider`, `resolveTranscriptProvider(project, deps?): TranscriptProvider`, `parseWhisperJson(raw: string): TranscriptWord[]`.

- [ ] **Step 1: Failing tests**: `parseWhisperJson` liest die openai-Whisper-Form (`{ segments: [{ words: [{ word, start, end }] }] }`) und gibt die Woerter in Reihenfolge zurueck (getrimmt); ein Segment ohne `words` faellt auf seine eigene Zeitspanne zurueck (ein Eintrag, Segmenttext); leeres Ergebnis wirft mit klarer Meldung; `detect()` prueft das erste Kommando-Wort ueber `--help` und wirft nie; `transcribe` ersetzt `{input}` und `{outdir}` in der Kommando-Vorlage, liest die entstehende JSON-Datei und wirft, wenn sie fehlt; `resolveTranscriptProvider` wirft bei unbekanntem Anbieter und nennt die bekannten.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** mit eingehakbarem `run` (Muster `probe` in `src/lib/ffmpeg.ts`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: transkript-provider mit whisper-rezept`

### Task 2: Pausen und Segmentierung

**Files:**
- Create: `src/lib/silence.ts`, `src/lib/segment.ts`
- Test: `tests/silence.test.ts`, `tests/segment.test.ts`

**Interfaces:**
- Produces: `parseSilences(log: string): Array<[number, number]>`, `detectSilences(audioFile, deps?): Promise<Array<[number, number]>>`, `buildBlocks(words: TranscriptWord[], silences: Array<[number, number]>, opts?): Block[]`, `nextBlockId(existing: string[]): string`.
- Verbraucht: `TranscriptWord` (Task 1), `Block` (Etappe 2a).

- [ ] **Step 1: Failing tests**: `parseSilences` liest `silence_start`/`silence_end` aus der ffmpeg-Ausgabe und vertraegt Zeilen ohne Paar; `buildBlocks` setzt Grenzen bevorzugt an Pausen ab 0,6 s, haelt 3 bis 25 s ein, markiert Kapitel bei Pausen ab 1,5 s, erzeugt lueckenlose `source_in`/`source_out` und fortlaufende Kennungen; ein Wort, das in einer Pause liegt, wirft nicht; ohne Pausen wird am Satzende oder hart bei 25 s geschnitten (`flags`).
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** als reine Funktionen. Werte und Regeln stammen aus der VideoPipeline und stehen im Brief.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: pausen und segmentierung`

### Task 3: CLI transcribe und segment, Kennungsschutz, Status

**Files:**
- Create: `src/commands/transcribe.ts`, `src/commands/segment.ts`
- Modify: `src/cli.ts`, `src/commands/status.ts`, `src/lib/plan.ts` (doppelte Kennung abweisen), `src/lib/providers/voicebox.ts` (Werte trimmen)
- Test: `tests/commands.test.ts`, `tests/plan.test.ts`, `tests/commandstranscribe.test.ts`

- [ ] **Step 1: Failing tests**: `vz transcribe <ordner> <quelle>` schreibt `sources/<id>/words.json` und `silences.json`; `vz segment <ordner> <quelle>` haengt Bloecke hinten an und wirft, wenn `words.json` fehlt; `addBlock` weist eine doppelte Kennung ab; `status` meldet einen Block als `veraltet`, dessen `tts.hash` nicht mehr zum Text passt.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach dem Muster der bestehenden Befehle, mit eingehakten Providern.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: cli fuer transkript und segmentierung`

### Task 4: Captions als Baustein

**Files:**
- Create: `src/lib/captions.ts`, `blocks/ffmpeg/captions/recipe.md`
- Modify: `src/lib/renderplan.ts` (Wortzeiten auf die Ausgabeachse legen), `src/steps/render.ts` (brennen), `src/commands/render.ts` (`--captions`), `blocks/index.json`
- Test: `tests/captions.test.ts`, `tests/render.test.ts`, `tests/renderplan.test.ts`

**Interfaces:**
- Produces: `buildAss(cues, opts?): string` mit `Cue { start: number; end: number; text: string }`, `toCues(words, offset, options): Cue[]`.

- [ ] **Step 1: Failing tests**: `toCues` fasst Woerter zu Zeilen (hoechstens rund 32 Zeichen und rund 2 s je Zeile) und verschiebt sie um den Blockversatz; `buildAss` erzeugt Kopf, Stil und Ereignisse mit `h:mm:ss.cc`-Zeiten und maskiert `{`/`}`; der Renderplan liefert fuer einen Block mit Woertern die Cues, fuer einen ohne keine; `vz render --captions` ohne Woerter meldet und rendert ohne Untertitel; mit Woertern enthaelt der ffmpeg-Aufruf den `subtitles`-Filter und den ASS-Pfad.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** (ASS-Bau, Cue-Abbildung, Brennen). Pfad im Filter wie in der VideoPipeline maskieren.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: captions als baustein und im render`

### Task 5: Quell-Pruefsumme vor dem Render

**Files:**
- Modify: `src/steps/ingest.ts` (Pruefsumme als Funktion exportieren), `src/steps/render.ts` (vor dem Plan pruefen)
- Test: `tests/render.test.ts`, `tests/ingest.test.ts`

- [ ] **Step 1: Failing tests**: eine getauschte oder geaenderte Quelldatei laesst `render` mit klarer Meldung und Quellenkennung abbrechen, bevor ffmpeg laeuft; eine unveraenderte Quelle rendert wie bisher.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Die vorhandene Pruefsummenrechnung aus Task 3 der Etappe 2a wiederverwenden, nicht nachbauen.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: render prueft die quellen`

### Task 6: Doctor kennt die Transkript-Faehigkeit

**Files:**
- Modify: `src/lib/capabilities.ts`, `src/commands/doctor.ts`
- Test: `tests/doctor.test.ts`

- [ ] **Step 1: Failing tests**: die Faehigkeit `transcript` erscheint im Bericht; ist das Whisper-Kommando da, `vorhanden (Programm: whisper)`; sonst `automatisch installierbar (whisper)`; ein werfender Detect macht den Doctor nicht kaputt.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach dem Muster der bestehenden Programm-Anbieter.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: doctor kennt transkript`

### Task 7: Skills und Katalog

**Files:**
- Create: `skills/tools/tool-whisper/SKILL.md`
- Modify: `skills/producing/making-a-short/SKILL.md`, `skills/planning/planning-short/SKILL.md`, `docs/catalog.md`
- Test: `tests/skills.test.ts`, `tests/catalog.test.ts`

- [ ] **Step 1: Tests zuerst**: die feste Skill-Liste im Skill-Test um `tool-whisper` ergaenzen; erwartet FAIL.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Schreiben.** `making-a-short` nennt jetzt `vz transcribe`, `vz segment` und `--captions`; `planning-short` sagt, dass 2b da ist; `tool-whisper` mit fuenf Abschnitten und dem Rezept `whisper-ctranslate2`, ausdruecklich als **nachgeschlagen, nicht gegengeprueft** markiert. Katalog erzeugen.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `docs: skills und katalog auf dem stand von etappe 2b`

## Entscheidungen fuer diese Etappe

- **Captions ueber ffmpeg** (ASS-Datei, `subtitles`-Filter), nicht Remotion. Es gibt Wort-Zeitstempel und keinen Overlay-Bedarf; das ist der kleinste ehrliche Weg. Remotion bleibt fuer Karten und bewegte Einblendungen.
- **Kein `inbox`.** Neue Quellen haengen ihre Bloecke hinten an; Umsortieren ist Sache des Nutzers (oder einer spaeteren Etappe).
- **`--captions` ist ein Render-Schalter**, kein Projektschema. Fehlen Woerter, wird gewarnt und ohne Untertitel gerendert.

## Nicht in dieser Etappe

- MCP und Harness-Huellen (Etappe 4).
- Weitere Provider (Chatterbox, Cavalry, After Effects, Remotion) und der Improvement Loop (Etappe 3/5).
- Eine Oberflaeche. Es bleibt die CLI.
