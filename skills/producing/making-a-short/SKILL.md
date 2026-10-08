---
name: making-a-short
description: Use when a planned short has to be produced, or when it is unclear which capability supplies transcript, voice, music, editing or captions.
---

# Einen Short produzieren

Die Produktion fuehrt den Plan aus. Sie denkt in **Faehigkeiten**, nicht in
Werkzeugen: welcher Anbieter liefert, steht in `project.json` unter
`capabilities`, und was fehlt, zeigt `vz doctor`.

## Ablauf

1. **Doctor.** `vz doctor` prueft vor jedem Lauf, welche Faehigkeiten
   abgedeckt sind. Ein fehlender Anbieter ist ein Zustand, kein Grund zu raten.
2. **Material.** Aufnahme einlesen oder ein visuelles Bett bauen; das Format
   kommt aus dem Projekt (9:16, 1080x1920).
3. **Transkript.** Aus der Aufnahme entsteht ein Transkript; es ist die
   Grundlage fuer Schnitt und Captions.
4. **Stimme.** Die Faehigkeit `voice` spricht den Text; heute gibt es dafuer
   noch keinen einsatzbereiten Anbieter, Stimm-Anbieter folgen in Etappe 3.
5. **Musik.** Die Faehigkeit `music` liefert den Klang; der Anbieter steht in
   `capabilities.music.provider`. Heute ist das `acestep`; Details in
   `tool-ace-step`.
6. **Schnitt und Captions.** Bloecke in Reihenfolge bringen, Betten ducken,
   Untertitel setzen; Rezepte und Komponenten kommen als Bausteine aus
   `reference/blocks`.
7. **Render und Verpacken.** Die Endmischung laeuft auf -14 LUFS, Rezept im
   Baustein `ffmpeg-loudnorm`; Details in `tool-ffmpeg`.

## Was es heute schon gibt

Die Doctor-Registry kennt nur `render` (ffmpeg) und `music` (acestep); der
ACE-Step-Anbieter steht hinter dem gemeinsamen Musik-Vertrag. **Einen
Render-Befehl gibt es noch nicht.** Ingest, Transkript, Bloecke, Stimme,
Captions und der vertikale Render kommen mit dem ffmpeg-Kern in **Etappe 2**.
Bis dahin beschreibt dieses Skill den Ablauf und die Faehigkeiten, keine
ausfuehrbaren Schritte.
