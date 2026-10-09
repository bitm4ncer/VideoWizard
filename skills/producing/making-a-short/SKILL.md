---
name: making-a-short
description: Use when a planned short has to be produced, or when it is unclear which capability supplies transcript, voice, music, editing or captions.
---

# Einen Short produzieren

Die Produktion fuehrt den Plan aus. Sie denkt in **Faehigkeiten**, nicht in
Werkzeugen: welcher Anbieter liefert, steht in `project.json` unter
`capabilities`, und was fehlt, zeigt `vz doctor`.

## Ablauf

1. **Doctor.** `vz doctor` prueft vor jedem Lauf, welche Faehigkeiten
   abgedeckt sind. Ein fehlender Anbieter ist ein Zustand, kein Grund zu raten.
2. **Material.** `vz ingest <ordner> <video> [--label <text>]` liest eine
   Aufnahme ein und legt sie als Quelle ab. Die erste Quelle setzt das
   Projektformat; die Hauptaufnahme gehoert zuerst eingelesen und im
   Zielformat (9:16, 1080x1920) gedreht.
3. **Bloecke schreiben.** Bloecke und ihr Text stehen in `project.json`. Ein
   Transkript gibt es noch nicht; bis Etappe 2b schreibt der Agent die
   Bloecke von Hand, ein Kapitel je Schnitt.
4. **Stimme.** `vz voice <ordner>` vertont jeden Block, dessen Text da ist
   und dessen Ton fehlt oder veraltet ist; Details in `tool-voicebox`.
5. **Musik.** Die Faehigkeit `music` liefert den Klang; heute ist das
   `acestep`, Details in `tool-ace-step`.
6. **Render.** `vz render <ordner>` schneidet, mischt und encodiert; die
   Endmischung zielt auf -14 LUFS (Rezept: `ffmpeg-loudnorm`). Ueberlaenge
   verweigert der Lauf ohne `--allow-overflow` und nennt die betroffenen
   Bloecke; mit dem Schalter rendert er und warnt. Details in `tool-ffmpeg`.

`vz status <ordner>` zeigt jederzeit, welche Bloecke noch offen sind.

## Was es heute noch nicht gibt

- **Transkript und Captions.** Beides braucht echte Wort-Zeitstempel und
  folgt in Etappe 2b; bis dahin werden die Bloecke von Hand geschrieben.
- **`--fix` im Doctor.** Ein fehlendes Werkzeug wird von Hand installiert.
