---
name: tool-ace-step
description: Use when local music generation is needed, when ACE-Step does not respond, or when its setup, API or limits are unclear.
---

# Werkzeugkarte: ACE-Step

ACE-Step ist die erste Musikquelle hinter dem gemeinsamen Musik-Vertrag. Der
lokale Server wird per HTTP auf Port 8001 angesprochen.

## Erkennen

- Der Doctor fuehrt die Faehigkeit `music` und prueft `acestep-api --help`;
  ACE-Step gilt dort als "nur von Hand".
- Der Anbieter selbst prueft den Server mit `GET /health`. Antwortet er nicht
  oder nicht mit HTTP 200, ist der Dienst nicht bereit; ein fehlender Dienst
  wirft nicht.

## Installieren

ACE-Step ist ein GPU-Werkzeug und wird laut Registry "nur von Hand"
beschafft; die Schritte stehen im ACE-Step-Projekt. Eine automatische
Installation (`--fix`) gibt es noch nicht. Danach `vz doctor` erneut laufen
lassen.

## Einrichten

In `project.json` waehlt `capabilities.music` den Anbieter:

- `provider`: `acestep`.
- `options.base_url`: Vorgabe `http://127.0.0.1:8001`.
- `options.model`: etwa `acestep-v15-turbo`; fehlt es, entscheidet der Server.
- `options.thinking`: Vorgabe `true`, laesst das LM planen.

## Benutzen

Der Anbieter spricht genau diese Endpunkte (aus dem Provider-Vertrag, nichts
geraten):

1. `POST /release_task` mit `prompt`, `lyrics`, `audio_format`,
   `audio_duration`, `thinking`; `model` und `seed` nur wenn gesetzt. Antwort:
   `task_id`.
2. `POST /query_result` mit `task_id_list`. Status 0 laeuft, 1 ist fertig,
   2 gescheitert; zwischen zwei Abfragen liegen 2000 ms.
3. `GET /v1/audio` holt die fertige Datei; ein relativer Verweis wird an die
   Serveradresse gesetzt.
4. Jede Antwort steckt in der Huelle `{ data, code, error }`; ein gesetztes
   `error` ist ein Fehler, auch bei HTTP 200.

Ein `vz music`-Befehl existiert noch nicht. Wie die Datei in ein Projekt
kommt, entscheidet der Workflow, nicht der Anbieter. Pegel danach mit dem
Baustein `ffmpeg-loudnorm` auf -16 und -14 LUFS bringen (`tool-ffmpeg`).

## Grenzen

- Lokal, ohne Schluessel und ohne Kosten; dafuer braucht der Lauf GPU und
  Zeit (Zeitlimit je Anfrage 20 Minuten, Standabfrage alle 2 Sekunden).
- Status 2 wirft "ACE-Step-Generierung fehlgeschlagen."; ein fertiger Lauf
  ohne genannte Datei wirft ebenfalls.
- Keine Annahmen ueber andere Endpunkte oder Felder; der Massstab ist der
  Provider-Vertrag in `src/lib/providers/acestep.ts`.

Gemessener Stand: 2026-10-08. Endpunkte, Felder und Vorgabewerte stammen
woertlich aus `src/lib/providers/acestep.ts`.
