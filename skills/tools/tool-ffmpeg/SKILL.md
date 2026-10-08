---
name: tool-ffmpeg
description: Use when ffmpeg must be checked, installed or used for a VideoWizard job, or when a loudness value needs its source.
---

# Werkzeugkarte: ffmpeg

ffmpeg ist der Kern fuer Schnitt, Mix und Render (Spezifikation Abschnitt 4).

## Erkennen

`vz doctor` prueft die Faehigkeit `render` mit dem Befehl `ffmpeg -version`.
Antwortet er, meldet der Doctor "vorhanden (ffmpeg)"; sonst "automatisch
installierbar (ffmpeg)".

## Installieren

Fehlt ffmpeg, gilt es laut Registry als automatisch installierbar. **Der
`--fix`-Schritt des Doctors ist noch nicht gebaut.** Bis dahin wird ffmpeg
von Hand installiert und muss im `PATH` liegen; danach `vz doctor` erneut
laufen lassen.

## Einrichten

Kein Schluessel, keine Konfigurationsdatei. Wichtig ist, dass derselbe
`ffmpeg`-Befehl im `PATH` liegt, den der Doctor und spaeter der Kern aufrufen.

## Benutzen

Einen `vz render`-Befehl gibt es noch nicht; er kommt mit dem ffmpeg-Kern in
Etappe 2. Nutzbar ist heute das Rezept aus dem Baustein `ffmpeg-loudnorm`:

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
