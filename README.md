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

## Quickstart: vom leeren Ordner zum Video

Das Beispiel legt ein Projekt unter `C:\Videos\mein-short` an; `<repo>` ist
der Pfad dieses Repos. Die Aufrufe laufen aus jedem Arbeitsverzeichnis und
schreiben nur in den Projektordner: dort entstehen `project.json` als
Wahrheitsdatei und `sources/s01/` mit der normalisierten Aufnahme.

Zuerst liegt eine Aufnahme bereit: 9:16 (1080x1920), mit Sprache, etwa als
`C:\Videos\mein-short\recording.mp4`. Dann der Ablauf in dieser Reihenfolge:

    npm --prefix <repo> --silent run vz -- doctor
    npm --prefix <repo> --silent run vz -- ingest     C:\Videos\mein-short recording.mp4
    npm --prefix <repo> --silent run vz -- transcribe C:\Videos\mein-short s01
    npm --prefix <repo> --silent run vz -- segment    C:\Videos\mein-short s01
    npm --prefix <repo> --silent run vz -- voice      C:\Videos\mein-short
    npm --prefix <repo> --silent run vz -- music      C:\Videos\mein-short generate --prompt "ruhige Flaeche" --yes
    npm --prefix <repo> --silent run vz -- render     C:\Videos\mein-short --captions
    npm --prefix <repo> --silent run vz -- review     C:\Videos\mein-short

- `s01` ist die Kennung der ersten Quelle. `vz status <ordner>` zeigt in
  derselben Aufrufform jederzeit, welche Bloecke noch offen sind.
- `voice` braucht eine laufende Voicebox, `music` den ACE-Step-Server. Fehlt
  ein Dienst, den Schritt einfach weglassen; der Render laeuft auch ohne
  Musikbett.
- `transcribe` braucht Whisper. Ein `doctor --fix` gibt es noch nicht; das
  Werkzeug wird von Hand installiert, der Doctor zeigt den Zustand.
- Fuer den Feinschliff durch einen Menschen: `vz handoff <ordner>` erzeugt
  unter `handoff/diffusion-studio` ein Projekt fuer Diffusion Studio.

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
