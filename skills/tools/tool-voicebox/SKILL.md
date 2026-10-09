---
name: tool-voicebox
description: Use when local speech from a cloned voice is needed, when Voicebox does not respond, or when its setup, API or limits are unclear.
---

# Werkzeugkarte: Voicebox

Voicebox (https://voicebox.sh) ist die erste Sprachquelle hinter dem
gemeinsamen Sprach-Vertrag. Der lokale Server wird per HTTP unter
`http://127.0.0.1:17493` angesprochen.

## Erkennen

`vz doctor` fuehrt die Faehigkeit `voice` und fragt die echte
Dienst-Erkennung des Anbieters ab; die prueft den Server mit `GET /health`.
Antwortet er, meldet der Doctor "vorhanden (Dienst: voicebox)"; sonst "nur
von Hand (voicebox)". Ein fehlender Dienst wirft nicht.

## Installieren

Voicebox wird laut Registry "nur von Hand" beschafft; die Schritte stehen im
Voicebox-Projekt. Eine automatische Installation (`--fix`) gibt es noch
nicht. Danach `vz doctor` erneut laufen lassen.

## Einrichten

In `project.json` waehlt `capabilities.voice` den Anbieter:

- `provider`: `voicebox`.
- `options.base_url`: **Pflicht fuer `speak`**; Wert
  `http://127.0.0.1:17493`. Fehlt sie, wirft der Anbieter mit klarer Meldung.
  Der Doctor braucht keine Projektangabe.
- `options.profile_name`: Name des geklonten Profils. **Pflicht fuer `speak`**;
  fehlt er, wirft der Anbieter mit klarer Meldung. Der Doctor braucht ihn
  nicht.
- `options.language`: Rueckfall fuer Aufrufe ohne eigene Sprache; `vz voice`
  uebergibt immer `project.language.output`, das gewinnt. Ohne beides gilt
  `en`.
- `options.engine` (etwa `qwen`) und `options.model_size` (etwa `1.7B`):
  optional, sonst entscheidet der Server.

Das Profil wird ueber `GET /profiles` zu einer Kennung aufgeloest; fehlt es,
nennt die Meldung Namen und Adresse, angelegt wird es in der
Voicebox-Oberflaeche.

## Benutzen

`vz voice <ordner>` vertont jeden Block, dessen Text da ist und dessen Ton
fehlt oder veraltet ist; die Datei landet als WAV unter
`audio/tts/<blockId>.wav`. Der Anbieter spricht genau diese Endpunkte (aus
dem Provider-Vertrag, nichts geraten):

1. `POST /generate` mit `profile_id`, `text`, `language`, dazu `engine` und
   `model_size`, wenn gesetzt. Antwort: `id`.
2. `GET /generate/{id}/status` bis `completed` oder `failed`; zwischen zwei
   Abfragen liegen 2000 ms.
3. `GET /audio/{id}` liefert die fertige Datei.

## Grenzen

- **Keine echten Wort-Zeitstempel.** Ein Take kommt mit `alignment: null`
  zurueck; nichts wird geschaetzt und nichts umgerechnet. Exakte Schnitte
  brauchen deshalb ein Kapitel je Block.
- Ein Status `failed` wirft mit Kennung und Grund; eine Antwort ohne
  Generierungs-Kennung ebenfalls.
- Lokal, ohne Schluessel und ohne Kosten; dafuer braucht der Lauf den
  laufenden Dienst. Eine Generierung hat eine Frist von 20 Minuten; laeuft
  sie dann noch, wirft der Lauf mit Kennung und Status. `/health` bricht
  nach 3 Sekunden ab.
- Keine Annahmen ueber andere Endpunkte oder Felder; der Massstab ist der
  Provider-Vertrag in `src/lib/providers/voicebox.ts`.

Gemessener Stand: 2026-10-09. Endpunkte, Felder und Vorgabewerte stammen
woertlich aus `src/lib/providers/voicebox.ts`.
