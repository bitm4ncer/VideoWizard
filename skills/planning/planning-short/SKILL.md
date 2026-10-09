---
name: planning-short
description: Use when planning a short video for Reels, Shorts or TikTok, or when a short needs a hook and a retention structure.
---

# Einen Short planen

Planung macht aus einer Absicht eine Struktur. Sie **erfindet nichts**: fehlt
eine Angabe (Ziel, Dauer, Sprache, Anbieter), wird gefragt, nicht geraten.

## Retention-Struktur

Der Rahmen kommt aus dem Baustein `beats-short-retention`:

| Beat | Zeit | Aufgabe |
|---|---|---|
| Hook | 0 bis 2 s | Das Versprechen: in einem Satz sagen, was der Zuschauer bekommt. |
| Confirm | 2 bis 5 s | Der Beweis: zeigen, dass das Versprechen stimmt. |
| Payoff | 5 bis 15 s | Die Substanz: in Schritten von 1 bis 3 s liefern. |
| Loop oder CTA | am Ende | Zurueck zum Anfang oder eine klare Handlungsaufforderung. |

## Plattform-Specs

- Format: 9:16, 1080x1920.
- Safe-Zones: oben und unten Platz fuer die Plattform-UI lassen; Richtwert
  rund 10 Prozent (Quelle VideoPipeline), vor der Auslieferung gegen die
  Plattform pruefen.
- Lautheit der Endmischung: -14 LUFS; das Rezept steht im Baustein
  `ffmpeg-loudnorm`.
- Ausgabeziele in `delivery.targets`, etwa `youtube-shorts` und `tiktok`.

## Ergebnis

Der Plan landet in `project.json` (Format, `capabilities`, `delivery`) und in
`plan.md` (Beats, Skript, Quellen). Das Projektformat beschreibt Abschnitt 7
der Spezifikation.

Einen `vz plan`-Befehl gibt es noch nicht. Den Plan legt der Agent als Dateien
an; der Kern ist mit Etappe 2a da, Transkript, Segmentierung und Captions sind
mit Etappe 2b da.

## Weiter

Die Beats sind die Eingabe der Shotliste: `storyboarding` macht daraus die
Shotliste und das Visuelle Thema und traegt die Freigaben in `plan.md` ein.
