# Spezifikation: VideoWizard

*Stand: 08.10.2026. Entwurf zur Abnahme. Ein neues, eigenstaendiges Projekt unter
`C:\GitHub\VideoWizard`.*

## 1. Zweck und Abgrenzung

**VideoWizard ist eine universelle Agenten-Suite fuer Videoarbeit.** Sie plant
und produziert Videos, Shorts, Tutorials, Animationen, Lyric-Videos und
Kundenassets, und sie bindet die dafuer noetigen Werkzeuge konkret an.

Vorbild ist **Superpowers**: ein Repo, viele Harnesse, Skills als tragbares
Wissen, duenne Hüllen je Harness. Der Unterschied: VideoWizard hat **konkrete
Tool-Anbindung und Bedienung**, nicht nur Denkweisen.

**Abgrenzung zur VideoPipeline** (`C:\GitHub\VideoPipeline`):

| | VideoPipeline | VideoWizard |
|---|---|---|
| Rolle | private bitmancer-Pipeline und Spielwiese | universelles, verteilbares Produkt |
| Entstehung | organisch an echten Projekten gewachsen | bewusst entworfen, modular |
| Zielgruppe | ein Kanal, ein Nutzer | jeder Agent, jedes Harness |
| Wissen | in Skills und verstreuten Docs | in Skills, mit Herkunft und Datum belegt |

VideoPipeline bleibt unangetastet und dient als **Beweisquelle**: Was dort an
echtem Material gemessen wurde, wandert als Learning in VideoWizard (Abschnitt 11).

## 2. Leitprinzipien

1. **Skills tragen das Wissen, der Kern traegt die Verlaesslichkeit.** Regeln
   und Struktur stehen in `SKILL.md`. Dateioperationen, Rendern und
   Provideraufrufe stehen im Kern (CLI und MCP), wo sie testbar sind.
2. **Faehigkeiten statt Werkzeuge.** Ein Workflow fordert eine Faehigkeit
   ("Stimme", "Musik", "Bewegung"). Welches Werkzeug liefert, entscheidet die
   Konfiguration.
3. **Ein Skill, ein Auftrag.** Router-Skills waehlen nur aus, sie arbeiten nicht.
4. **Beleg statt Behauptung.** Jeder gemessene Wert traegt Datum und Quelle.
5. **Nichts ohne Zustimmung.** Kein Ueberschreiben, keine Installation, kein
   Upload ohne ausdrueckliche Freigabe. Alles idempotent.
6. **Ein Projektformat.** Portabel, versioniert, migrierbar.
7. **Harness-neutral.** Skills und MCP sind die Oberflaeche, Hüllen sind duenn.
8. **Fertige Bausteine statt Nachbau.** Was schon existiert, wird geladen, nicht
   neu erfunden (Abschnitt 6).

## 3. Architektur

```
Ebene 0  Hüllen        .claude-plugin/  .opencode/  .codex-plugin/  (duenn)
Ebene 1  Skills        portable SKILL.md (planning, producing, tools, meta)
Ebene 1b Bausteine     fertige Artefakte + index.json, direkt ladbar
Ebene 2  Kern          CLI + MCP: Projekt, Doctor, Provider, Render
Ebene 3  Provider      ffmpeg, ace-step, voicebox, elevenlabs, cavalry, ae, ...
Ebene 4  Medien-Apps   native Programme, ueber Bruecken angesprochen
```

- **Ebene 2 ist der einzige Motor.** Sie laeuft nur dort, wo GPU und native
  Programme sind. Ein Harness-Plugin kann das nicht hosten.
- **Provider sind austauschbar.** Jeder Provider erfuellt einen kleinen Vertrag
  (erkennen, erzeugen, melden). Ein Workflow kennt nur die Faehigkeit.
- **Zulieferer montieren nichts.** Ein Provider legt eine Datei plus Metadaten
  ab. Wo sie hingehoert, entscheidet der Workflow oder der Nutzer.

## 4. Faehigkeiten und Anbieter

| Faehigkeit | Anbieter (Auswahl) | Status |
|---|---|---|
| Aufnahme | OBS | geplant |
| Transkript | faster-whisper, ElevenLabs Scribe | geplant |
| Stimme | Voicebox/Qwen, ElevenLabs, Chatterbox, Kokoro | geplant |
| Musik | ACE-Step, ElevenLabs music | **ACE-Step zuerst** |
| Sound/SFX | MOSS-SoundEffect, Stable Audio | spaeter |
| Bewegung/Intro | Cavalry, After Effects, Remotion | spaeter |
| Overlays/Karten/Captions | Remotion | spaeter |
| Schnitt/Mix/Render | ffmpeg | **Kern** |
| Recherche/Download | yt-dlp, fal | spaeter |

Jede Faehigkeit hat genau **einen** aktiven Anbieter in der Konfiguration, mit
benannten Alternativen. Das ist die Verallgemeinerung von `tts.provider` und
`music.provider` aus der VideoPipeline.

## 5. Skill-Taxonomie

```
skills/
  meta/      using-videowizard, doctor, writing-recipes, harvesting-learnings
  planning/  planning-video (Router), planning-short, planning-tutorial,
             planning-explainer, planning-animation, planning-lyric,
             planning-client-asset, writing-hooks, scripting, storyboarding
  producing/ making-a-short, making-a-tutorial, making-a-lyric-video,
             editing-footage, generating-assets
  tools/     tool-ffmpeg, tool-ace-step, tool-voicebox, tool-elevenlabs,
             tool-chatterbox, tool-kokoro, tool-moss-soundeffect, tool-fal,
             tool-comfyui, tool-cavalry, tool-after-effects, tool-remotion,
             tool-obs, tool-yt-dlp, tool-whisper
  reference/ video-anatomy, platform-specs, project-schema, blocks
```

**Regeln gegen Chaos:**

- **Ein Auftrag je Skill.** Passt eine zweite Aufgabe hinein, wird sie ein Skill.
- **Flache Namen, verb-first, kebab-case**, keine Klammern.
- **`description` nennt nur den Ausloeser**, nie den Ablauf.
- **`SKILL.md` bleibt kurz.** Tiefe kommt nach `references/`.
- **Jede Tool-Karte hat fuenf Abschnitte:** Erkennen, Installieren, Einrichten,
  Benutzen, Grenzen. Dazu der gemessene Stand mit Datum.
- **`docs/catalog.md` wird aus den Frontmattern erzeugt.**
- **Aufnahmeregeln** stehen in `docs/writing-guide.md`.

**Reihenfolge des Wachstums:** erst Meta, dann eine Planung und ein Werkzeug,
dann die Produktion. Kein Skill ohne echten Anwendungsfall.

## 6. Bausteine

**Bausteine sind fertige, selbsttragende Artefakte, die direkt geladen und
benutzt werden.** Sie werden **nicht** neu gebaut, nur ausgewaehlt und
parametrisiert. Sie liegen im VideoWizard-Repo und reisen mit dem Plugin, also
sind sie auch dann da, wenn **nur das reine Plugin** installiert ist.

```
blocks/
  remotion/       fertige Komponenten: Captions, Karten, Bauchbinden, Fortschritt
  ffmpeg/         getestete Filterrezepte (Untertitel brennen, Hochformat, Pegel)
  cavalry/        Szenenvorlagen (.cv) und Bauskripte (.js)
  after-effects/  Bauskripte (.jsx)
  prompts/        Prompt-Vorlagen fuer fal, ACE-Step, Bildstile
  scaffolds/      Projektvorlagen (Ordner + project.json) je Videoart
  beats/          Beat-Vorlagen: Hook-Formeln, Tutorial-Kapitel, Short-Rahmen
  index.json      das Verzeichnis aller Bausteine
```

Jeder Baustein hat einen Eintrag in `blocks/index.json`:

```json
{
  "id": "remotion-caption-track",
  "kind": "remotion-component",
  "capability": "captions",
  "purpose": "Wort-Hervorhebung aus Wort-Timestamps",
  "inputs": ["words.json", "brand.json"],
  "requires": { "tools": ["node"], "providers": [] },
  "license": "MIT",
  "version": 1,
  "entry": "remotion/caption-track/CaptionTrack.tsx"
}
```

**Laden:**

- **Regelfall:** Das Plugin bringt das Repo mit (Superpowers-Muster, Plugin-Cache
  im Harness). Der Agent liest `blocks/index.json` und laedt genau die
  Bausteine, die er braucht. Kein Netz, keine Kernabhaengigkeit.
- **Erkennen:** Das Skill `reference/blocks` beschreibt das Verzeichnis, die
  Felder und die Auswahl.
- **Optional spaeter:** ein HTTP-Katalog, damit ein noch duenneres Plugin
  Bausteine nachladen kann. Nicht Teil von Version 1.

**Regeln:**

- **Selbsttragend.** Ein Baustein haengt nie vom Kern ab. Braucht er ein
  Werkzeug oder einen Dienst, steht das in `requires`.
- **Lizenz je Baustein**, und nur weitergebbare Lizenzen (MIT, Apache-2.0,
  CC0, CC-BY). Schriften und Medien werden gesondert geprueft.
- **Versioniert und unveraenderlich.** Aenderungen erhoehen `version`; Skills
  nennen die `id`, nie einen Pfad.
- **Getestet, wo pruefbar.** ffmpeg-Rezepte und Remotion-Komponenten haben
  Tests; reine Vorlagen haben eine Sichtpruefung.
- **Keine Duplikate.** Ein Baustein hat genau einen Ort. Ein Integritaetscheck
  stellt sicher, dass jede Datei unter `blocks/` einen Eintrag hat und umgekehrt.

**Verhaeltnis zu Skills:** Bausteine sind das **Was** (fertige Artefakte),
Skills das **Wie und Warum** (Auswahl, Regeln, Ablauf). Ein Tool-Skill verweist
auf seine Bausteine; ein Produktions-Workflow setzt sie ein.

## 7. Projektformat

Ein Projekt ist ein Ordner mit **einer** Wahrheitsdatei `project.json`,
schema-versioniert.

```json
{
  "schema": 1,
  "id": "2026-10_mein-short",
  "title": "…",
  "format": { "fps": 30, "width": 1080, "height": 1920 },
  "language": { "recorded": "de", "output": "en" },
  "sources": [],
  "blocks": [],
  "capabilities": {
    "voice": { "provider": "voicebox", "options": {} },
    "music": { "provider": "acestep", "options": { "model": "acestep-v15-turbo" } }
  },
  "delivery": { "targets": ["youtube-shorts", "tiktok"] }
}
```

- **Ein Block** verbindet Bildbereich, Text und Ton; die Reihenfolge ist die
  Reihenfolge im Video (bewaehrt in der VideoPipeline).
- **`capabilities`** waehlt je Faehigkeit den Anbieter.
- **Migrationen** liegen unter `migrations/`, jede erhoeht `schema` um eins.

## 8. Doctor

Ein Befehl (`videowizard doctor`), idempotent, ohne stille Eingriffe:

1. **Feststellen:** welche Faehigkeiten sind abgedeckt, welche fehlen.
2. **Melden:** je Faehigkeit "vorhanden", "automatisch installierbar",
   "nur von Hand", "Schluessel noetig".
3. **Installieren** (`--fix`): nur was automatisch geht, je Werkzeug in einer
   **isolierten Umgebung** (uv/venv, kein globales pip).
4. **Anleiten:** GPU-Treiber, OBS, After Effects (Lizenz), Cavalry (Konto).
5. **Gegenpruefen:** danach erneut erkennen, Ergebnis zeigen.

Der Doctor ist die Verallgemeinerung der `ping`-Vorbedingungen aus der
VideoPipeline. Er ist Voraussetzung fuer jeden Workflow.

## 9. Planung und Produktion

**Planung** erzeugt aus einer Absicht eine Struktur: Format, Dauer, Beats,
Hook, Skript, Storyboard, Anbieterwahl. Sie schreibt in `project.json` und in
`plan.md`. Sie **erfindet nichts** und fragt nach, statt zu raten.

**Produktion** fuehrt aus: aufnehmen oder Bett bauen, transkribieren, Bloecke
bilden, Stimme, Musik, Captions, rendern, verpacken.

Ein Workflow ist ein Skill, der beides verbindet und die Faehigkeiten nennt.
Werkzeugdetails stehen nicht dort, sondern in den Tool-Karten.

## 10. Harness-Verpackung

- **Skills** sind die tragbare Schicht (Claude Code, Codex, OpenCode, u. a.).
- **MCP** ist die Aktionsschicht fuer Harnesse ohne Skill-Ordner.
- **Hüllen** registrieren nur Skills und MCP.
- **Tool-Namensabbildung** je Harness wird zentral gepflegt, nicht je Skill.

## 11. Improvement Loop

Der Mechanismus, mit dem VideoWizard aus echter Arbeit waechst, ohne zu
verwildern.

1. **Learning erfassen.** `learnings/` enthaelt je Erkenntnis eine datierte
   Datei mit Beobachtung, Material, Messung, Ergebnis und offener Frage. Ein
   Befehl (`videowizard learn`) legt den Rahmen an.
2. **Einordnen.** Das Skill `harvesting-learnings` sagt, welchem Skill, Provider
   oder Baustein ein Learning gehoert, und ob es eine Aenderung rechtfertigt.
3. **Uebernehmen.** Skill-Aenderungen folgen der writing-skills-Disziplin: erst
   das fehlschlagende Szenario, dann die Aenderung, dann die Pruefung.
4. **Aufraeumen.** Eingearbeitete Learnings werden markiert, nicht geloescht.
5. **Herkunft.** Erkenntnisse aus der VideoPipeline nennen Quelle, Datum und
   Messung.

`learnings/` ist ein **Belegarchiv**, kein Tagebuch.

## 12. Entscheidungen

| Nr | Entscheidung | Begruendung | Verworfen |
|---|---|---|---|
| V1 | **Kern in TypeScript/Node** | MCP-SDK, Hüllen und Remotion sind Node; ffmpeg laeuft als Prozess | Python-Kern |
| V2 | **ML-Werkzeuge als eigene Dienste** | ACE-Step und Verwandte laufen als Server/CLI in eigener Umgebung | ML-Bibliotheken importieren |
| V3 | **Ein Projektformat, versioniert** | Portabilitaet und Migration | je Pipeline ein Format |
| V4 | **Skills + MCP + Hüllen** | bewaehrtes Superpowers-Muster | In-Process-Plugin als Primform |
| V5 | **Doctor vor jedem Workflow** | fehlende Werkzeuge sind die haeufigste Ursache | implizite Annahmen |
| V6 | **Faehigkeit statt Werkzeug** | verhindert Wildwuchs | Werkzeug fest verdrahten |
| V7 | **Bausteine liegen im Repo und reisen mit dem Plugin** | mit dem reinen Plugin sofort nutzbar, kein zweiter Download | Bausteine nur im Kern oder nur online |

## 13. Offene Punkte

- **Erster durchgehender Short**: Stimme zuerst ueber Voicebox, Chatterbox als
  portabler zweiter Anbieter.
- **Captions**: Remotion-Baustein oder ffmpeg; Entscheidung mit dem ersten
  Bedarf.
- **Ob der Kern eine eigene UI bekommt**: vorerst nein.
- **Wie viele MCP-Server**: einer mit gruppierten Tools ist die Vorgabe.

## 14. Etappen

| Etappe | Inhalt | Abnahme |
|---|---|---|
| **1** | Geruest, Konventionen, Projektformat, Doctor, Baustein-Mechanik mit zwei Startbausteinen, Musik-Provider ACE-Step, Skills `using-videowizard`, `planning-short`, `making-a-short`, `tool-ffmpeg`, `tool-ace-step` | Frischer Ordner wird erkannt, Doctor berichtet, Bausteine sind gelistet und ladbar, ein Short-Plan entsteht. Tests gruen |
| **2** | ffmpeg-Kern: ingest, transkribieren, Bloecke, Stimme, vertikaler Render, Captions (Baustein) | ein kurzer Clip rendert aus echten Quellen |
| **3** | Weitere Provider: Voicebox, Chatterbox, Cavalry/AE/Remotion-Bausteine | Werkzeugwechsel ohne Workflow-Aenderung |
| **4** | MCP-Server und Hüllen fuer Claude, Codex, OpenCode | installierbar und auffindbar |
| **5** | Improvement Loop und Migrationskarte aus der VideoPipeline | Learnings wandern nachweisbar in Skills und Bausteine |
