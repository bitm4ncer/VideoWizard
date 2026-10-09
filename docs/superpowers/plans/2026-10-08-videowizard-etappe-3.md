# VideoWizard Etappe 3 Implementation Plan: Zweite Anbieter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Je Faehigkeit ein zweiter Anbieter, austauschbar ohne Workflow-Aenderung: Stimme und Musik auch ueber ElevenLabs. Dazu der fehlende `vz music`-Befehl, mit dem Musik ueberhaupt erst in ein Projekt kommt.

**Architecture:** Keine neuen Motoren. Zwei weitere Provider hinter den bestehenden Vertraegen (`VoiceProvider`, `MusicProvider`), ein kleines Geheimnismodul fuer Schluessel, ein Befehl, und der Doctor lernt, mehrere Anbieter je Faehigkeit zu bewerten. Die Skills bleiben unveraendert in ihrer Struktur.

**Tech Stack:** TypeScript, Node 22, Vitest, ElevenLabs REST (Text to Speech mit Zeitstempeln, Music).

**Spec:** `docs/superpowers/specs/2026-10-08-videowizard-design.md`

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- Schluessel werden **nie** ausgegeben, protokolliert oder in eine Datei geschrieben, auch nicht gekuerzt.
- `project.json` bleibt die einzige Wahrheit, Schreibvorgaenge atomar.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen.
- NodeNext: relative Importe mit `.js`-Endung.
- Nur belegte Werte: Endpunkte und Felder stammen aus der VideoPipeline (`src/lib/elevenlabs.ts`), nichts erfinden.
- Bezahlte Aufrufe nur nach ausdruecklicher Zustimmung.

## Review Focus

- Ein fehlender Schluessel: klare Meldung, kein Absturz, kein Schluessel im Text, Doctor sagt `Schluessel noetig`.
- Ein Anbieterwechsel in `capabilities` aendert nur die Wahl, nie den Workflow: `vz voice` und `vz music` sehen keinen Unterschied.
- Zwei Anbieter fuer dieselbe Faehigkeit im Doctor: trotzdem genau eine Zeile je Faehigkeit, mit nachvollziehbarem Zustand.
- Musik ohne `--yes` bei einem bezahlten Anbieter: keine Ausgabe, sondern die Kostenmeldung.
- Eine vorhandene Musikdatei im Projekt: `vz music <datei>` ersetzt sie und nennt die alte, statt sie still zu verlieren.
- Echte Zeitstempel von ElevenLabs: sie ersetzen `null` und werden nicht umgerechnet.

---

### Task 1: Geheimnisse

**Files:**
- Create: `src/lib/secrets.ts`
- Test: `tests/secrets.test.ts`

**Interfaces:**
- Produces: `export interface SecretSource { env?: string; file?: string }`, `resolveSecret(source: SecretSource, deps?): Promise<string | null>`.

- [ ] **Step 1: Failing tests**: nimmt den Wert aus der Umgebung, wenn gesetzt; sonst aus der Datei (Pfad absolut oder relativ zum Projekt), dabei wird ein `NAME=`-Praefix und umgebende Anfuehrungszeichen abgestreift; sonst `null`; der Wert taucht in keiner Fehlermeldung auf.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** (Muster aus `C:\GitHub\VideoPipeline\src\lib\brand.ts`, `readKeyFile`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: geheimnisse aus umgebung oder datei`

### Task 2: ElevenLabs als Sprach-Provider

**Files:**
- Create: `src/lib/providers/elevenlabs.ts`
- Modify: `src/lib/providers/voice.ts` (zweiter Anbieter in der Registry)
- Test: `tests/elevenlabsvoice.test.ts`

**Interfaces:**
- Produces: `elevenlabsVoiceProvider(cfg: ElevenLabsVoiceOptions, deps?): VoiceProvider` mit `ElevenLabsVoiceOptions { voice_id: string; model?: string; stability?: number; similarity_boost?: number; speed?: number; secret: SecretSource }`.

- [ ] **Step 1: Failing tests**: `detect()` ist wahr, wenn ein Schluessel da ist, sonst falsch, und wirft nie; `speak` spricht `POST /v1/text-to-speech/{voice_id}/with-timestamps`, liest `audio_base64` und `alignment` und gibt **echte** Zeichenzeiten zurueck (kein `null`, keine Umrechnung); ein fehlender Schluessel wirft mit dem Namen der Umgebungsvariable, **ohne** den Wert; `resolveVoiceProvider` kennt jetzt `voicebox` und `elevenlabs` und nennt bei unbekanntem Namen beide.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach `C:\GitHub\VideoPipeline\src\lib\elevenlabs.ts` (`textToSpeechWithTimestamps`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: elevenlabs als sprach-provider`

### Task 3: ElevenLabs als Musik-Provider

**Files:**
- Create: `src/lib/providers/elevenlabs_music.ts`
- Modify: `src/lib/providers/music.ts` (zweiter Anbieter in der Registry)
- Test: `tests/elevenlabsmusic.test.ts`

**Interfaces:**
- Produces: `elevenlabsMusicProvider(cfg: ElevenLabsMusicOptions, deps?): MusicProvider` mit `ElevenLabsMusicOptions { model?: string; secret: SecretSource }`, `secondsToLengthMs` nicht noetig; `detect()` prueft den Schluessel; `generate(req)` liefert die Audiodaten.

- [ ] **Step 1: Failing tests**: `detect()` wahr mit Schluessel, falsch ohne, wirft nie; `generate` spricht `POST /v1/music` mit `prompt` und `music_length_ms` und liefert den Buffer; ein fehlender Schluessel wirft klar; `resolveMusicProvider` kennt `acestep` und `elevenlabs`.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach `C:\GitHub\VideoPipeline\src\lib\elevenlabs.ts` (`composeMusic`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: elevenlabs als musik-provider`

### Task 4: `vz music`

**Files:**
- Create: `src/commands/music.ts`
- Modify: `src/cli.ts`
- Test: `tests/commandsmusic.test.ts`

**Interfaces:**
- Produces: `vz music <ordner> generate [--seconds N] [--yes]` und `vz music <ordner> <datei>`.

- [ ] **Step 1: Failing tests**: `vz music <datei>` kopiert die Datei nach `audio/music.<endung>`, traegt `audio.music` mit `gain_db`/`duck_db` aus den Vorgaben ein und nennt eine vorhandene Musik vorher; `generate` fragt ohne `--yes` nach der Zustimmung (Code 1, keine Ausgabe), mit `--yes` schreibt es die Datei ueber den eingehakten Provider und traegt sie ein; ohne Faehigkeit oder ohne Audio-Block wirft es klar; der Befehl steht in `help`.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** mit eingehakten Providern, nach dem Muster der bestehenden Befehle.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: cli fuer musik`

### Task 5: Doctor bewertet mehrere Anbieter

**Files:**
- Modify: `src/lib/capabilities.ts`
- Test: `tests/doctor.test.ts`

- [ ] **Step 1: Failing tests**: `voice` fuehrt zwei Anbieter (`voicebox` Dienst, `elevenlabs` Schluessel) und meldet trotzdem genau eine Zeile; der beste erreichbare Zustand gewinnt in der Reihenfolge `vorhanden` vor `automatisch installierbar` vor `nur von Hand` vor `Schluessel noetig`, und die Zeile nennt den Anbieter, auf den sie sich bezieht; `music` fuehrt zwei Anbieter; ein werfender Detect aendert nichts daran.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Das ist die im Ledger vorgemerkte Klaerung des Zustands-Vorrangs bei gemischten Anbietern.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: doctor bewertet mehrere anbieter`

### Task 6: Skills und Katalog

**Files:**
- Create: `skills/tools/tool-elevenlabs/SKILL.md`
- Modify: `skills/producing/making-a-short/SKILL.md`, `skills/tools/tool-ace-step/SKILL.md`, `docs/catalog.md`
- Test: `tests/skills.test.ts`, `tests/catalog.test.ts`

- [ ] **Step 1: Tests zuerst**: die feste Skill-Liste um `tool-elevenlabs` ergaenzen; erwartet FAIL.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Schreiben.** `tool-elevenlabs` mit fuenf Abschnitten (Schluessel ueber Umgebung oder Datei, nie im Klartext). `making-a-short` bekommt den Musik-Schritt (`vz music`). `tool-ace-step` verliert den Satz, dass es kein `vz music` gibt. Katalog erzeugen.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `docs: skills und katalog auf dem stand von etappe 3`

## Entscheidungen fuer diese Etappe

- **ElevenLabs statt Chatterbox als zweiter Sprach-Provider.** Elf hat eine belegte API mit echten Zeichenzeiten und einen `with-timestamps`-Endpunkt in der VideoPipeline; Chatterbox braeuchte erst ein lokales Server-Rezept. Der Zweck der Etappe (Austauschbarkeit) ist damit erreicht.
- **Schluessel ueber `SecretSource`** (`env`, optional `file`), nie im Projekt. Der Doctor kennt den Zustand `Schluessel noetig`.
- **`vz music` bekommt zwei Formen:** eine vorhandene Datei uebernehmen oder erzeugen. Erzeugen nur mit `--yes`.

## Nicht in dieser Etappe

- MCP und Harness-Huellen (Etappe 4).
- Improvement Loop (Etappe 5).
- Cavalry, After Effects, Remotion als Bausteine: das sind eigene Zulieferer und brauchen je ein eigenes Rezept; sie kommen nach Etappe 4.
