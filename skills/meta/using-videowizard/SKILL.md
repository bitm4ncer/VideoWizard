---
name: using-videowizard
description: Use when starting VideoWizard work, when a video task arrives, or when it is unclear which planning or production skill applies.
---

# VideoWizard: Einstieg

Dieses Skill ist eine Weiche. Es arbeitet selbst nicht, es waehlt nur den
naechsten Schritt.

## Reihenfolge

1. **`vz doctor` laufen lassen.** Es meldet je Faehigkeit: vorhanden,
   automatisch installierbar, nur von Hand oder Schluessel noetig. Ein
   Workflow beginnt erst danach.
2. **Passenden Planungs-Skill waehlen.** Er klaert Format, Dauer, Beats, Hook
   und Anbieterwahl und schreibt den Plan nach `project.json` und `plan.md`.
3. **Passenden Produktions-Skill waehlen.** Er fuehrt aus und nennt die
   Faehigkeiten; Werkzeugdetails stehen in den Tool-Skills.

## Familien

| Familie | Planung | Produktion |
|---|---|---|
| Short | `planning-short` | `making-a-short` |
| Tutorial | spaeter | spaeter |
| Lyric | spaeter | spaeter |
| Animation | spaeter | spaeter |
| Kundenasset | spaeter | spaeter |

Heute gibt es nur die Short-Kette. Die uebrigen Familien folgen in spaeteren
Etappen; dieses Skill verspricht keinen Befehl, den es noch nicht gibt.

## Nachschlagen

- `reference/blocks`: fertige Bausteine, `blocks/index.json` und der
  Integritaetscheck.
- `reference/video-anatomy`: Beats, Formate, Lautheit.

Ein Projekt ist ein Ordner mit `project.json` als Wahrheitsdatei;
`vz status [ordner]` zeigt, ob dort eines liegt.
