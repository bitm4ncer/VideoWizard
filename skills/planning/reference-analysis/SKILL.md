---
name: reference-analysis
description: Use when a loved reference video should become a reliable creative brief, or when a reference video needs measuring before planning.
---

# Referenz-Analyse

Ein Auftrag: aus einem geliebten Referenzvideo einen belastbaren Brief machen.
Die Datei legt der Mensch lokal ab; es wird **nichts geladen und nichts
weitergegeben**. Fehlt die Datei, wird gefragt, nicht besorgt.

## Wegwerf-Projekt

Gemessen wird in einem eigenen Wegwerf-Projekt, nie im Zielprojekt: die
Referenz ist kein Projektinhalt. Nur die Ergebnisse wandern weiter. Die
vorhandenen Befehle `vz ingest`, `vz transcribe` und `vz segment` holen die
Datei hinein, liefern Transkript und Pausen und teilen sie in Bloecke;
`ffprobe` liefert Laenge, Bildrate und Schnittkanten.

## Was gemessen wird

| Messwert | Quelle |
|---|---|
| Wortrate | Woerter und Sprechzeit aus dem Transkript |
| Pausen | `silences.json` aus der Transkription |
| Schnittstruktur | Blockdauern aus der Segmentierung, Schnittkanten aus `ffprobe` |
| Hook-Zeitpunkt | Beginn der ersten Sprache aus dem Transkript; ohne Anbieter naeherungsweise der erste Schnitt aus `ffprobe` |

Jede Zahl bekommt Quelle und Datum; was messbar ist, wird nicht geschaetzt.
Was fehlt, steht als offener Punkt im Ergebnis.

## Ergebnis

`reference.md` im Zielprojekt traegt:

- **Messwerte** als Zahlen, je mit Quelle.
- **Das behalten / das aendern**: je Punkt in einem Satz, was die eigene
  Version uebernimmt und was bewusst abweicht.
- **Zwei bis drei Konzepte** mit Ein-Satz-Begruendung, warum sie zur Referenz
  passen.

## Ehrliche Grenze

Wortzeiten brauchen einen Transkript-Anbieter; das Rezept in der Werkzeugkarte
`tool-whisper` ist nachgeschlagen, nicht gegengeprueft. Ohne Anbieter bleibt
nur die Pausen- und Strukturmessung. Das wird im `reference.md` so vermerkt
und nicht durch Schaetzungen ersetzt.
