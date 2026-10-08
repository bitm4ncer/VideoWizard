# Aufnahmeregeln (Writing Guide)

Diese Regeln gelten fuer alles, was neu ins Repo aufgenommen wird. Sie halten
den Katalog klein, lesbar und portabel. Die verbindliche Fassung steht in der
Spezifikation, Abschnitte 5 und 6.

## Neuer Skill

Ort: `skills/<gruppe>/<name>/SKILL.md` mit den Gruppen `meta`, `planning`,
`producing`, `tools` und `reference`.

Checkliste:

- [ ] **Ein Auftrag.** Der Skill tut genau eine Sache. Passt eine zweite
      Aufgabe hinein, wird sie ein eigener Skill. Router-Skills waehlen nur
      aus, sie arbeiten nicht.
- [ ] **Frontmatter.** `name` und `description` sind vorhanden. `name` ist
      flach, verb-first, kebab-case, ohne Klammern, und entspricht dem
      Ordnernamen.
- [ ] **`description` nennt nur den Ausloeser.** Sie beginnt mit "Use when"
      und beschreibt nie den Ablauf.
- [ ] **Laenge.** `SKILL.md` bleibt unter 500 Woertern. Tiefe kommt nach
      `references/`.
- [ ] **Tool-Karten** haben fuenf Abschnitte: Erkennen, Installieren,
      Einrichten, Benutzen, Grenzen, dazu der gemessene Stand mit Datum.

Beispiel-Frontmatter:

```yaml
---
name: planning-short
description: Use when planning a short video for Reels, Shorts or TikTok
---
```

`docs/catalog.md` wird aus diesen Frontmattern erzeugt und nie von Hand
gepflegt.

## Neuer Baustein

Bausteine sind fertige, selbsttragende Artefakte. Sie werden ausgewaehlt und
parametrisiert, nicht nachgebaut.

Checkliste:

- [ ] **Eintrag in `blocks/index.json`** mit den Pflichtfeldern:
      - `id`: eindeutig, kebab-case; Skills nennen die `id`, nie einen Pfad.
      - `kind`: Art des Artefakts, zum Beispiel `remotion-component` oder
        `ffmpeg-recipe`.
      - `capability`: die Faehigkeit, die der Baustein bedient, zum Beispiel
        `captions`.
      - `license`: nur weitergebbare Lizenzen (MIT, Apache-2.0, CC0, CC-BY).
        Schriften und Medien werden gesondert geprueft.
      - `version`: beginnt bei 1; jede Aenderung erhoeht sie.
      - `entry`: Pfad zur Einstiegsdatei.
- [ ] **Selbsttragend.** Kein Baustein haengt vom Kern ab. Braucht er ein
      Werkzeug oder einen Dienst, steht das in `requires`.
- [ ] **Genau ein Ort.** Keine Duplikate; der Integritaetscheck stellt sicher,
      dass jede Datei unter `blocks/` einen Eintrag hat und umgekehrt.
- [ ] **Getestet, wo pruefbar.** ffmpeg-Rezepte und Remotion-Komponenten haben
      Tests; reine Vorlagen haben eine Sichtpruefung.

Zur Erinnerung: Ein Baustein ist das **Was** (fertiges Artefakt), ein Skill das
**Wie und Warum** (Auswahl, Regeln, Ablauf).
