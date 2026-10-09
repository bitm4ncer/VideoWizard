---
name: tool-whisper
description: Use when a source needs a local transcript, when whisper-ctranslate2 is missing, or when its recipe, word times or limits are unclear.
---

# Werkzeugkarte: whisper

Whisper ist die lokale Transkriptquelle hinter der Faehigkeit `transcript`.
Der Anbieter steht in `src/lib/providers/whisper.ts`; das Rezept unten ist
**nachgeschlagen, nicht gegengeprueft**.

## Erkennen

`vz doctor` prueft die Faehigkeit `transcript` mit dem festen Befehl
`whisper-ctranslate2 --help` (Rezept-Konstante `WHISPER_COMMAND` in
`src/lib/providers/whisper.ts`). Antwortet er, meldet der Doctor "vorhanden
(Programm: whisper)"; sonst "automatisch installierbar (whisper)". Ein
fehlendes Programm wirft nicht.

## Installieren

Laut Registry ist whisper "automatisch installierbar"; der `--fix`-Schritt des
Doctors ist noch nicht gebaut. Bis dahin von Hand installieren, so dass der
Befehl im `PATH` liegt (das Projekt whisper-ctranslate2 nennt
`pip install whisper-ctranslate2`); danach `vz doctor` erneut laufen lassen.

## Einrichten

In `project.json` waehlt `capabilities.transcript` den Anbieter:

- `provider`: `whisper`.
- `options.command`: Pflicht, nicht leere Liste von Argumenten. Genau zwei
  Platzhalter: `{input}` ist die Audiodatei (`sources/<id>/source.wav`),
  `{outdir}` ein temporaerer Ordner, den der Anbieter anlegt und danach
  entfernt. Fehlt die Vorlage, wirft der Lauf mit klarer Meldung.

Empfohlenes Rezept (Quelle: whisper-ctranslate2,
https://github.com/Softcatala/whisper-ctranslate2; das Kommando ist zur
OpenAI-Whisper-CLI kompatibel; Flags nachgeschlagen, nicht gegengeprueft):

```json
"command": ["whisper-ctranslate2", "{input}", "--model", "small",
  "--output_dir", "{outdir}", "--output_format", "json",
  "--word_timestamps", "True"]
```

Die Ergebnisdatei wird gesucht, nicht geraten: bevorzugt
`{outdir}/<basisname>.json` (bei `source.wav` also `source.json`), sonst die
einzige `.json` im Ordner, sonst ein Fehler, der die gefundenen Dateien nennt.

## Benutzen

`vz transcribe <ordner> <quelle>` ruft den Anbieter auf und schreibt
`sources/<id>/words.json` (Woerter mit `start`, `end`, `text`) und
`sources/<id>/silences.json` (Pausen). `vz segment <ordner> <quelle>` macht
daraus Bloecke; sie koennen danach bearbeitet oder von Hand ergaenzt werden.

## Grenzen

- Keine erfundenen Wortzeiten: liefert das Modell zu einem Segment keine
  Wortliste, gilt das Segment als ein Eintrag mit seiner eigenen Zeitspanne
  und seinem Text. Wortgenaue Zeiten gibt es nur, wenn das Modell sie liefert.
- Woerter werden getrimmt und nach `start` sortiert; fehlende oder nicht
  numerische Zeiten sind ein klarer Fehler.
- Whisper-Flags kennt der Code nicht; sie stehen nur in der Kommando-Vorlage.
  Der Doctor prueft `whisper-ctranslate2 --help`, nicht das Projektkommando.
- Keine Annahmen ueber andere Formate oder Felder; der Massstab ist
  `src/lib/providers/whisper.ts`.

Stand: 2026-10-09. Das Rezept ist nachgeschlagen, nicht gegengeprueft.
