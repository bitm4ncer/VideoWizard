# VideoWizard Etappe 5 Implementation Plan: Improvement Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Belegarchiv fuer Erkenntnisse, ein Befehl, der Eintraege anlegt, und ein Skill, das Erkenntnisse einordnet und in Skills oder Bausteine ueberfuehrt. Dazu die Migrationskarte aus der VideoPipeline.

**Architecture:** `learnings/` ist ein datiertes Belegarchiv im Repo, kein Tagebuch. `vz learn` legt den Rahmen an; das Skill `harvesting-learnings` sagt, wohin eine Erkenntnis gehoert und wann sie eine Aenderung rechtfertigt. Aenderungen an Skills folgen der writing-skills-Disziplin.

**Tech Stack:** TypeScript, Node 22, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-videowizard-design.md` (Abschnitt 11)

## Global Constraints

- Keine Geviertstriche (U+2014), nirgends.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- `npm test` und `npm run typecheck` nach jeder Aufgabe gruen.
- NodeNext: relative Importe mit `.js`-Endung.
- Keine erfundenen Erkenntnisse: jeder Eintrag nennt Quelle und Beleg.
- Kein Eintrag wird ueberschrieben; belegte Erkenntnisse werden markiert, nicht geloescht.

## Review Focus

- `vz learn` mit leerem Titel oder ohne Titel: klare Meldung, kein Absturz.
- Ein schon vorhandener Eintrag zum selben Tag und Titel: nicht ueberschreiben.
- Ein Eintrag ohne Quelle: erlaubt, aber die Vorlage fragt danach.
- Die Migrationskarte nennt keine Faehigkeit, die es in VideoWizard nicht gibt, und keine, die als "uebertragen" gilt, obwohl sie fehlt.
- Das neue Skill bleibt unter 500 Woertern und nennt keinen Befehl, den es nicht gibt.

---

### Task 1: `vz learn` und das Belegarchiv

**Files:**
- Create: `src/lib/learnings.ts`, `src/commands/learn.ts`, `learnings/README.md`
- Modify: `src/cli.ts`
- Test: `tests/learnings.test.ts`, `tests/commandslearn.test.ts`

**Interfaces:**
- Produces: `learningPath(root, title, today): string` (Form `learnings/JJJJ-MM-TT-<slug>.md`), `renderLearning(entry): string`, `vz learn "<Titel>" [--source "<Quelle>"] [--note "<Beobachtung>"]`.

- [ ] **Step 1: Failing tests** (Faelle unten).
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: belegarchiv und vz learn`

## Die Vorlage des Eintrags (bindend)

```markdown
# <Titel>

*Angelegt: <ISO-Datum>*
*Quelle: <Quelle oder "eigene Beobachtung">*
*Status: offen*

## Beobachtung
<note oder Platzhalter>

## Beleg
<Platzhalter: Messung, Datei, Ausgabe>

## Ergebnis
<Platzhalter: was daraus folgt>

## Offene Frage
<Platzhalter>
```

## Die Faelle fuer die Tests

1. `learningPath` bildet Titel zu Kleinschreibung, Umlaute zu `ae/oe/ue`, alles andere zu Bindestrichen (Form `2026-10-09-ffmpeg-filter-apostroph.md`).
2. `renderLearning` setzt Titel, Datum, Quelle, Status `offen` und die vier Abschnitte.
3. `vz learn "<Titel>"` legt die Datei im Repo-Wurzelverzeichnis `learnings/` an, nennt den Pfad und ist Exit 0.
4. Ohne Titel: Nutzung und Exit 2.
5. Ein bereits vorhandener Pfad wird nicht ueberschrieben; es wirft mit dem Pfad.
6. `--source` und `--note` landen im Eintrag.

## Hinweise

- Die Repo-Wurzel kommt aus `repoRoot()` (`src/lib/brand.ts`).
- `deps` fuer Datum und Wurzel einhakbar, damit der Test nicht von der Uhr abhaengt.
- `learnings/README.md` erklaert kurz das Format und die Regel "markieren, nicht loeschen".
- Kommentare Deutsch, Bezeichner Englisch, keine Geviertstriche.

### Task 2: Skill `harvesting-learnings`

**Files:**
- Create: `skills/meta/harvesting-learnings/SKILL.md`
- Create: `learnings/2026-10-09-ffmpeg-filter-pfad-apostroph.md` (erster echter Eintrag)
- Modify: `docs/catalog.md`, `tests/skills.test.ts`
- Test: `tests/skills.test.ts`, `tests/catalog.test.ts`

- [ ] **Step 1: Tests zuerst**: die feste Skill-Liste um `harvesting-learnings` ergaenzen; erwartet FAIL.
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Schreiben.** Das Skill nennt: wann eine Erkenntnis einen Eintrag verdient, wie die Einordnung laeuft (welchem Skill, welchem Baustein, welchem Provider), wann sie eine Aenderung rechtfertigt, und dass Skill-Aenderungen der writing-skills-Disziplin folgen (erst das fehlschlagende Szenario). Der **erste echte Eintrag** ist die Apostroph-Erkenntnis aus Etappe 2b, mit Quelle, Messung und Ergebnis. Katalog erzeugen.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: skill fuer die erkenntnispflege`

### Task 3: Migrationskarte aus der VideoPipeline

**Files:**
- Create: `docs/migration-map.md`
- Modify: `README.md`
- Test: `tests/hulls.test.ts` erweitern

- [ ] **Step 1: Failing test**: `docs/migration-map.md` existiert, nennt die drei Zustaende (`uebertragen`, `offen`, `bewusst nicht`) und den Pfad der VideoPipeline; jede genannte VideoWizard-Faehigkeit existiert (Befehl oder Skill).
- [ ] **Step 2: Tests laufen lassen**, erwartet FAIL.
- [ ] **Step 3: Schreiben.** Eine Tabelle: VideoPipeline-Faehigkeit, VideoWizard-Entsprechung (Skill, Befehl, Provider), Zustand, Beleg. Ehrlich: was fehlt (Cavalry, AE, Remotion, Szenen-Karten, Auto-Zoom) steht als `offen`, absichtlich Verworfene als `bewusst nicht`. `README.md` bekommt einen Verweis.
- [ ] **Step 4: Tests laufen lassen**, erwartet PASS, dazu `npm test`, `npm run typecheck`.
- [ ] **Step 5: Commit** `docs: migrationskarte aus der videopipeline`

## Entscheidungen fuer diese Etappe

- **`learnings/` liegt im Repo**, nicht im Projekt. Erkenntnisse gehoeren dem Werkzeug, nicht einem Video.
- **Ein Eintrag wird nie ueberschrieben.** Eingearbeitete Eintraege bekommen `Status: eingearbeitet`, geloescht wird nichts.
- **Die Migrationskarte ist Dokument, kein Code.** Sie wird von Hand gepflegt und ehrlich gehalten.

## Nicht in dieser Etappe

- Kein automatisches Einarbeiten (das bleibt ein Skill und eine bewusste Handlung).
