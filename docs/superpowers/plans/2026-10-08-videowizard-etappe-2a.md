# VideoWizard Etappe 2a Implementation Plan: Render-Kern

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein vertikaler Short rendert aus echten Quellen: Ingest, Bloecke, Stimme, Musik, Schnitt und Encode. Kein Transkript noetig, die Bloecke werden geschrieben.

**Architecture:** Alles laeuft ueber den bestehenden Kern (CLI plus Provider). Ein neuer Faehigkeitsanbieter fuer Stimme (Voicebox) tritt neben Musik (ACE-Step). Der Render ist eine reine ffmpeg-Kette aus `project.json`; kein zweiter Motor, kein UI.

**Tech Stack:** TypeScript, Node 22, Vitest, ffmpeg als externer Prozess, Voicebox als lokaler HTTP-Dienst.

**Spec:** `docs/superpowers/specs/2026-10-08-videowizard-design.md`

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- `project.json` bleibt die einzige Wahrheit; jeder Schreibvorgang atomar (eindeutiger Temp-Name plus Rename, wie in Etappe 1).
- Nichts ohne Zustimmung: kein Ueberschreiben fertiger Videos, kein Upload, keine Installation ohne `--fix`.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen; Testausgabe ohne Rauschen.
- NodeNext: relative Importe mit `.js`-Endung.
- Provider sind austauschbar und werfen nie im Doctor: ein fehlender Dienst ist ein Zustand.
- Nur gemessene oder belegte Werte. Keine erfundenen Zahlen; woher ein Wert kommt, steht dabei.

## Review Focus

- Zwei Bloecke aus derselben Quelle duerfen sich nie ueberlappen; eine verschobene Grenze zieht die Nachbargrenze mit.
- Ein Block, dessen Stimme laenger ist als sein Bild: `overflow` muss den Lauf mit klarer Meldung stoppen, nicht stillschweigend kuerzen.
- Eine Stimmdatei ohne echte Wort-Timestamps: die Aufteilung auf Bloecke darf nicht so tun, als waere sie gemessen.
- Eine fehlende Musikdatei oder ein fehlendes Outro: `render` meldet klar und schreibt kein halbes Video.
- NVENC fehlt oder faellt aus: der Lauf weicht auf libx264 aus, ohne das Ergebnis zu verlieren.
- Zwei aufeinanderfolgende Renderlaeufe: der zweite ueberschreibt nie den ersten, sondern zaehlt hoch.

---

### Task 1: Blockmodell und Planoperationen

**Files:**
- Modify: `src/lib/types.ts` (`Block` mit echten Feldern), Create: `src/lib/plan.ts`
- Test: `tests/plan.test.ts`

**Interfaces:**
- Produces: `type Block` (`id`, `kind: 'take' | 'still'`, `source_id`, `chapter?`, `source_in`, `source_out`, `silences`, `text?`, `tts?`, `pause_after`, `fit`, `overlays`) und `addBlock(project, block)`, `moveBlock(project, id, index)`, `removeBlock(project, id)`, `placedBlocks(project)`.

- [ ] **Step 1: Failing tests**: Anlegen, Verschieben und Entfernen halten die Reihenfolge konsistent; ein unbekanntes `id` wirft; `placedBlocks` laesst `inbox`-IDs aus; die Typen verlangen die Pflichtfelder.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** `Block` in `src/lib/types.ts` von der offenen Form auf die echte Form bringen; Operationen in `src/lib/plan.ts`. Reine Funktionen, die das Projekt mutieren und zurueckgeben.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: blockmodell und planoperationen`

### Task 2: Sync-Logik (fit)

**Files:**
- Create: `src/lib/fit.ts`, Test: `tests/fit.test.ts`

**Interfaces:**
- Produces: `computeFit(block, ttsDuration): FitResult` mit `fit: 'trim' | 'hold' | 'overflow' | 'none'`, `ratio`, `cuts`, `effectiveOut`, `speed`, `freeze`, `targetDuration`; Konstanten `TAIL_GUARD = 0.15`, `MIN_SPEED = 0.9`, `OVERFLOW_LIMIT = 1.25`.

- [ ] **Step 1: Failing tests** nach den bewaehrten Regeln: `ratio < 1` kuerzt zuerst die laengste Pause, dann hinten, die letzten 0,15 s bleiben; `1 <= ratio <= 1.25` verlangsamt bis hoechstens 0,9 und haelt den Rest; `ratio > 1.25` ergibt `overflow` ohne Notbehelf; `still` folgt immer der Stimme.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** als reine Funktion ohne Dateizugriff. Werte und Verhalten stammen aus der VideoPipeline und sind dort am echten Material gemessen.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: sync-logik fuer bild und stimme`

### Task 3: ffmpeg-Wrapper und Ingest

**Files:**
- Create: `src/lib/ffmpeg.ts`, `src/steps/ingest.ts`, Test: `tests/ffmpeg.test.ts`, `tests/ingest.test.ts`

**Interfaces:**
- Produces: `runFfmpeg(args): Promise<string>`, `probe(file): Promise<{ width, height, fps, duration, codec, hasAudio }>`, `ingest(projectDir, videoPath, label, deps?): Promise<Source>` (Format pruefen und einmalig normalisieren, Ton als WAV, Standbilder, Pruefsumme).

- [ ] **Step 1: Failing tests**: `probe` liest echte ffprobe-Ausgabe (Fixture-String); eine Quelle mit abweichendem Format wird auf das Projektformat gebracht und `normalized: true` gesetzt; die erste Quelle **setzt** das Projektformat; die Pruefsumme ist stabil; `ingest` ruft ffmpeg ueber ein eingehakbares `run` (Test ohne echtes ffmpeg).
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** `run` und `probe` ueber `child_process` mit injizierbarer Fassung. Beim Ingest Ton als 48 kHz mono WAV, Standbilder alle 10 s, keine erfundenen Nebendateien.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: ffmpeg-wrapper und ingest`

### Task 4: Sprach-Provider Voicebox

**Files:**
- Create: `src/lib/providers/voice.ts`, `src/lib/providers/voicebox.ts`, Test: `tests/voiceprovider.test.ts`

**Interfaces:**
- Produces: `type VoiceProvider` (`id`, `detect()`, `speak(text, opts): Promise<{ audio: Buffer; alignment: Alignment | null }>`), `voiceboxProvider(cfg, deps?): VoiceProvider`, `resolveVoiceProvider(project, deps?): VoiceProvider`.
- Verbraucht: `Alignment` (Zeichenzeiten) in `src/lib/providers/voice.ts` definiert.

- [ ] **Step 1: Failing tests**: `detect()` fragt `GET /health` und wirft nie; `speak` spricht `POST /generate`, wartet ueber `GET /generate/{id}/status`, holt `GET /audio/{id}`; ein fehlendes Profil wirft mit dem Namen; **liefert der Dienst keine Zeitstempel, ist `alignment` `null`** (nicht geschaetzt, siehe Entscheidungen); `resolveVoiceProvider` wirft bei unbekanntem Anbieter.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** mit eingehakbarem `fetch` und `sleep`. Die Bruecke aus der VideoPipeline ist die Vorlage; der Unterschied: fehlende Zeitstempel werden nicht mehr gleichmaessig verteilt, sondern als `null` gemeldet (siehe Entscheidungen).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: sprach-provider voicebox`

### Task 5: Renderplan und Render

**Files:**
- Create: `src/lib/renderplan.ts`, `src/steps/render.ts`, `src/lib/ffargs.ts`
- Test: `tests/renderplan.test.ts`, `tests/ffargs.test.ts`, `tests/render.test.ts`

**Interfaces:**
- Produces: `buildRenderPlan(project, opts?): RenderPlan` (`format`, `video[]`, `audio[]`, `music`, `outro`, `warnings`), `segmentFilter(segment, fps, size)`, `voiceFilter(audio)`, `musicMixFilter(opts)`, `outroFilter(mainDuration, crossfade)`, `renderProject(projectDir, opts?): Promise<string>`.
- Verbraucht: `computeFit` (Task 2), `Block` (Task 1), `Source` (Task 3).

- [ ] **Step 1: Failing tests**: der Plan uebersetzt Schnitte in verbleibende Bereiche; `overflow` wirft ohne `allowOverflow`; `still` folgt der Stimme; die Filtergraphen enthalten die bewaehrten Werte (`loudnorm=I=-16:TP=-1.5:LRA=11` fuer Stimme, `sidechaincompress` fuer Ducking, `loudnorm=I=-14` fuer die Mischung); `renderProject` zaehlt die Ausgabedatei hoch und ueberschreibt nie; fehlende Musikdatei meldet klar.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Alles ueber ein eingehakbares `run`; Encode mit NVENC und Rueckfall auf libx264. Der Baustein `ffmpeg-loudnorm` ist die Quelle der Pegelwerte.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: renderplan und ffmpeg-render`

### Task 6: CLI-Befehle und Status

**Files:**
- Create: `src/commands/ingest.ts`, `src/commands/voice.ts`, `src/commands/render.ts`
- Modify: `src/cli.ts`, `src/commands/status.ts`
- Test: `tests/cli.test.ts` erweitern, `tests/commands.test.ts`

**Interfaces:**
- Consumes: `ingest`, `resolveVoiceProvider`, `renderProject`, `statusesOf`
- Produces: `vz ingest <ordner> <video> [--label]`, `vz voice <ordner>`, `vz render <ordner> [--allow-overflow]`; `status` zeigt Bloecke mit Zustand.

- [ ] **Step 1: Failing tests**: jeder Befehl erscheint in `help` (eine Quelle); ein unbekannter Befehl bleibt bei Code 2; `voice` vertont nur Bloecke mit veraltetem oder fehlendem Ton; `render` verweigert `overflow` ohne Schalter und meldet die Bloecke; `status` nennt offene Bloecke.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren** nach dem Muster von `status` (Befehlsobjekt, kein `process.exit`).
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: cli fuer ingest, voice und render`

### Task 7: Doctor verdrahtet echte Diensterkennung

**Files:**
- Modify: `src/lib/capabilities.ts`, `src/commands/doctor.ts`
- Test: `tests/doctor.test.ts` erweitern

**Interfaces:**
- Consumes: `VoiceProvider.detect()`, `MusicProvider.detect()`
- Produces: `detect()` fragt fuer Dienst-Anbieter die echte `detect()` des Providers ab; das Ergebnis unterscheidet "vorhanden (Dienst)" von "vorhanden (Programm)".

- [ ] **Step 1: Failing tests**: ein Dienst-Anbieter mit erreichbarem `/health` meldet `present`; ohne Dienst meldet er `manual` (bzw. `auto-installable`, wenn das Programm fehlt), nie eine Ausnahme; reine Programm-Anbieter (ffmpeg) bleiben wie bisher.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.** Die Provider-`detect()` wird eingehakt, damit der Test ohne Dienste laeuft. Das ist die im Ledger angekuendigte Verdrahtung.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: doctor fragt die echte diensterkennung`

### Task 8: Skills und Katalog auf den echten Stand

**Files:**
- Modify: `skills/producing/making-a-short/SKILL.md`, `skills/tools/tool-ffmpeg/SKILL.md`
- Create: `skills/tools/tool-voicebox/SKILL.md`
- Modify: `docs/catalog.md` (neu erzeugt)
- Test: bestehende `tests/skills.test.ts` und `tests/catalog.test.ts`

**Interfaces:**
- Consumes: die Befehle aus Task 6, den Provider aus Task 4.

- [ ] **Step 1: Tests zuerst anpassen**: der Katalog-Test verlangt den neuen Skill; der Skill-Test greift automatisch.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL (neuer Skill fehlt noch).
- [ ] **Step 3: Schreiben.** `making-a-short` nennt jetzt die echten Befehle (`vz ingest`, `vz voice`, `vz render`) und streicht den Satz "Render kommt in Etappe 2". `tool-voicebox` bekommt die fuenf Abschnitte. `tool-ffmpeg` verweist auf den Render-Weg. Katalog neu erzeugen und einchecken.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `docs: skills und katalog auf dem stand von etappe 2a`

## Entscheidungen fuer diese Etappe

- **Keine erfundenen Zeitstempel.** Liefert ein Sprachdienst keine echten Zeichenzeiten, ist `alignment` `null`. Die VideoPipeline verteilte die Dauer gleichmaessig ueber die Zeichen und tat damit so, als waere gemessen; das wird hier bewusst nicht wiederholt. Folge: exakte Schnitte brauchen ein Kapitel je Block. Kosten falls falsch: Schnittgrenzen muessen anders ermittelt werden.
- **Reihenfolge:** Render-Kern vor Transkript. Ohne Transkript sind die Bloecke handgeschrieben, der Render ist trotzdem echt erprobbar.
- **Ein Outro ist optional:** fehlt die Datei, rendert der Lauf ohne Outro und sagt das.

## Nicht in dieser Etappe

- **Transkript und Segmentierung** (faster-whisper, Bloecke aus Woertern und Pausen). Eigener Plan Etappe 2b.
- **Captions.** Brauchen Wort-Timestamps und damit 2b.
- **MCP und Harnisch-Huellen.** Etappe 4.
- **Weitere Provider** (Chatterbox, Cavalry, After Effects, Remotion). Etappe 3.
