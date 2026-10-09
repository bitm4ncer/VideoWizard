---
name: handoff-to-diffusion
description: Use when a finished cut should be polished by a human in Diffusion Studio, or when a hand-off folder, its one-way rule and its limits must be understood.
---

# Hand-off nach Diffusion Studio

Der Hand-off ist fuer die Version, die ein Mensch in Diffusion Studio
feinschleifen will. `vz handoff <ordner>` erzeugt dafuer einen
Diffusion-Studio-Projektordner: je Block eine Szene, damit Bild, Ton und
Untertitel dort gemeinsam liegen und geschnitten werden koennen.

## Wann er faellig ist

- Die Version ist fertig: `vz render` laeuft durch und `vz review` meldet
  nur Gewolltes.
- Ein Mensch will nachschleifen: Timing, Textgroesse, Grading oder Effekte,
  die der Schnittplan nicht kennt.
- Diffusion Studio laeuft; der Zielordner gehoert nicht in einen
  Cloud-Sync-Ordner (DS-Doku).

Der Zielordner ist `handoff/diffusion-studio` im Projekt; `--out <pfad>`
legt ihn woandershin, `--force` ersetzt einen belegten Zielordner.

## Was mitkommt

- Je Block eine Szene; die erste Szene ist `active`, sonst oeffnet die App
  auf einer leeren Timeline.
- `take`-Bloecke: der Quellfilm, per `sourceIn`/`sourceOut` auf
  `source_in`/`source_out` getrimmt; der Quellton ist stumm, weil der
  Schnittplan ihn nicht uebernimmt.
- `still`-Bloecke: der extrahierte Frame als Bild, so lang wie die Stimme.
- TTS-Audio je Block als eigene Tonspur, sofern vertont.
- Captions aus den Wortzeiten, sofern die Quelle welche hat; fehlen sie,
  wird gewarnt und ohne Untertitel gebaut.

## Was v1 nicht mitkommt

- Overlays des Schnittplans.
- Musik und Outro.
- Fit-Schnitte der Sync-Logik: Pausenkuerzung, Tempo und Halte werden
  nicht reproduziert.

## Einweg

Nach dem Hand-off ist Diffusion Studio fuer dieses Projekt der Master;
`project.json` bleibt Schnittplan-Snapshot. Es gibt keinen Rueckweg: was
danach im Schnittplan passiert, wandert nicht in den DS-Ordner. Die App
stempelt beim Oeffnen eigene Felder; die gelieferten bleiben unberuehrt.

## Grenze

Live verifiziert (10.10.2026): Oeffnen, `check` ohne Befund sowie der Trim
und die Frames der `take`-Bloecke.
Nur quellcodegetestet, nicht in der App live geprueft: Standbilder der
`still`-Bloecke, Audio und Captions.
