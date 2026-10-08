# Loudnorm-Rezept

Das bewaehrte Loudness-Rezept aus der VideoPipeline, in zwei Stufen.

## Stufe 1: Stimme

```
loudnorm=I=-16:TP=-1.5:LRA=11
```

Die Stimme laeuft zuerst allein auf -16 LUFS, damit das Ducking der Musik
einen verlaesslichen Pegel bekommt.

## Stufe 2: Endmischung

```
loudnorm=I=-14:TP=-1.5:LRA=11
```

Danach laeuft der fertige Mix auf -14 LUFS, den Zielwert fuer die Ausgabe.

## Herkunft der Werte

Die Zielwerte sind gemessen, nicht geraten; `TP=-1.5` und `LRA=11` gehoeren
dazu.
