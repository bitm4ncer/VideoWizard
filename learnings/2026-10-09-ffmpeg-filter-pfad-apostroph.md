# Filterpfade mit Apostroph maskieren

*Angelegt: 2026-10-09*
*Quelle: dieses Repo, Etappe 2b*
*Status: eingearbeitet*

## Beobachtung

Ein `subtitles`-Filter mit einem Apostroph im Pfad brach den Lauf: `\'` in
einer einfachen Anfuehrung schliesst die Region.

## Beleg

Mit echtem ffmpeg reproduziert: vorher Fehler, nachher Exit 0. Behoben in
`6de6565`; betroffene Datei `src/lib/ffargs.ts`.

## Ergebnis

Zweistufige Maskierung im Filterpfad: schliessen, Backslash, Anfuehrung,
wieder oeffnen. Geaendert wurden `src/lib/ffargs.ts` (Maskierung) und
`tests/ffargs.test.ts` (Test, der die Maskierung pinnt).

## Offene Frage

Weitere Filtergraph-Sonderzeichen (`[ ] , ;`) sind nicht maskiert; mit echter
Anfuehrungsregion bisher unauffaellig.
