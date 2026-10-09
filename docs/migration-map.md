# Migrationskarte: VideoPipeline nach VideoWizard

*Stand: 10.10.2026. Handgepflegt, kein Generator; der Test prueft nur, dass die
genannten Befehle und Skills existieren.*

Quelle ist die VideoPipeline unter `C:\GitHub\VideoPipeline`. Sie bleibt
unangetastet und dient als Beweisquelle; diese Karte sagt je Faehigkeit, was
nach VideoWizard uebertragen ist, was offen ist und was bewusst nicht kommt.
Drei Zustaende:

- `uebertragen`: in VideoWizard gebaut, mit Beleg im Repo.
- `offen`: noch nicht gebaut.
- `bewusst nicht`: verworfen, mit Begruendung.

Davon abgesetzt `uebertragen (Einweg)`: gebaut, aber ohne Rueckweg; nach der
Uebergabe fuehrt das Zielwerkzeug.

## Uebertragen

| VideoPipeline-Faehigkeit | VideoWizard-Entsprechung | Zustand | Beleg |
|---|---|---|---|
| Blockmodell und Projektdatei: `project.json` als einzige Wahrheit, atomar ueber eine Nebendatei; ein Block verbindet Bildbereich, Text und Ton | `project.json` (Schema 1) mit demselben Blockmodell; `vz status` meldet je Block `ok`, `stale` oder `todo` | `uebertragen` | `src/lib/project.ts`, `src/lib/types.ts`, `src/commands/status.ts`; Tests: `tests/project.test.ts`, `tests/cli.test.ts` |
| Sync-Logik: `trim`, `hold`, `overflow`; Pausen aus der Stille-Erkennung, mindestens 0,15 s Puffer, Ueberlauf erst ab Faktor 1,25 | `src/lib/fit.ts` rechnet dieselben Regeln; `vz render` wendet sie im Render-Plan an | `uebertragen` | `src/lib/fit.ts`, `src/lib/renderplan.ts`, `tests/fit.test.ts` |
| Ingest mit Formatnormalisierung: Quelle pruefen und einmalig auf das Projektformat bringen | `vz ingest` legt `raw.mp4`, `source.wav` und Standbilder ab; abweichende Bildrate oder Aufloesung werden auf das Projektformat gebracht | `uebertragen` | `src/steps/ingest.ts`, `src/commands/ingest.ts`, `tests/ingest.test.ts` |
| Pausenerkennung und Segmentierung: Stille finden, Bloecke bilden | `vz transcribe` schreibt Woerter und Pausen; `vz segment` bildet daraus Bloecke mit fortlaufenden Kennungen | `uebertragen` | `src/lib/silence.ts`, `src/lib/segment.ts`, `src/commands/transcribe.ts`, `src/commands/segment.ts`; Tests: `tests/silence.test.ts`, `tests/segment.test.ts` |
| Sprachvertongung: Voicebox lokal, ElevenLabs als Rueckfall | `vz voice` mit den Anbietern `voicebox` und `elevenlabs`; Werkzeugkarten `skills/tools/tool-voicebox` und `skills/tools/tool-elevenlabs` | `uebertragen` | `src/commands/voice.ts`, `src/lib/providers/voicebox.ts`, `src/lib/providers/elevenlabs.ts`; Tests: `tests/voiceprovider.test.ts`, `tests/elevenlabsvoice.test.ts` |
| Musik: Datei uebernehmen oder erzeugen; ACE-Step lokal, ElevenLabs bezahlt | `vz music` mit den Anbietern `acestep` und `elevenlabs`; Erzeugen nur mit `--yes`; Werkzeugkarten `skills/tools/tool-ace-step` und `skills/tools/tool-elevenlabs` | `uebertragen` | `src/commands/music.ts`, `src/lib/providers/acestep.ts`, `src/lib/providers/elevenlabs_music.ts`; Tests: `tests/musicprovider.test.ts`, `tests/elevenlabsmusic.test.ts` |
| Render mit Ducking und Loudness: Voiceover auf -16 LUFS, Musik abgesenkt und per Sidechain geduckt, Master auf den Zielwert | `vz render`: Sprachspur auf -16 LUFS, Ducking per `sidechaincompress`, Endmischung auf -14 LUFS; Baustein `ffmpeg-loudnorm` | `uebertragen` | `src/steps/render.ts`, `src/lib/ffargs.ts`, `blocks/ffmpeg/loudnorm/recipe.md`; Tests: `tests/render.test.ts`, `tests/ffargs.test.ts` |
| Captions aus Wortzeiten | `vz render --captions` brennt ASS-Untertitel aus den Wortzeiten; Baustein `ffmpeg-captions` | `uebertragen` | `src/lib/captions.ts`, `blocks/ffmpeg/captions/recipe.md`, `tests/captions.test.ts` |
| Vorbedingungen pruefen (die ping-Laeufe der VideoPipeline) | `vz doctor` meldet je Faehigkeit: vorhanden, automatisch installierbar, nur von Hand oder Schluessel noetig | `uebertragen` | `src/lib/capabilities.ts`, `src/commands/doctor.ts`, `tests/doctor.test.ts` |
| Zulieferer-Prinzip: fal, Cavalry und After Effects legen eine Datei plus Beidatei ab und montieren nichts | Anbieter-Vertraege und Bausteine: ein Anbieter liefert Bytes, der Kern legt ab und traegt nur die Datei in `project.json` ein; Bausteine deklarieren unter `requires`, was sie brauchen | `uebertragen` | Spezifikation Abschnitt 3; `src/lib/providers/music.ts`, `src/lib/providers/voice.ts`, `src/lib/blocks.ts`; Test: `tests/blocks.test.ts` |
| Skills als Arbeitsablauf und Zulieferer-Wissen (`.claude/skills/`) | Portabler Skill-Baum unter `skills/` mit den Gruppen meta, planning, producing, tools und reference; Katalog `docs/catalog.md`; Einstieg `skills/meta/using-videowizard` | `uebertragen` | `tests/skills.test.ts`, `tests/catalog.test.ts`, `docs/catalog.md` |
| Diffusion-Studio-Anbindung: Ausleiter `scripts/ds-export.mjs`, Editor ueber `dapi` geprueft | `vz handoff` erzeugt einen Diffusion-Studio-Projektordner (Einweg); danach ist DS der Master, `project.json` bleibt Schnittplan-Snapshot; Skill `skills/producing/handoff-to-diffusion` | `uebertragen (Einweg)` | Spike `docs/research/2026-10-09-diffusion-studio-spike.md`; Live-Pruefung vom 10.10.2026 (DS oeffnet das Paket, `check` ohne Befund, `capture` stimmt); Tests: `tests/handoff.test.ts` |

## Offen

| VideoPipeline-Faehigkeit | VideoWizard-Entsprechung | Zustand | Beleg |
|---|---|---|---|
| Cavalry, After Effects und Remotion als Bausteine fuer Bewegung, Einblendungen und Karten | noch nicht gebaut; vorgesehen sind `blocks/cavalry/`, `blocks/after-effects/` und `blocks/remotion/`, `blocks/index.json` fuehrt bisher nur Beats und ffmpeg-Rezepte | `offen` | Spezifikation Abschnitt 6; `blocks/index.json` |
| Szenen-Karten (`kind: "card"`), von Remotion gerendert | fehlt; die Blockarten sind nur `take` und `still` | `offen` | `src/lib/types.ts` |
| Auto-Zoom aus Mausdaten: Zoom je Block aus Klicks und dem `screen`-Feld | nicht begonnen; kein Zoom-Feld im Projektformat, kein Rezept | `offen` | VideoPipeline `docs/roadmap.md` Phase 5; keine Fundstelle in VideoWizard |
| Mitschreiber und OBS-Anbindung: ein Befehl startet Aufnahme und Zeiger-Mitschnitt mit einem Nullpunkt | nicht begonnen; die Spezifikation fuehrt Aufnahme ueber OBS als geplante Faehigkeit, es gibt weder Mitschreiber noch WebSocket-Anbindung | `offen` | Spezifikation Abschnitt 4; VideoPipeline `docs/roadmap.md` Phase 5 |
| Showreel: Ordner voller Clips sichten, Musik dazu, drei Minuten schneiden | keine Entsprechung | `offen` | VideoPipeline `docs/roadmap.md` Phase 6 |
| Lokaler Whisper-Lauf fuer Transkripte | Rezept und Anbieter liegen vor (`skills/tools/tool-whisper`, `src/lib/providers/whisper.ts`), aber **nicht gegen ein echtes Binary geprueft** | `offen` | `skills/tools/tool-whisper` und `src/lib/providers/whisper.ts` sagen "nachgeschlagen, nicht gegengeprueft" |

## Bewusst nicht

| VideoPipeline-Faehigkeit | VideoWizard-Entsprechung | Zustand | Beleg |
|---|---|---|---|
| Monolith-App: eine Oberflaeche fuer alle Pipelines | keine; duenne Huellen, Skills und MCP bleiben getrennt | `bewusst nicht` | Eine Huelle, die alles beherbergt, muesste jede Pipeline kennen, ein klassischer Router-Fehler. |
| Zweiter Renderer fuer die Vorschau | keiner; ein Render-Plan (`src/lib/renderplan.ts`) und `vz render` | `bewusst nicht` | Zwei Mischwege wuerden Fit, Ducking und Lautheit auseinanderlaufen lassen. |
| MCP-Huellen fuer Cavalry und After Effects | keine; die Anbindung der Werkzeuge steht unter `offen`, eine eigene MCP-Huelle wird nicht gebaut | `bewusst nicht` | Die Cavalry-MCP-Server der VideoPipeline waren nur Huellen um Stallion, ohne eigenen Wert; ein solcher Umweg wird nicht uebernommen. |
| Suno als Musik-Anbieter | keiner; Musik kommt ueber `vz music` aus `acestep` und `elevenlabs` | `bewusst nicht` | Suno hat Stand Juli 2026 keine oeffentliche API, nur ein Partnerformular. |
| Cursor per Bilderkennung finden (Zeiger-Erkennung) | keine; vorgesehen ist der eigene Mitschreiber (siehe `offen`) | `bewusst nicht` | Am echten Material versucht: streng eingestellt findet der Detektor nichts, locker eingestellt 276 von 300 Bildern, der Mauszeiger steht weiss im weissen Keyviz-Ring. |
