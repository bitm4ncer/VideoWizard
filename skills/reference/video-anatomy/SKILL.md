---
name: video-anatomy
description: Use when beat structure, format sizes or loudness targets for a video are needed, before planning or producing it.
---

# Video-Anatomie

## Beats

Jedes Video ist eine Folge von Beats; ihre Reihenfolge ist die Reihenfolge im
Video. Fuer Shorts gilt der Rahmen aus dem Baustein `beats-short-retention`:
Hook (0 bis 2 s), Confirm (2 bis 5 s), Payoff (5 bis 15 s), Loop oder CTA.
Planungs-Skills waehlen die passende Beat-Vorlage aus `blocks/`, statt eine
neue zu erfinden.

## Formate

| Format | Masze | Gebrauch |
|---|---|---|
| 9:16 | 1080x1920 | Shorts, Reels, TikTok |
| 16:9 | 1920x1080 | YouTube, Querformat |

Safe-Zones: oben und unten Platz fuer die Plattform-UI lassen; Richtwert rund
10 Prozent (Quelle VideoPipeline), vor der Auslieferung gegen die Plattform
pruefen. Weitere Formate nur aus dem Projektformat ableiten, nichts raten.

## Lautheit

| Spur | Ziel |
|---|---|
| Stimme allein | -16 LUFS |
| Endmischung | -14 LUFS |
| Musikbett | etwa -23 LUFS |

Das zweistufige Rezept steht im Baustein `ffmpeg-loudnorm`; die Werte sind
gemessen, nicht geraten. Das Musikbett liegt deutlich unter der Stimme, damit
Musik die Sprache nicht verdraengt.

## Keine erfundenen Zahlen

Jede Zahl braucht Quelle und Datum, oder sie wird gemessen. Was nicht belegt
ist, wird erfragt oder gemessen, nicht geschaetzt. Neue Messwerte wandern mit
Datum und Herkunft in einen Baustein oder ein Learning, nie als stille
Aenderung in einen Skill.
