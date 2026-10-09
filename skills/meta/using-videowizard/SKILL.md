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
2. **Passenden Planungs-Skill waehlen.** Fuer die Short-Kette:
   `reference-analysis` (Brief), `planning-short` (Beats und Hook),
   `storyboarding` (Shotliste und Freigaben). Er klaert Format, Dauer und
   Anbieterwahl und schreibt den Plan nach `project.json` und `plan.md`.
3. **Passenden Produktions-Skill waehlen.** Er fuehrt aus und nennt die
   Faehigkeiten; Werkzeugdetails stehen in den Tool-Skills. Ist die Version
   fertig und ein Mensch will nachschleifen: `handoff-to-diffusion`.

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

## Als MCP

Derselbe Bestand laeuft als MCP-Server: `npm --silent run mcp`. Er bietet elf
Werkzeuge: `doctor`, `status`, `ingest`, `transcribe`, `segment`, `voice`,
`music_adopt`, `music_generate`, `render`, `review` und `handoff`. Jedes
Werkzeug ruft denselben Befehl auf wie `vz` und liefert dessen Ausgabe zurueck.
