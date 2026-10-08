# VideoWizard: Leitfaden fuer Agenten

VideoWizard ist eine universelle Agenten-Suite fuer Videoarbeit: sie plant und
produziert Videos, Shorts, Tutorials, Animationen, Lyric-Videos und
Kundenassets und bindet die dafuer noetigen Werkzeuge konkret an. Wissen lebt
in Skills, Verlaesslichkeit im Kern. Die bindende Fassung steht in der
Spezifikation unter `docs/superpowers/specs/`.

## Ebenen

```
Ebene 0   Huellen       .claude-plugin/  .opencode/  .codex-plugin/  (duenn)
Ebene 1   Skills        portable SKILL.md (meta, planning, producing, tools)
Ebene 1b  Bausteine     fertige Artefakte + blocks/index.json, direkt ladbar
Ebene 2   Kern          CLI + MCP: Projekt, Doctor, Provider, Render
Ebene 3   Provider      ffmpeg, ace-step, voicebox, elevenlabs, cavalry, ae, ...
Ebene 4   Medien-Apps   native Programme, ueber Bruecken angesprochen
```

- Ebene 2 ist der einzige Motor. Sie laeuft nur dort, wo GPU und native
  Programme sind.
- Provider sind austauschbar: ein Workflow kennt nur die Faehigkeit.

## Fuenf Regeln gegen Chaos

1. **Ein Auftrag je Skill.** Passt eine zweite Aufgabe hinein, wird sie ein
   eigener Skill. Router-Skills waehlen nur aus, sie arbeiten nicht.
2. **Flache Namen, verb-first, kebab-case**, keine Klammern.
3. **`description` nennt nur den Ausloeser**, nie den Ablauf.
4. **`SKILL.md` bleibt kurz.** Tiefe kommt nach `references/`.
5. **Jede Tool-Karte hat fuenf Abschnitte:** Erkennen, Installieren,
   Einrichten, Benutzen, Grenzen, dazu der gemessene Stand mit Datum.

`docs/catalog.md` wird aus den Frontmattern erzeugt. Die Aufnahmeregeln fuer
neue Skills und Bausteine stehen in `docs/writing-guide.md`.

## Arbeitsweise

- `npm test` und `npm run typecheck` bleiben gruen. `npm run vz` ist der
  CLI-Einstieg.
- Kommentare und Commit-Nachrichten Deutsch, alles nach aussen Englisch.
- Keine Geviertstriche (U+2014), nirgends.
- Nichts ohne Zustimmung: kein Ueberschreiben, keine Installation, kein
  Upload. Alles idempotent.
