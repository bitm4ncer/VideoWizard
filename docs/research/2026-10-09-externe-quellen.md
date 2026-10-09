# Externe Quellen fuer VideoWizard

*Stand: 09.10.2026. Recherche-Agent (Subagent), keine Umsetzung. Alle Aussagen
unten wurden am 09.10.2026 per Web-Abruf bzw. GitHub-API geprueft; nichts wurde
lokal installiert oder ausgefuehrt. Wo nur eine Landingpage lesbar war, steht
das ausdruecklich dabei.*

**Gelesener VideoWizard-Stand:** `README.md`, `docs/superpowers/specs/2026-10-08-videowizard-design.md`,
`docs/catalog.md`, `docs/migration-map.md`, alle 11 `skills/**/SKILL.md`,
`blocks/index.json`, `src/commands/` (doctor, ingest, learn, music, render,
segment, status, transcribe, voice), `learnings/` (2 Dateien).

**Verdikt-Konvention:**
`nutzen` = Muster/Inhalt direkt uebernehmen und anpassen lohnt.
`lernen` = Ideen entnehmen, keine direkte Uebernahme.
`ignorieren` = kein Handlungsbedarf.
`unerreichbar` = nicht lesbar.

**Randbedingungen aus dem Auftrag (bindend):** kein zweiter Render-Engine-Pfad,
kein Cloud-Lock-in, kein Monolith. Kein Vorschlag unten verletzt sie.

---

## 1. Quellen im Einzelnen

### 1.1 Claude-Artifact BYH6Mcma5to3kt2KogkEzB

**Was es ist:** nicht feststellbar. Der Link laedt ohne Anthropic-Session nur
die Artifact-Huelle; der eigentliche Inhalt kommt per `/api/frame/<uuid>` mit
Login. Ich habe zweimal abgerufen (Markdown/Text und HTML); sichtbar wurde nur
die leere Shell mit dem Hinweis "Content is user-generated and unverified."

**Was es gut kann:** unbekannt.
**Was es nicht kann:** ohne Login nichts - auch das Thema ist nicht erkennbar.
**Lizenz/Reife:** unbekannt.
**Verdikt: unerreichbar** - Login-Wall; Inhalt nur ueber den Auftraggeber
(z. B. als Datei oder Textkopie) zu bekommen.

### 1.2 Rubric (getrubric.app)

**Was es ist:** Marketing-Landingpage eines Dashboards ("The command centre for
AI agents", RoboLabs), verteilt ueber die Skool-Community RoboNuggets. Zehn
Panels: Scaffold, Icons, Flows (Workflow-Player), Skill Trees (Capability-Graph),
Agents, Crons, Generations, Docs, Links, Sprints. Installation per
Copy-paste-Prompt in einen Coding-Agent; "0 npm dependencies".

**Was es gut kann:** durchgaengig dateibasierte, agentenlesbare Strukturen;
Flows-Visualisierung und Skill-Graph sind als Idee sauber.
**Was es nicht kann:** alles davon ist Agenten-Betrieb, nichts ist Video. Kein
oeffentliches Repo gefunden, keine Lizenz sichtbar, Zugang hinter Community-
Mitgliedschaft; Features daher nicht verifizierbar.
**Lizenz/Reife:** unbekannt (Community-Gate); nur die Landingpage lesbar.
**Verdikt: ignorieren** - kein Bezug zur kreativen Luecke; waere eine weitere
Oberflaeche, die VideoWizard bewusst nicht hat.

### 1.3 HyperFrames (heygen-com/hyperframes)

**Was es ist:** HeyGen-Projekt, "Write HTML. Render video. Built for agents."
Offenes Monorepo (Bun/TypeScript), Kompositionen als HTML/CSS/GSAP mit
deterministischem Seek-Rendering (Headless-Browser/Puppeteer + ffmpeg), CLI
(`npx hyperframes lint|check|render`), SDK, Player, Studio-App (HeyGen-Login),
optionale Cloud-Renderpfade, Block-Registry und eine sehr grosse Doku (394
Katalog-Seiten) inkl. Prompt-Guide, Motion-Regeln ("motion that reads
premium"), Design-System-Anbindung und Remotion-Migrationsguide.

**Was es gut kann (verifiziert: Doku gelesen):** Determinismus als Vertrag;
Agent-Skills als versioniertes Plugin; Storyboard-Prompting ("nicht Szene fuer
Szene prompten, sondern den Plan"); umfangreiche visuelle Vokabulare.
**Was es nicht kann:** aus VideoWizard-Sicht ist es eine zweite Render-Engine;
Studio-App ans HeyGen-Konto gebunden; ich habe nichts gerendert, nur Doku.
**Lizenz/Reife:** Apache-2.0; 59,5k Stars, 5,3k Forks, 215 offene Issues, sehr
aktiv (Push am 09.10.2026), angelegt 03/2026.
**Verdikt: lernen** - Doku und Konzepte ja, Engine nein (Kernentscheidung
"ein Render-Plan").

### 1.4 Tella (tella.com)

**Was es ist:** kommerzieller SaaS-Screen-Recorder + AI-Editor (Mac, Windows,
Chrome, Web). Auto Cut (Silence, Filler, Fehler), Auto Zoom aus Klicks und
Cursorbewegungen (100-350 %, editierbar), Auto Layouts, Studio Voice, LUTs und
Farbfilter, Hosting-Link + Analytics, MP4 bis 4K60; Public API und MCP-Server.
Preise: 13-19 USD/Nutzer/Monat jaehrlich, kein dauerhaftes Free.

**Was es gut kann (verifiziert: Herstellerseiten/llms-Text):** Auto-Zoom aus
Aufzeichnungsmetadaten; Transkript-basiertes Schneiden; Loom-Import.
**Was es nicht kann:** lokal laufen; alles haengt am Konto/Cloud-Hosting;
Auto-Zoom funktioniert nur mit den eigenen Aufzeichnungsdaten. Ich habe das
Produkt nicht getestet.
**Lizenz/Reife:** proprietaer, kommerziell etabliert (Stand 09/2026).
**Verdikt: lernen** - bestaetigt Auto-Zoom und Transkript-Schnitt als
Richtungen (Auto-Zoom steht in `docs/migration-map.md` ohnehin als `offen`);
als Produkt Cloud-Lock-in und damit keine Uebernahme.

### 1.5 cth9191/animate

**Was es ist:** Claude-Code-Plugin/Skill (MIT), das kurze Animationen als
einseitige Canvas-Stuecke in Code erzeugt (Playwright/Chromium + ffmpeg).
Kernmechanik: Intake, dann drei billige Check-ins **vor** dem teuren Bau
(1. Story-Check als Beat-Tabelle, 2. Look-Check mit 2-4 Style-Frames,
3. Storyboard mit jeder Beat als Keyframe). Stile sind Plug-ins
(`STYLE.md` + `kit.js` + Frame-Checkliste); Story-Grammatik mit 8 Formaten;
Review misst (Schnitte auf Beat-Raster, Story-Arc-Loudness, Text abgeschnitten/
ueberlappend, lautester Moment nach der Stille); Voice mit faster-whisper-
Wortzeiten; Musik-Beat-Map; deterministisch (Seed), ehrliche
"proven/unproven"-Liste je Format.

**Was es gut kann (verifiziert: README + SKILL.md gelesen):** Prozessdisziplin
(erst billig genehmigen, dann bauen); Style als austauschbares Plug-in;
Messwerte statt "sieht gut aus"; Learn-Regel je Lauf.
**Was es nicht kann:** fremder Renderpfad (Canvas/Headless-Chromium) - fuer
VideoWizard eine zweite Engine; Inhalte an Canvas gebunden und englisch.
**Lizenz/Reife:** MIT. Angelegt 04.10.2026, letzter Push 05.10.2026, 10
Commits, 252 Stars an Tag 5 - strukturell durchdacht, aber sehr jung
(Hype-Traktion, keine Reife).
**Verdikt: nutzen** - Gates, Style-Karten-Kontrakt und Review-Checks direkt als
Muster uebernehmen; Code/Engine nicht.

### 1.6 poseljacob/agentic-video-editor

**Was es ist:** MIT-CLI (Python) `ave edit`: Rohmaterial + Creative Brief ->
Szenenerkennung/Transkription -> Director (Gemini) waehlt Shots und schreibt
einen EditPlan -> Trim Refiner -> Editor (FFmpeg/MoviePy) -> Reviewer bewertet
5 Dimensionen (Adherence, Pacing, Visual Quality, Watchability, Overall) auf
0-1; unter Schwelle geht Feedback an den Director, Retries als `_vN.mp4`.
Pipelines und Style-Templates als YAML (z. B. DTC-Testimonial: Hook, Problem,
Solution, Social Proof, CTA). Web-UI ausdruecklich pre-alpha.

**Was es gut kann (verifiziert: README gelesen):** der explizite
Review-Score-Loop mit Schwelle und Feedback; versionierte Retries.
**Was es nicht kann:** ohne Google-Key laeuft nichts; Python/Gemini-Stack;
Web-UI pre-alpha. Reife: 6 Commits, alle am Tag der Anlage 14.04.2026, seither
keine Aenderung - 496 Stars auf ein Ein-Tag-Projekt, faktisch eingefroren.
Qualitaetsaussagen nicht nachpruefbar (nicht ausgefuehrt).
**Lizenz/Reife:** MIT; verlassen.
**Verdikt: lernen** - Reviewer-Loop als Muster; Code tot.

### 1.7 calesthio/OpenMontage

**Was es ist:** AGPL-3.0, Python+Node. "Agentic video production system":
12 Pipelines, 100+ Tools, 700+ Skill-/Wissensdateien. agent-first (der
Coding-Assistent IST der Orchestrator; YAML-Pipeline-Manifeste + Stage-Director-
Skills). Bemerkenswerte Mechanismen: Start von einem Referenzvideo (Transkript,
Pacing, Szenen, Stil -> 2-3 differenzierte Konzepte + Kostenschaetzung);
Backlot-Board als visuelles Genehmigungs-Gate (Storyboard-Approval vor
Asset-Generierung, Pausen bei kreativen Gates); Provider-Auswahl mit
7-Dimensionen-Scoring und Decision-Audit-Trail; Delivery-Promise- und
Slideshow-Risiko-Pruefung vor dem Compose; Post-Render-Self-Review (ffprobe,
Frames, Audio-Pegel, Untertitel); Budget-Governance; Web-Recherche als erste
Pipeline-Stufe; Remotion und HyperFrames als Compose-Engines.

**Was es gut kann (verifiziert: README gelesen):** Gates erzwingen statt
vorschlagen; kreative Entscheidungen mit Alternativen protokollieren;
Qualitaet messen statt behaupten; Referenzvideo-zu-Plan.
**Was es nicht kann (fuer VideoWizard):** als Ganzes nicht tragfaehig -
Python-Monolith, zwei Compose-Engines, 60+ Provider, AGPL-3.0 in einem
privaten/verteilbaren Produkt; 393 offene Issues; Score-Qualitaet nicht selbst
geprueft.
**Lizenz/Reife:** AGPL-3.0; 65,7k Stars, 8,3k Forks, 455 Commits, sehr aktiv
(Push 03.10.2026), angelegt 03/2026.
**Verdikt: lernen** - Ideen ja (Referenz-Analyse, Gates, Self-Review,
Entscheidungslog), Code nein.

### 1.8 LangGraph (langchain-ai/langgraph)

**Was es ist:** MIT-Framework von LangChain fuer zustandsbehaftete
Agenten-Graphen: Checkpointing/Persistenz, Human-in-the-loop-Interrupts,
Streaming, Multi-Agent-Topologien; Python-first (JS-Port vorhanden). Webseite
bewirbt Kontrolle und Zuverlaessigkeit; LangSmith-Plattform kostenpflichtig
drumherum.

**Was es gut kann (verifiziert: Produktseite + API-Daten):** reife, weit
verbreitete Orchestrierungs-Primitive; Interrupt/Checkpoint-Konzept solide.
**Was es nicht kann:** keine kreative Luecke schliessen; bringt eine zweite
Orchestrierungsschicht unter VideoWizards Harness+Skills+MCP und eine
Python-Dependency.
**Lizenz/Reife:** MIT; seit 2023, 43k Stars, sehr aktiv.
**Verdikt: ignorieren** - VideoWizard hat bewusst kein orchestrierendes
Framework; das Harness ist der Orchestrator. Gate-Muster gibt es billiger
(P2) ohne Dependency.

### 1.9 LudwigKienle/ai-video-production-editor

**Was es ist:** GPL-3.0 Desktop-Studio (Electron + React + TypeScript),
lokal-first, BYO-Keys. Produktionsschleife: Skript -> Director-Pass
(Skript -> Shotliste mit kinematografischer Richtung) -> Concept/Casting ->
Storyboard (Aspect, Kamera/Objektiv/Director-Persona je Shot) -> AI-Filming ->
Continuity-Review -> Re-Film-Queue -> Edit/Color/Fairlight/Deliver. Dazu
Moodboard-Canvas, 3D-Previs, Knowledge-Graph, Offline-Auto-Cut (Silence/Scene/
Filler), LUTs, Scopes.

**Was es gut kann (verifiziert: README gelesen):** "Director-Pass" als eigener
Schritt; Storyboard mit expliziten Kamera-/Lens-/Persona-Feldern;
Continuity-Review mit Re-Film-Queue; Moodboard als Artefakt.
**Was es nicht kann (fuer VideoWizard):** als Codebasis ungeeignet (GPL,
Desktop-Monolith, andere Zielplattform); Generierungsqualitaet nicht geprueft.
**Lizenz/Reife:** GPL-3.0; 63 Stars, 11 Forks, 55 Commits, aktiv (Push
08.10.2026), angelegt 05/2026.
**Verdikt: lernen** - Prozess- und Felddesigns uebernehmen (Director-Pass,
Continuity-Check, Kamerafelder); Code nicht.

### 1.10 aicontentskills/ai-video-storyboard-skill

**Was es ist:** SKILL.md (+ 1 Beispiel) fuer Claude Code/Cursor/Windsurf: Brief
-> Multi-Shot-Storyboard (6-18 Shots) mit "Visual Theme"-Block (Palette,
Licht, Lens, Filmlook, Motion), je Shot Zweck/Komposition/Kamera/Licht/Subject/
Action/Prompt/Audio, Narrativmustern (Hook/Build/Payoff/CTA;
Problem/Solution/Proof/CTA; Atmosphere->Climax), Post-Produktions-Checkliste
und "Why this works"-Begruendung.

**Was es gut kann (verifiziert: SKILL.md gelesen):** genau die fehlende
Struktur (Shotliste + visuelle Konsistenz + Prompt-Felder); gute Gliederung,
leichte deutsche Neufassung moeglich.
**Was es nicht kann:** Prompt-Heuristiken sind ungemessen ("immer 'cinematic
1080p, synchronized audio' anhaengen"); SKILL.md verweist auf
`references/shot-types.md` usw., die im Repo fehlen (nur SKILL.md und
`examples/` vorhanden); README verspricht vier Beispiele, eins ist da.
**Lizenz/Reife:** README sagt MIT, aber **kein LICENSE-File** (GitHub-API:
`license: null`). Reife: 2 Commits am 09.04.2026, seither keine Aenderung,
62 Stars.
**Verdikt: nutzen** (mit Lizenzvorbehalt) - Inhalt als Vorlage sofort
brauchbar; vor woertlicher Uebernahme LICENSE klaeren oder komplett neu
schreiben.

---

## 2. Redundanzpruefung

Je Quelle: was VideoWizard schon hat, das ueberlappt.

1. **Artifact** - keine Pruefung moeglich (unerreichbar).
2. **Rubric** - keine fachliche Ueberlappung; vage Aehnlichkeit nur zu
   `vz status`/`docs/catalog.md` als Uebersichtsflaeche, anderer Zweck. Pure
   Nicht-Anwendung, kein Ersatz fuer irgendetwas Bestehendes.
3. **HyperFrames** - ueberlappt mit geplanten Supplier-Slots: `blocks/remotion/`
   (Karten/Overlays/Captions) und `blocks/cavalry|after-effects` (Bewegung),
   ausserdem mit `vz render`/ffmpeg-Kern (Endschnitt) und `blocks/ffmpeg/captions`
   (Untertitel). Fuer das Bestehende kein Ersatz noetig; nur die Doku-Ideen
   sind neu.
4. **Tella** - Auto Cut ueberlappt teils mit `vz segment` (Pausen; Tella kann
   zusaetzlich Filler/Klicks), Auto-Zoom steht als `offen` in
   `docs/migration-map.md` (aus VideoPipeline Phase 5), Captions mit
   `vz render --captions` + `ffmpeg-captions`, Ducking/Loudness mit
   `vz render` + `ffmpeg-loudnorm`, Recording mit der geplanten OBS-Faehigkeit.
   Hosting/Analytics haben keine Entsprechung - bewusst.
5. **animate** - Beats ueberlappen mit `planning-short`, `video-anatomy` und
   `beats-short-retention`; Captions mit `ffmpeg-captions`; Learn-Log mit
   `vz learn` + `harvesting-learnings`; der Renderer ueberlappt funktional mit
   `vz render`, technisch fremd. Keine Entsprechung: die drei Check-ins und die
   gemessene Nachschau - das ist die Luecke.
6. **agentic-video-editor** - Pipeline ueberlappt mit `making-a-short`; Szene/
   Transkription mit `vz ingest/transcribe/segment`; Render mit `vz render`;
   Style-YAML mit kuenftigen `blocks/beats`. Der Reviewer hat keine
   Entsprechung; `vz render` verweigert nur unvollstaendige Bloecke/Overflow -
   schwacher Teil-Ersatz.
7. **OpenMontage** - ueberlappt fast flaechendeckend: Pipelines≈Workflows+Skills,
   Tools/Provider≈`capabilities`+Provider, Qualitaets-Gates≈Render-
   Verweigerungen, Style-Playbooks≈kuenftige Blocks, Decision-Log≈`learnings`,
   Budget≈`--yes`-Freigaben. Neu darin: Referenzvideo-Analyse, Backlot-UI,
   Provider-Scoring, Slideshow-Risiko, Web-Recherche-Stufe.
8. **LangGraph** - reine Funktionsueberlappung mit der Orchestrierung, die
   VideoWizard absichtlich dem Harness + den Skills ueberlaesst. Kein
   fachlicher Mehrwert.
9. **LudwigKienle** - Storyboard/Treatment ueberlappen mit dem geplanten, nicht
   gebauten `planning/storyboarding`; Auto-Cut teils mit `vz segment`;
   Moodboard/3D/Edit-Seiten/Bibliothek haben keine Entsprechung (Spec: keine
   eigene UI). Neu als Konzept: Director-Pass, Continuity-Review,
   Kamera-/Lens-Felder.
10. **aicontentskills** - Retention-Muster teilweise in `planning-short`/
    `video-anatomy` vorhanden (Hook/Confirm/Payoff/CTA), aber ohne Shotliste,
    visuelles Thema und Prompt-Bausteine (letztere als `blocks/prompts/`
    geplant). Der Hauptinhalt ist nicht redundant.

---

## 3. Pitches (nach erwartetem Wert sortiert)

### P1 - `planning/storyboarding`: Shotliste plus visuelles Thema *(neu; Taxonomie geplant, Inhalt fehlt)*

**Idee:** Das in der Spec geplante, aber nicht gebaute Skill liefert nach der
Beat-Freigabe eine Shotliste (6-18 Shots) mit Zweck, Komposition, Kamera,
Licht, Handlung, Dauer und einem "Visuelles Thema"-Block (Palette, Licht, Lens,
Motion, Do/Don't), dem jeder Shot folgen muss; Ergebnis in `plan.md`.
**Quellen:** aicontentskills (Struktur, MIT-Vorbehalt), LudwigKienle
(Kamera-/Lens-/Persona-Felder, Director-Pass), animate (Beat-Tabelle,
Check-ins).
**Was sich aendert:** neues Skill `skills/planning/storyboarding`; neue
Referenz `skills/reference/shot-language` (Einstellungsgroessen, Kamerabewegung,
Lichtvokabular - selbst formuliert); optional ein Beat-Template (P6).
**Wirkung:** schliesst die zentrale Luecke - Story und Look sind vor jeder
Generierung konkret und einzeln pruefbar.
**Kosten/Risiken:** ca. 1-2 Tage Textarbeit, keine Dependencies. Risiko:
Skill-Wildwuchs; an "ein Skill, ein Auftrag" und die 500-Woerter-Regel halten,
deutsche Neufassung statt Copy.

### P2 - Check-in-Gates Story → Look → Storyboard als Protokoll *(neu; Prinzip in Spec §2.5 vorhanden)*

**Idee:** Drei billige Freigaben vor dem teuren Bau, festgehalten in `plan.md`
(Abschnitt "Freigaben" mit Datum/Status); adaptiv ab einer Mindestgroesse.
**Quellen:** animate (genau diese drei Gates), OpenMontage (Gates erzwungen,
nicht vorgeschlagen), VW-Prinzip "Nichts ohne Zustimmung".
**Was sich aendert:** Text in `planning-short`, dem neuen `storyboarding` und
`making-a-short`; ein Abschnitt in der `plan.md`-Vorlage (Scaffolds).
**Wirkung:** Look-/Story-Fehler fallen vor dem Render auf; die Auseinandersetzung
mit der kreativen Richtung wird erzwungen statt gewuenscht.
**Kosten/Risiken:** Stunden bis 1 Tag. Risiko: Buerokratie - Gates fuer sehr
kleine Auftraege optional.

### P3 - `planning/reference-analysis`: "Starte bei einem Video, das du liebst" *(neu)*

**Idee:** Ein Referenzclip (zunaechst lokale Datei) wird mit vorhandenen
Mitteln vermessen: Wortrate, Pausen, Blockschnitt, Hook-Zeitpunkt, Beatdauern;
daraus entsteht ein Brief "das behalten / das aendern" plus 2-3 Konzepte.
**Quellen:** OpenMontage (Referenzvideo -> Konzept), Tella
(Transkript-Schnittdenken), animate (Referenzmaterial bleibt lokal).
**Was sich aendert:** neues Skill `planning/reference-analysis`, Rezept ueber
`vz ingest/transcribe/segment` + ffprobe. yt-dlp nur, wenn der Controller es
will (Spec: Recherche/Download "spaeter").
**Wirkung:** Ideenfindung aus echtem Material statt leerem Blatt; passt zu
"messen statt raten".
**Kosten/Risiken:** 1-3 Tage; Rechte an Referenzmaterial - Regel "Referenz
bleibt lokal", keine automatischen Downloads ohne Freigabe.

### P4 - `vz review`: gemessene Nachschau nach dem Render *(teilweise gedeckt; messende Nachschau neu)*

**Idee:** Neuer Befehl prueft die Ausgabe und schreibt `review.md`:
ffprobe-Validierung, Schwarz-/Standbild-Sampling, Lautheit, Untertitel-
Praesenz, Schnittzeiten gegen Pausen/Wortzeiten, Dauer gegen Plan; optional
Kontaktbogen.
**Quellen:** animate (review.mjs: Cut-Grid, Text-, Loudness-Checks, Contact
Sheets), OpenMontage (Post-Render-Self-Review), agentic-video-editor
(Review-Scores mit Schwelle).
**Was sich aendert:** `src/commands/review.ts` + Tests + Skill-Text
(`making-a-short` bzw. eigenes `producing/reviewing-a-render`); `vz learn`
kann Befunde aufnehmen.
**Wirkung:** "Fertig" wird messbar statt Behauptung; der Lernkreislauf bekommt
Futter.
**Kosten/Risiken:** 2-4 Tage inkl. Tests, keine neuen Dependencies (ffmpeg da).
Risiko: Geschmack ist nicht messbar - nur Fakten pruefen, Schwellen offenlegen,
den Render nicht blockieren (erst berichten).

### P5 - Style-Karten als Bausteine: `blocks/styles/<name>/` *(neu; Blockmechanik vorhanden)*

**Idee:** Neue Blockart `kind: "style"` mit `STYLE.md` (Palette, Typo, Motion,
Grading, Regeln, Frame-Checkliste) und 2-3 Startkarten; Planungs-Skills waehlen
eine Karte als "Visuelles Thema" (verzahnt mit P1).
**Quellen:** animate (Style-Plug-in), OpenMontage (Style-Playbooks),
LudwigKienle (Moodboard/Bible).
**Was sich aendert:** neue Blockart + `blocks/index.json`-Eintraege; Auswahl
im neuen `storyboarding`-Skill.
**Wirkung:** visuelle Stilentwicklung wird explizit, waehlbar und
wiederverwendbar.
**Kosten/Risiken:** ca. 1 Tag Inhalt + Index. Risiko: Doppelung mit
`blocks/prompts`/Beats - je Baustein genau ein Ort (Integritaetscheck greift).

### P6 - Beat-Vorlagen ausbauen (3-4 zusaetzliche) *(Inhalt neu; Mechanik gedeckt)*

**Idee:** Neben `beats-short-retention`: Problem/Solution/Proof/CTA (Ad),
Chronologie/Morph-Kette (Historie), Liste/Katalog, Mission/Beat-Cut - je eine
Vorlage unter `blocks/beats/`, Auswahlregel "Genre waehlt Vorlage".
**Quellen:** animate (8 Formate), aicontentskills (Narrativmuster),
agentic-video-editor (DTC-Testimonial-Struktur).
**Was sich aendert:** reine Inhalte + `blocks/index.json`; Satz in
`planning-short`.
**Wirkung:** Struktur waehlen statt erfinden; mehr Videoarten als nur Shorts.
**Kosten/Risiken:** 0,5-1 Tag. Risiko: Wildwuchs - nur mit echtem Anwendungsfall
(Spec-Regel).

### P7 - Entscheidungsprotokoll im Plan ("Warum es so aussieht") *(teilweise gedeckt)*

**Idee:** `plan.md` (und `review.md`) halten je kreative Entscheidung
Alternativen + Ein-Satz-Begruendung fest (Stil, Beats, Stimme, Musik);
`harvesting-learnings` zieht Lehren daraus.
**Quellen:** OpenMontage (Decision-Audit-Trail), aicontentskills
("Why this works"), animate (LOG/craft), VW-Prinzip "Beleg statt Behauptung".
**Was sich aendert:** Regeln in den Planungsskills/Vorlagen, keine
Schemaaenderung (plan.md ist frei).
**Wirkung:** Entscheidungen werden pruefbar und lernfaehig.
**Kosten/Risiken:** Stunden. Risiko: Papierkram - maximal drei Zeilen je
Entscheidung.

### P8 - Recherche-Schritt fuer Erklaervideos (optional) *(neu, aber ausserhalb des Kern-Gaps)*

**Idee:** Vor dem Skript eine Faktenliste mit Quellen; jede On-Screen-Behauptung
belegt.
**Quellen:** OpenMontage (Research-Stage), animate (Fakten web-gecheckt mit
Beleg).
**Was sich aendert:** Abschnitt/Erweiterung in Planungsskills; spaeter ggf.
eigenes Skill.
**Wirkung:** Erklaervideos werden belastbar; liefert indirekt Ideenwinkel.
**Kosten/Risiken:** klein. Risiko: Scope (Recherche-Tooling) - als Prozessregel
beginnen.

**Reihenfolge-Empfehlung:** P1, P2, P3, P4, P5, P6, P7, P8. P1+P2 zusammen
bilden ein Minimum, um die kreative Luecke zu schliessen; P3 und P4 sind die
naechsten eigenstaendigen Bausteine.

---

## 4. Anti-Pitches (bewusst nicht uebernehmen)

1. **Kein Agent-Orchestrierungs-Framework (LangGraph oder aehnlich).**
   VideoWizard ist agent-first; Harness + Skills + MCP tragen die
   Orchestrierung. Ein Framework waere eine zweite Kontrollschicht, eine
   Python-Dependency und ein Widerspruch zur duennen Huelle. Der Gate-Bedarf
   ist mit P2 als Skill-Protokoll erfuellt.
2. **OpenMontage (und aehnliche Komplettsysteme) nicht als Codebasis.**
   AGPL-3.0, Python-Monolith, zwei Compose-Engines, 60+ Provider, 700+
   Skill-Dateien - in einem privaten, verteilbaren TypeScript-Produkt nicht
   wartbar und lizenzrechtlich riskant. Ideen selektiv uebernehmen, nichts
   vendorn.
3. **Keine zweite Render-/Compose-Engine und keine Cloud-Kette.** HyperFrames,
   der animate-Canvas-Renderer (beide Browser-Capture-Pfade) und Tella als
   Hosting-/Analytics-Abhaengigkeit wuerden die Kernentscheidung "ein
   Render-Plan, lokal-first" brechen (Migration-Map: "zweiter Renderer fuer die
   Vorschau: bewusst nicht"). HyperFrames maximal als Doku-Quelle; Tella
   maximal als Richtungsbeleg.

---

## 5. Offene Fragen an den Auftraggeber

1. **Claude-Artifact:** Inhalt bitte direkt liefern (Datei/Text/Screenshot) -
   sonst bleibt Quelle 1 unauswertbar. War es inhaltlich eines der uebrigen
   Themen?
2. **HyperFrames als Zulieferer?** Gilt eine HTML/GSAP-Engine im geplanten
   Slot "Bewegung/Karten" neben Remotion schon als verbotene zweite Engine,
   oder waere sie als reiner Baustein-Lieferant (Ergebnisdatei, Montage bleibt
   ffmpeg) zulaessig? Bis zur Antwort: nur Doku nutzen.
3. **yt-dlp-Zeitpunkt:** Referenz-Analyse (P3) vorerst nur fuer lokale Dateien,
   oder jetzt schon mit der geplanten Recherche/Download-Faehigkeit koppeln?
4. **`vz review`-Kriterien:** Welche Schwellen gelten (Schwarzbildanteil,
   Loudness-Toleranz, Caption-Pflicht)? Darf der Befehl den Render blockieren
   oder nur berichten?
5. **Freigabe-Speicherung:** Gates nur in `plan.md`, oder als Feld in
   `project.json` (waere eine Schemaaenderung mit Migration)?
6. **Lizenz aicontentskills:** README behauptet MIT, aber es gibt kein
   LICENSE-File (API: license=null). Reicht ein interner Herkunftsvermerk,
   soll nachgefragt werden, oder schreiben wir die Struktur frei neu?
7. **Learnings:** Sollen aus diesem Report direkt `vz learn`-Eintraege
   entstehen (eine je uebernommener Idee), oder erst nach der Umsetzung?
