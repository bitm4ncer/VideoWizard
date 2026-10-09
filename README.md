# VideoWizard

VideoWizard ist eine universelle Agenten-Suite fuer Videoarbeit. Sie plant und
produziert Videos, Shorts, Tutorials, Animationen, Lyric-Videos und
Kundenassets und bindet die dafuer noetigen Werkzeuge konkret an. Das Wissen
lebt in tragbaren Skills, die Verlaesslichkeit im Kern aus CLI und MCP-Server.

## Loslegen

Voraussetzung ist Node 22 oder neuer.

    npm install
    npm --silent run vz -- doctor

Der Doctor prueft, welche Faehigkeiten abgedeckt sind, und meldet je
Faehigkeit einen Zustand. Den MCP-Server startet:

    npm --silent run mcp

Das `--silent` ist Pflicht; ohne es schreibt npm sein Banner nach stdout und
zerbricht den JSON-RPC-Strom. Die Einrichtung fuer Claude Code, OpenCode und
Codex steht in `docs/install.md`.

## Etappenlage

Etappen 1 bis 3 sind fertig: Geruest, Projektformat, Doctor und Bausteine, der
ffmpeg-Kern (ingest, Transkript, Bloecke, Stimme, Musik, Render) und weitere
Anbieter. Etappe 4 (MCP-Server und Huellen fuer Claude Code, Codex und
OpenCode) ist fertig. Etappe 5 (Improvement Loop) folgt.
