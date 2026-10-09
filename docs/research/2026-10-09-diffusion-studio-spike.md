# Spike: Diffusion-Studio-Hand-off (Tauglichkeit fuer VideoWizard)

*Datum: 09.10.2026. Wegwerf-Aufbau, kein VideoWizard-Code. Umgebung: Diffusion
Studio Desktop 0.210.0 unter Windows, App laeuft, MCP-Verbindung zu OpenCode
aktiv (Server http://127.0.0.1:3274/mcp).*

## Frage

Kann ein von VideoWizard generierbares Projekt (ein Block als Szene,
`source_in/source_out` als `start/end`, Overlay-Text) in Diffusion Studio
geoeffnet, strukturell geprueft und wie ein Export gerendert werden?

## Aufbau

- Ordner `C:\Users\konta\AppData\Local\Temp\opencode\ds-spike\project` mit
  handgeschriebenem `index.tsx`: `<stage>` mit einer `<scene id="intro">`,
  darin ein `<video id="clip">` (absoluter Pfad) und ein `<text id="title">`
  (0,5 s bis 3,5 s).
- Testclip aus ffmpeg: testsrc2, 1280x720, 30 fps, 4 s, mit Sinuston.

## Durchfuehrung und Ergebnisse

1. **open** (MCP): Projekt geoeffnet; Rueckgabe `id ioum-Q57taP3ik1gejBv4`,
   `name project`. Die App legte selbst eine `package.json` an (projectId,
   `main: index.tsx`, Scripts, devDeps) und stempelte fehlende Element-IDs
   (unsere `<stage>` bekam `i3u0n3`); unsere expliziten IDs
   (`intro`, `clip`, `title`) blieben erhalten, die Quelle sonst unveraendert.
2. **check** (`id: "intro"`): 3 Knoten (scene, video, text), Dauer 4 s,
   **keine Befunde** (kein Schwarzbild, kein fehlender Quellpfad).
3. **capture** (Zeiten 0, 1,5, 3 s, `separate`): drei PNGs, jeweils der Frame,
   den ein Export encodieren wuerde.
   - t=0: Clip sichtbar, kein Text (Text beginnt bei 0,5 s). Richtig.
   - t=1,5: Clip plus "VideoWizard" sichtbar. Richtig.
   - t=3,0: Clip plus Text (Text endet bei 3,5 s). Richtig.
   - Bildpfade: `...\ds-spike\captures\0f.png`, `01s15f.png`, `03s.png`.

## Befunde fuer den Generator

- **Das Kern-Mapping traegt:** Block = Szene, Trim = `start/end`, Text-Overlay
  = `<text>` mit eigenen Zeitfenstern. Absolute Medienpfade funktionieren.
- **`textAlign="center"` wirkte ohne explizites `x` nicht:** der Text erschien
  links unten, obwohl `width` gesetzt war. Fuer `vz handoff` also `x` explizit
  setzen oder die Box korrekt aufspannen; in Etappe 7 verifizieren.
- **App muss laufen**, Projektordner nicht in Cloud-Sync-Ordnern (DS-Doku).
  Die CLI ist nicht noetig; MCP genuegt. Der CLI-Install-Knopf in den
  Einstellungen ist optional.
- `context` meldete `currentTime: null` (kein Playhead gesetzt); unkritisch.

## Restrisiken fuer Etappe 7 (noch nicht geprueft)

- `<audio>`-Mapping (TTS-Stimme, Musikbett) samt Startversatz.
- `<captions>` aus unseren Wortzeiten.
- Bibliothek (`assets.yml` + `assets/`) gegen absolute Pfade: fuer das
  Hand-off-Paket vermutlich Bibliothek besser, damit der Ordner portabel ist.
- Export-Einstellungen (`diffusion.export.<id>`) und Ausgabequalitaet.
- Einweg-Wahrheit dokumentieren: nach dem Hand-off ist DS fuer dieses Projekt
  der Master; `project.json` friert als Schnittplan-Snapshot ein.

## Urteil

**GO.** Das Hand-off-Mapping ist im Kern verifiziert: ein VideoWizard-foermiges
Projekt oeffnet, prueft sauber und rendert die richtigen Frames. Etappe 7
("Finish fuer Menschen": `vz handoff` plus Doku) kann geplant werden; die
ungeprueften Punkte oben werden dort verifiziert, nicht angenommen.
