# Captions-Rezept: ASS brennen

Wortzeiten als ASS-Untertitel ins Bild brennen. Die Zeiten stammen aus
`sources/<id>/words.json` und werden ehrlich auf die Ausgabeachse gelegt: Ein
Wort laeuft durch die verbleibenden Bereiche des Blocks (was in einem
entfernten Schnitt liegt, entfaellt) und wird danach durch das Tempo geteilt.
`freeze` haengt hinten an und verschiebt nichts.

## Zeilen

Eine Zeile waechst, solange sie zusammen hoechstens 32 Zeichen und hoechstens
2 s umfasst; sonst beginnt eine neue Zeile. Die Zeile laeuft vom Start des
ersten bis zum Ende des letzten Wortes, plus Blockversatz.

## ASS-Stil

Die Werte sind Richtwerte aus der Safe-Zone, keine Messwerte:

- Schriftgroesse: `round(hoehe * 0.045)`
- Rand unten: `round(hoehe * 0.12)`
- Ausrichtung 2 (unten mittig), Kontur 3

Als Schrift steht Arial im Stil; wer eine Hausschrift nutzt, ersetzt den
Namen. `{` und `}` werden zu `(` und `)`, damit sie keine ASS-Uebersteuerung
oeffnen; Zeilenumbrueche im Text werden `\N`.

## Brennen

Eine eigene ffmpeg-Stufe auf `main.mp4` zu `main-captions.mp4`, vor dem Outro:

```
ffmpeg -y -i main.mp4 -vf subtitles=<pfad> \
  -c:v libx264 -preset veryfast -crf 14 -pix_fmt yuv420p -c:a copy \
  main-captions.mp4
```

Der Pfad wird im Filter maskiert: Schraegstriche statt Backslashes, der
Doppelpunkt der Laufwerksangabe als `\:`, das Ganze in einfachen
Anfuehrungszeichen, etwa `subtitles='C\:/projekt/out/captions.ass'`. Ohne
Wortzeiten wird gewarnt und ohne Untertitel gerendert.
