---
name: making-a-short
description: Use when a planned short has to be produced, or when it is unclear which capability supplies transcript, voice, music, editing or captions.
---

# Einen Short produzieren

Die Produktion fuehrt den Plan aus. Sie denkt in **Faehigkeiten**, nicht in
Werkzeugen: welcher Anbieter liefert, steht in `project.json` unter
`capabilities`, und was fehlt, zeigt `vz doctor`.

## Ablauf

Vor dem teuren Bau stehen die Freigaben aus `plan.md` (Abschnitt `Freigaben`):
Story (Beats), Look (Visuelles Thema) und Storyboard (Shotliste). Bei
Kundenarbeit sind alle drei Pflicht; bei kurzen Privatstuecken darf
zusammengefasst werden.

1. **Doctor.** `vz doctor` prueft vor jedem Lauf, welche Faehigkeiten
   abgedeckt sind. Ein fehlender Anbieter ist ein Zustand, kein Grund zu raten.
2. **Material.** `vz ingest <ordner> <video> [--label <text>]` liest eine
   Aufnahme ein und legt sie als Quelle ab. Die erste Quelle setzt das
   Projektformat; die Hauptaufnahme gehoert zuerst eingelesen und im
   Zielformat (9:16, 1080x1920) gedreht.
3. **Transkript und Segmentierung.** `vz transcribe <ordner> <quelle>`
   transkribiert die Tonspur der Quelle und erkennt ihre Pausen;
   `vz segment <ordner> <quelle>` teilt das Transkript an den Pausen in
   Bloecke und haengt sie hinten an `project.json` an. Bloecke koennen
   weiterhin von Hand geschrieben oder bearbeitet werden, jetzt aber auch
   aus der Aufnahme entstehen; Details in `tool-whisper`.
4. **Stimme.** `vz voice <ordner>` vertont jeden Block, dessen Text da ist
   und dessen Ton fehlt oder veraltet ist; Details in `tool-voicebox`.
5. **Musik.** Die Faehigkeit `music` liefert den Klang; `vz music` bekommt
   entweder eine Datei (`vz music <ordner> <datei>`) oder erzeugt das Bett
   (`vz music <ordner> generate --prompt "..." [--seconds N] [--yes]`).
   Erzeugen kostet Geld und laeuft nur mit `--yes`; ohne `--seconds` gilt die
   Summe der Stimmdauern und Pausen. Details: `tool-ace-step` (lokal) und
   `tool-elevenlabs` (Schluessel).
6. **Render.** `vz render <ordner>` schneidet, mischt und encodiert; die
   Endmischung zielt auf -14 LUFS (Rezept: `ffmpeg-loudnorm`). Mit
   `--captions` brennen die Wortzeiten als Untertitel ins Bild; fehlen sie,
   wird gewarnt und ohne Untertitel gerendert. Unfertige Bloecke (Text oder
   Ton fehlt) und Ueberlaenge verweigert der Lauf und nennt die betroffenen
   Bloecke; mit `--allow-incomplete` beziehungsweise `--allow-overflow`
   rendert er und warnt. Details in `tool-ffmpeg`.
7. **Nachschau.** `vz review <ordner> [--captions]` prueft die neueste
   Ausgabe in `out/` gegen den Plan und schreibt `review.md`; der Lauf
   berichtet nur, er blockiert nie. `--captions` nimmt fehlende Untertitel in
   die Befunde auf; ohne den Schalter bleibt ihre Anwesenheit eine blosse
   Messung. Wiederkehrende Befunde gehen ueber `vz learn` in den Lernloop.

`vz status <ordner>` zeigt jederzeit, welche Bloecke noch offen sind.

## Finish fuer Menschen

Fuer die Version, die ein Mensch in Diffusion Studio feinschleifen will:
`vz handoff <ordner>` erzeugt den Uebergabeordner (Vorgabe
`handoff/diffusion-studio`; `--out <pfad>` woandershin, `--force` ersetzt
einen belegten). Einweg: Nach dem Hand-off ist Diffusion Studio der Master;
`project.json` bleibt Schnittplan-Snapshot. Details: `handoff-to-diffusion`.

## Was es heute noch nicht gibt

- **`--fix` im Doctor.** Ein fehlendes Werkzeug wird von Hand installiert.
