---
name: tool-ffmpeg
description: Use when ffmpeg must be checked, installed or used for a VideoWizard job, or when a loudness value needs its source.
---

# Werkzeugkarte: ffmpeg

ffmpeg ist der Kern fuer Schnitt, Mix und Render (Spezifikation Abschnitt 4).

## Erkennen

`vz doctor` prueft die Faehigkeit `render` mit dem Befehl `ffmpeg -version`.
Antwortet er, meldet der Doctor "vorhanden (Programm: ffmpeg)"; sonst
"automatisch installierbar (ffmpeg)".

## Installieren

Fehlt ffmpeg, gilt es laut Registry als automatisch installierbar. **Der
`--fix`-Schritt des Doctors ist noch nicht gebaut.** Bis dahin wird ffmpeg
von Hand installiert und muss im `PATH` liegen; danach `vz doctor` erneut
laufen lassen.

## Einrichten

Kein Schluessel, keine Konfigurationsdatei. Wichtig ist, dass derselbe
`ffmpeg`-Befehl im `PATH` liegt, den Doctor und Render aufrufen.

## Benutzen

`vz render <ordner>` faehrt die ganze Kette: Bloecke schneiden, per
concat-Liste zusammenfuegen, Sprachspur und Musik mit Ducking mischen, final
mit NVENC encodieren; scheitert das, weicht der Lauf auf libx264 aus.
Ueberlaenge verweigert der Lauf ohne `--allow-overflow`, unfertige Bloecke
(Text oder Ton fehlt) ohne `--allow-incomplete`; der jeweilige Schalter
rendert und warnt. Die Pegel kommen aus `project.audio`; ohne Angabe gilt
das Rezept aus dem Baustein `ffmpeg-loudnorm`:

1. Stimme allein: `loudnorm=I=-16:TP=-1.5:LRA=11`.
2. Endmischung: `loudnorm=I=-14:TP=-1.5:LRA=11`.

Die Werte sind gemessen und stehen so im Baustein; nicht abwandeln, ohne neu
zu messen.

## Grenzen

- ffmpeg laeuft als externer Prozess; Fehler kommen als Text, nicht als
  Ausnahme.
- ffmpeg kennt keine Projektstruktur. Bloecke, Reihenfolge und Anbieterwahl
  kommen aus `project.json`.
- Zwei Loudnorm-Stufen sind Absicht: erst die Stimme auf -16, damit das
  Ducking einen verlaesslichen Pegel bekommt, dann die Mischung auf -14.
- Keine weiteren Zielwerte erfinden; jeder neue Wert braucht Messung, Datum
  und Quelle.

Gemessener Stand: 2026-10-08. Die Loudnorm-Werte stammen aus dem Baustein
`ffmpeg-loudnorm`; diese Karte nennt keine weiteren Zahlen.
