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

Etappen 1 bis 8 sind fertig: Geruest, Projektformat, Doctor und Bausteine, der
ffmpeg-Kern (ingest, Transkript, Bloecke, Stimme, Musik, Render) und weitere
Anbieter. Etappe 4 brachte den MCP-Server und die Huellen fuer Claude Code,
Codex und OpenCode, Etappe 5 den Improvement Loop; die Migrationskarte aus der
VideoPipeline steht in `docs/migration-map.md`. Etappe 6 ist die
Kreativschicht fuer Kundenarbeit (Storyboarding mit Gates, Referenz-Analyse,
Style-Karten, `vz review`), Etappe 7 der Einweg-Hand-off nach Diffusion Studio
fuer den menschlichen Feinschliff. Etappe 8 macht den Hand-off fit-treu
(Schnittfenster, Haltebilder, Captions auf der Ausgangsachse) und schliesst
die Etappenfolge ab.
