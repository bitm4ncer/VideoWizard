---
name: blocks
description: Use when a ready-made artifact is needed, when blocks/index.json or its fields must be read, or when block integrity must be checked.
---

# Bausteine

Bausteine sind fertige, selbsttragende Artefakte. Sie werden geladen und
parametrisiert, nicht nachgebaut. Sie liegen im Repo und reisen mit dem
Plugin, also sind sie auch dann da, wenn nur das Plugin installiert ist.

## Verzeichnis lesen

`blocks/index.json` ist ein JSON-Array. Jeder Eintrag hat neun Felder:

| Feld | Bedeutung |
|---|---|
| `id` | eindeutig, kebab-case; Skills nennen die `id`, nie einen Pfad |
| `kind` | Art, etwa `ffmpeg-recipe` oder `beat-template` |
| `capability` | Faehigkeit, die der Baustein bedient, etwa `render` |
| `purpose` | wofuer er da ist, in einem Satz |
| `inputs` | was er erwartet, etwa `["audio"]` |
| `requires` | `{ tools, providers }`, was vorhanden sein muss |
| `license` | weitergebbar: MIT, Apache-2.0, CC0, CC-BY |
| `version` | beginnt bei 1; jede Aenderung erhoeht sie |
| `entry` | Einstiegsdatei; ihr Verzeichnis besitzt der Baustein |

## Auswaehlen und laden

1. `blocks/index.json` lesen und ueber `kind`, `capability` und `purpose` den
   passenden Eintrag finden.
2. `requires` gegen `vz doctor` pruefen: fehlt ein Werkzeug oder Anbieter,
   zuerst klaeren.
3. Die `entry`-Datei und die Dateien ihres Verzeichnisses laden; nichts
   umbauen, nur einsetzen.
4. Fehlt etwas, wird gefragt oder ein Learning aufgenommen, nichts still
   ersetzt.

## Integritaet

`checkIntegrity` (in `src/lib/blocks.ts`) prueft in beide Richtungen: Jeder
Eintrag braucht seine `entry`-Datei, und jede Datei unter `blocks/` braucht
einen Eintrag; `blocks/index.json` selbst zaehlt nicht. Zurueck kommt eine
Liste von Meldungen, leer heisst in Ordnung. Die Ladefunktionen `loadIndex`
und `loadBlock` lesen nur, sie schreiben nie.

## Regeln

- Kein Baustein haengt vom Kern ab; gebrauchte Werkzeuge und Anbieter stehen
  in `requires`.
- Keine Duplikate: genau ein Ort je Baustein.
- Versioniert und unveraenderlich; Aenderungen erhoehen `version`.
