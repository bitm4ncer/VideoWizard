---
name: tool-elevenlabs
description: Use when ElevenLabs supplies voice or music, when its key is missing, or when its endpoints and limits are unclear.
---

# Werkzeugkarte: ElevenLabs

ElevenLabs (https://elevenlabs.io) ist der Schluessel-Anbieter hinter den
Faehigkeiten `voice` und `music`. Beide Wege lesen denselben Schluessel.

## Erkennen

`vz doctor` fuehrt die Faehigkeiten `voice` und `music`; in beiden steht
`elevenlabs` als Schluessel-Anbieter. Liegt der Schluessel vor, meldet die
Zeile `vorhanden (Schluessel: elevenlabs)`, sofern kein lokaler Anbieter
zuvor antwortet (Registry-Reihenfolge: erst `voicebox` beziehungsweise
`acestep`, dann `elevenlabs`). Ohne Schluessel entscheidet der lokale Anbieter
die Zeile: laeuft er, steht dort `vorhanden (Dienst: voicebox)` oder
`vorhanden (Dienst: acestep)`; sonst `nur von Hand (voicebox)` oder
`nur von Hand (acestep)`. Ein fehlender Schluessel wirft nie, er ist ein
Zustand.

Der Doctor hat kein Projekt und prueft nur die Vorgabe-Quelle, die
Umgebungsvariable `ELEVENLABS_API_KEY`; ein `secret.file` aus dem Projekt
kennt er nicht.

## Installieren

Kein lokales Programm: In der Registry steht der Anbieter als `key`. Eine
automatische Einrichtung (`--fix`) gibt es noch nicht. Den Schluessel in der
ElevenLabs-Oberflaeche anlegen; danach `vz doctor` erneut laufen lassen.

## Einrichten

In `project.json` waehlt `capabilities.voice.provider` beziehungsweise
`capabilities.music.provider` den Wert `elevenlabs`:

- `options.secret.env`: Name der Umgebungsvariable; Vorgabe
  `ELEVENLABS_API_KEY`.
- `options.secret.file`: Pfad zu einer Schluesseldatei. Zuerst liest der Kern
  die Umgebungsvariable; erst wenn sie leer ist, kommt die Datei. Sie darf
  den nackten Wert oder eine Zeile `ELEVENLABS_API_KEY=wert` enthalten. Ein
  relativer Pfad gilt zum Projektordner (bei `project.json`); ein absoluter
  Pfad gilt so, wie er dasteht.
- `voice`: `options.voice_id` ist fuer `vz voice` Pflicht; fehlt sie, wirft
  der Lauf mit klarer Meldung. `options.model` (etwa
  `eleven_multilingual_v2`), `stability`, `similarity_boost` und `speed` sind
  optional; fehlt das Modell, entscheidet die API.
- `music`: `options.model` ist optional; Vorgabe `music_v2`.

Der Schluessel wird nie ausgegeben, auch nicht gekuerzt; Fehlermeldungen
nennen nur die Quelle.

## Benutzen

`vz voice <ordner>` vertont Bloecke wie mit `voicebox` und legt MP3 unter
`audio/tts/<blockId>.mp3` ab (Format `mp3_44100_128`). Der Anbieter ruft
`POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>/with-timestamps`
mit Kopfzeile `xi-api-key` auf; der Rumpf traegt `text` und nur gesetzte
Felder (`model_id`, `voice_settings`). Die Antwort liefert `audio_base64`
und `alignment` mit **echten** Zeichenzeiten; nichts wird umgerechnet oder
geschaetzt, fehlt `alignment`, ist es null wie bei Voicebox.

`vz music <ordner> generate --prompt "<text>" [--seconds N] [--yes]` ruft
`POST https://api.elevenlabs.io/v1/music` mit `{ prompt, music_length_ms,
model_id }` auf und legt die rohe Antwort als MP3 unter `audio/music.mp3` ab.
Ohne `--seconds` ist die Laenge die Summe der Stimmdauern und Pausen.

## Grenzen

- Musik kostet Credits; erzeugt wird nur mit `--yes`, sonst endet der Lauf
  mit der Kostenmeldung.
- Ein Seed wird nicht gesendet: die Vorlage kennt fuer Musik keinen, ein
  mitgegebener Wert wird ignoriert.
- Fehlt der Schluessel, brechen `speak` und `generate` vor dem Aufruf ab; es
  gibt keine Ausgabe. Ein HTTP-Fehler kommt als klare Meldung, der
  Schluessel darin geschwaerzt.
- Keine Annahmen ueber andere Endpunkte oder Felder; der Massstab sind die
  Provider-Vertraege `src/lib/providers/elevenlabs.ts` und
  `elevenlabs_music.ts`.

Gemessener Stand: 2026-10-09. Endpunkte, Felder und Vorgabewerte stammen
woertlich aus `src/lib/providers/elevenlabs.ts` und
`src/lib/providers/elevenlabs_music.ts`.
