---
name: storyboarding
description: Use when an approved beat structure should become a shot list, or when a video plan needs its visual theme and gates recorded.
---

# Storyboarding

Ein Auftrag: aus der abgenommenen Beat-Struktur eine Shotliste machen. Ist die
Beat-Struktur noch nicht abgenommen, wird zuerst das Gate **Story** geklaert.
Die Arbeit **erfindet nichts**: fehlt eine Angabe (Motiv, Ort, Sprecher,
Marke), wird gefragt, nicht geraten.

## Shotliste

6 bis 18 Shots. Je Shot:

| Feld | Inhalt |
|---|---|
| Nummer | laufend, 1 bis n |
| Zweck | welche Beat-Aufgabe der Shot traegt |
| Bildinhalt | was zu sehen ist, in einem Satz |
| Quelle | `aufnehmen`, `finden` oder `generieren` |
| Text | nur falls on-screen, sonst leer |
| Audio | Voiceover-Zeile oder Tonangabe |
| Dauer | in Sekunden |

Die Summe der Dauern passt zur Beat-Struktur; Abweichungen werden begruendet,
nicht verschwiegen. Ein Shot, dessen Quelle `aufnehmen` ist, braucht Ort und
Termin oder einen offenen Punkt.

## Visuelles Thema

- **Palette**, **Licht**, **Typografie** und **Motion**: je ein klarer Wert,
  keine Sammlung von Moeglichkeiten.
- Ein **Do** und ein **Don't**, die als Regel taugen.
- Wahlweise aus einer Style-Karte `blocks/styles/<name>`, sonst frei
  formuliert. Eine gewaehlte Karte wird genannt, nichts still gemischt.

## Freigaben

Drei Gates vor dem teuren Bau:

| Gate | Gegenstand |
|---|---|
| Story | Beats |
| Look | Visuelles Thema |
| Storyboard | Shotliste |

Je Gate: Status `offen` oder `freigegeben` und Datum. Bei kurzen
Privatstuecken darf zusammengefasst werden; bei Kundenarbeit sind alle drei
Pflicht. Der teure Bau beginnt erst nach den Freigaben.

## Entscheidungen

Je kreative Entscheidung hoechstens drei Zeilen: Entscheidung, Alternative,
Grund. Keine Prompt-Heuristiken ohne Beleg; was gemessen ist, steht als Zahl
dabei.

## Ergebnis

Shotliste, Visuelles Thema, Freigaben und Entscheidungen landen als Abschnitte
in `plan.md`. Der Plan bleibt die Wahrheit fuer die Produktion.
