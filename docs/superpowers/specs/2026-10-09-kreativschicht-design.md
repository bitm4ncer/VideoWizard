# Spezifikation: Kreativschicht fuer Kundenarbeit (Etappe 6)

*Stand: 09.10.2026. Im Dialog abgenommen. Ergaenzung zur Hauptspezifikation
vom 08.10.2026 (`2026-10-08-videowizard-design.md`); deckt Etappe 6 ab.*

## 1. Zweck

VideoWizard plant und produziert zuverlaessig, aber die kreative Front fehlte:
Ideenfindung, Referenzarbeit, Storyboarding und ein Treatment, das man Kunden
zeigen kann. Dazu fehlte die gemessene Nachschau nach dem Render. Diese Etappe
schliesst beides, zuerst fuer zwei Videoarten: Tutorials und Shorts aus echtem
Material sowie Kundenassets und Showreel.

Es gilt weiter alles aus der Hauptspezifikation: local-first, ein
Projektformat als Wahrheit, ein Renderer (ffmpeg), keine neue Abhaengigkeit,
keine Schemaaenderung.

**Herkunft.** Die Mechanismen stammen aus der externen Recherche vom
09.10.2026 (`docs/research/2026-10-09-externe-quellen.md`); uebernommen sind
Ideen, keine Dateien: die drei Check-ins und die Mess-Review aus `animate`,
Referenz-zu-Konzept und erzwungene Gates aus OpenMontage, Director-Pass und
Continuity aus ai-video-production-editor, die Shotlisten-Struktur aus
ai-video-storyboard-skill (frei neu geschrieben, dort fehlt ein LICENSE-File).

## 2. Storyboarding und Gates

### 2.1 Skill `planning/storyboarding`

Ein Auftrag: aus der abgenommenen Beat-Struktur eine Shotliste machen.

- **Shotliste**, 6 bis 18 Shots. Je Shot: Nummer, Zweck, Bildinhalt, Quelle
  (`aufnehmen` | `finden` | `generieren`), Text (falls on-screen),
  Audio beziehungsweise Voiceover-Zeile, Dauer.
- **Visuelles Thema:** Palette, Licht, Typografie, Motion, Do und Don't;
  wahlweise aus einer Style-Karte (Abschnitt 4).
- **Regeln:** erfindet nichts, fragt fehlende Angaben ab; keine
  Prompt-Heuristiken ohne Beleg; `SKILL.md` bleibt unter 500 Woertern, Tiefe
  darf nach `skills/planning/storyboarding/references/`.

### 2.2 Gates

Drei Freigaben vor dem teuren Bau: **Story** (Beats), **Look** (Visuelles
Thema), **Storyboard** (Shotliste). Protokoll in `plan.md`, Abschnitt
`Freigaben`, je Gate Status (`offen` | `freigegeben`) und Datum. Bei kurzen
Privatstuecken darf zusammengefasst werden; bei Kundenarbeit sind alle drei
Pflicht. Kein Schemafeld: Papier im `plan.md`, sichtbar fuer Menschen und
Agenten, keine Migration.

### 2.3 Entscheidungen

Abschnitt `Entscheidungen` im `plan.md`: je kreative Entscheidung hoechstens
drei Zeilen (Entscheidung, Alternative, Grund). Rohstoff fuer
`harvesting-learnings`, wenn sich ein Muster wiederholt.

## 3. Referenz-Analyse

Skill `planning/reference-analysis`. Auftrag: aus einem geliebten
Referenzvideo einen belastbaren Brief machen.

- Die Datei legt der Mensch lokal ab; kein Download, keine Weitergabe.
- Gemessen wird mit vorhandenen Mitteln in einem Wegwerf-Projekt
  (`vz ingest`, `vz transcribe`, `vz segment`, `ffprobe`): Wortrate, Pausen,
  Schnittstruktur, Hook-Zeitpunkt.
- Ergebnis `reference.md` im Zielprojekt: Messwerte, "das behalten / das
  aendern", zwei bis drei Konzepte mit Ein-Satz-Begruendung.
- **Grenze, ehrlich benannt:** Wortzeiten brauchen einen Transkript-Anbieter;
  das Whisper-Rezept ist nachgeschlagen, nicht gegengeprueft. Ohne Anbieter
  bleibt die Pausen- und Strukturmessung.

## 4. Treatment und Style-Karten

### 4.1 Baustein `blocks/scaffolds/client-asset`

`kind: "scaffold"`, `capability: "planning"`: Ordner mit einem
`plan.md`-Geruest und einer `project.json`-Vorlage. Das Geruest traegt die
Abschnitte Treatment, Visuelles Thema, Shotliste, Freigaben, Entscheidungen.
Der Treatment-Abschnitt (Ausgangslage, Zielgruppe, Kernbotschaft, Ton,
Referenzen, Anforderungen, Ausschluesse) ist fuer Kundendokumente geeignet.
Die Blockmechanik traegt mehrere Dateien je Eintrag: die entry-Datei besitzt
ihr Verzeichnis.

### 4.2 Style-Karten

Neue Blockart `kind: "style"` unter `blocks/styles/<name>/STYLE.md`: Palette,
Typografie, Motion, Grading, Regeln, Frame-Checkliste. Zwei Startkarten,
Vorschlag `clean-tutorial` und `bold-short`, selbst formuliert, MIT. Das
Storyboarding waehlt eine Karte als Visuelles Thema; Bausteine bleiben
unveraenderlich und versioniert.

## 5. `vz review`

Befehl `vz review <ordner>`, dazu ein MCP-Werkzeug. Er prueft die neueste
Ausgabe im Ausgabeordner des Projekts (`out/`) gegen den Plan:

| Pruefung | Messung |
|---|---|
| Format und Dauer | ffprobe gegen die Plan-Summe, Toleranz 0,5 s, im Bericht ausgewiesen |
| Tonspur | vorhanden oder nicht |
| Bild | Schwarz- und Standbildfenster (`blackdetect`, `freezedetect`), Schwelle 0,5 s beziehungsweise 2 s |
| Ton | integrierte Lautheit (`ebur128`) gegen `master_lufs`, Vorgabe -14, Toleranz 1 LU |
| Untertitel | `captions.ass` neben der Ausgabe vorhanden oder nicht |

Das Ergebnis schreibt der Befehl als `review.md` ins Projekt (Messwerte,
Befunde, Datum). Er **berichtet, er blockiert nicht:** Exit 0 auch mit
Befunden. Fehlt die Ausgabe oder scheitert ffprobe, gibt es eine klare
Meldung und Exit 1. Wiederkehrende Befunde gehen ueber `vz learn` in den
Lernloop; `making-a-short` bekommt den Schritt "Nachschau".

**Bewusst nicht in v1:** Szenenerkennung fuer tatsaechliche
Schnittzeitpunkte. Zu unzuverlaessig fuer ein Urteil; die Dauerpruefung und
die Schwarzbildsuche fangen die haeufigen Faelle. Die Schwellen sind erste
Werte und werden nach dem ersten echten Lauf als Learning nachgezogen.

## 6. Verdrahtung und Tests

- `planning-short` verweist auf `storyboarding`; `making-a-short` bekommt
  Gates und Nachschau; `using-videowizard` nennt die neuen Skills; der
  Katalog wird neu erzeugt.
- Tests: Skill-Struktur (Liste, description, Wortgrenze), Katalog
  byte-gleich, Baustein-Integritaet, `review` mit eingehaktem `run`
  (ffprobe- und ffmpeg-Ausgaben als Vorlagen), MCP-Werkzeugliste.
- Keine Schemaaenderung, keine neue Abhaengigkeit.

## 7. Entscheidungen

| Nr | Entscheidung | Begruendung | Verworfen |
|---|---|---|---|
| K1 | Gates als Papier in `plan.md` | keine Migration, fuer Menschen und Agenten sichtbar | Feld in `project.json` |
| K2 | Style als Blockart, nicht als Skill-Anhang | waehlbar, versioniert, reist mit dem Plugin | freier Fliesstext |
| K3 | `vz review` berichtet, blockiert nie | Beleg statt Behauptung; ein falsches Tor waere schlimmer | Render-Gate |
| K4 | Referenzmaterial nur lokal | Rechte und Kontrolle bleiben beim Menschen | automatischer Download |
| K5 | Shots im `plan.md`, nicht im Schema | keine Migration | `project.json`-Erweiterung |
| K6 | DS-Handoff nicht Teil dieser Etappe | eigener Spike am 09.10.2026 gruen; kommt als Etappe 7 | Handoff hier hineinquetschen |

## 8. Nicht in dieser Etappe

Diffusion-Studio-Handoff und FCPXML (Etappe 7), mehr Beat-Vorlagen,
Auto-Zoom, Recherche-Schritt, Whisper-Gegenpruefung.
