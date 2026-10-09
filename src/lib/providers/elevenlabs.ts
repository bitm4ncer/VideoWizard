/**
 * ElevenLabs als Sprachquelle.
 *
 * ElevenLabs (https://elevenlabs.io) liefert Sprache ueber die REST-API und
 * dazu echte Zeichenzeiten: `alignment` bildet den Text 1:1 ab. Diese Zeiten
 * werden nur durchgereicht; es wird nichts umgerechnet und nichts geschaetzt.
 * Fehlt `alignment` in der Antwort, ist es null, wie bei Voicebox.
 *
 * Der Aufruf stammt aus der VideoPipeline (src/lib/elevenlabs.ts,
 * `textToSpeechWithTimestamps`):
 * POST /v1/text-to-speech/{voice_id}/with-timestamps mit der Kopfzeile
 * `xi-api-key` und dem Rumpf { text, model_id, voice_settings }. Die Antwort
 * traegt { audio_base64, alignment }.
 *
 * Der Schluessel kommt aus einer SecretSource; der Wert taucht in keiner
 * Meldung auf, auch nicht im Fehlerfall.
 */

import { resolveSecret } from "../secrets.js";
import type { SecretSource } from "../secrets.js";
import type { Alignment, FetchLike, VoiceDeps, VoiceProvider, VoiceTake } from "./voice.js";

const BASE = "https://api.elevenlabs.io";

/** Die Vorgabe der Schluessel-Quelle: nur die Umgebungsvariable, keine Datei. */
const DEFAULT_SECRET: SecretSource = { env: "ELEVENLABS_API_KEY" };

/** Die Optionen des ElevenLabs-Anbieters aus `capabilities.voice.options`. */
export interface ElevenLabsVoiceOptions {
  /** Kennung der Stimme, etwa "bAFkvitDGeDMmqo9gJzO". */
  voice_id: string;
  /** Modell, etwa "eleven_multilingual_v2". Fehlt es, entscheidet die API. */
  model?: string;
  /** Stimmen-Einstellungen; nicht gesetzte Felder bleiben aus dem Rumpf. */
  stability?: number;
  similarity_boost?: number;
  speed?: number;
  /** Woher der Schluessel kommt. Vorgabe: env "ELEVENLABS_API_KEY", keine Datei. */
  secret?: SecretSource;
}

/**
 * Liest die bekannten Optionen; falsche Typen zaehlen als nicht gesetzt,
 * uebernommene Werte werden getrimmt. voice_id ist Pflicht: ohne sie gibt es
 * eine klare Meldung statt einer Anfrage ins Leere.
 */
export function toElevenLabsVoiceOptions(
  options: Record<string, unknown> = {},
): ElevenLabsVoiceOptions {
  const readString = (key: string): string | undefined => {
    const value = options[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const readNumber = (key: string): number | undefined => {
    const value = options[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };

  const voice_id = readString("voice_id");
  if (voice_id === undefined) {
    throw new Error('ElevenLabs: "voice_id" fehlt in capabilities.voice.options.');
  }

  const cfg: ElevenLabsVoiceOptions = { voice_id, secret: toSecretSource(options["secret"]) };
  const model = readString("model");
  const stability = readNumber("stability");
  const similarity_boost = readNumber("similarity_boost");
  const speed = readNumber("speed");
  if (model !== undefined) cfg.model = model;
  if (stability !== undefined) cfg.stability = stability;
  if (similarity_boost !== undefined) cfg.similarity_boost = similarity_boost;
  if (speed !== undefined) cfg.speed = speed;
  return cfg;
}

/** Eine gesetzte Quelle uebernehmen; ohne Angabe gilt die Vorgabe. */
function toSecretSource(value: unknown): SecretSource {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_SECRET };
  const raw = value as Record<string, unknown>;
  const read = (key: string): string | undefined => {
    const item = raw[key];
    return typeof item === "string" && item.trim() !== "" ? item.trim() : undefined;
  };
  const env = read("env");
  const file = read("file");
  if (env === undefined && file === undefined) return { ...DEFAULT_SECRET };
  const secret: SecretSource = {};
  if (env !== undefined) secret.env = env;
  if (file !== undefined) secret.file = file;
  return secret;
}

/** Wo der Schluessel erwartet wurde; nennt nur Namen, nie den Wert. */
function secretHint(secret: SecretSource): string {
  const parts: string[] = [];
  if (secret.env !== undefined) parts.push(`Umgebungsvariable ${secret.env}`);
  if (secret.file !== undefined) parts.push(`Schluesseldatei ${secret.file}`);
  return parts.length > 0 ? parts.join(" oder ") : "secret in capabilities.voice.options";
}

/** Ersetzt den Schluessel in einer Meldung; er darf nirgends auftauchen. */
function redact(message: string, apiKey: string): string {
  return message.split(apiKey).join("<geschwaerzt>");
}

/** Der Rumpf der Anfrage; nur gesetzte Felder kommen mit. */
function requestBody(cfg: ElevenLabsVoiceOptions, text: string): Record<string, unknown> {
  const body: Record<string, unknown> = { text };
  if (cfg.model !== undefined) body["model_id"] = cfg.model;
  const settings: Record<string, number> = {};
  if (cfg.stability !== undefined) settings["stability"] = cfg.stability;
  if (cfg.similarity_boost !== undefined) settings["similarity_boost"] = cfg.similarity_boost;
  if (cfg.speed !== undefined) settings["speed"] = cfg.speed;
  if (Object.keys(settings).length > 0) body["voice_settings"] = settings;
  return body;
}

/**
 * Der ElevenLabs-Anbieter hinter dem gemeinsamen Vertrag. `deps.fetch` und
 * `deps.env` sind einhakbar, damit der Test ohne Netz und ohne echten
 * Schluessel laeuft.
 */
export function elevenlabsVoiceProvider(
  cfg: ElevenLabsVoiceOptions,
  deps: VoiceDeps = {},
): VoiceProvider {
  const fetchFn: FetchLike = deps.fetch ?? fetch;
  const secret = cfg.secret ?? DEFAULT_SECRET;

  return {
    id: "elevenlabs",
    detect: async (): Promise<boolean> => {
      // Ein fehlender Schluessel ist ein Zustand, kein Fehler; detect wirft nie.
      try {
        return (await resolveSecret(secret, { env: deps.env })) !== null;
      } catch {
        return false;
      }
    },
    speak: async (text): Promise<VoiceTake> => {
      const key = await resolveSecret(secret, { env: deps.env });
      if (key === null) {
        throw new Error(`ElevenLabs: Der Schluessel fehlt (${secretHint(secret)}).`);
      }

      const response = await fetchFn(
        `${BASE}/v1/text-to-speech/${cfg.voice_id}/with-timestamps`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(requestBody(cfg, text)),
        },
      );
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(
          `ElevenLabs Sprachausgabe scheiterte (HTTP ${response.status}): ` +
          redact(raw.slice(0, 400), key),
        );
      }

      const data = (await response.json()) as {
        audio_base64?: string;
        alignment?: Alignment | null;
      };
      if (!data.audio_base64) {
        throw new Error("ElevenLabs lieferte kein Audio.");
      }
      return {
        audio: Buffer.from(data.audio_base64, "base64"),
        alignment: data.alignment ?? null,
      };
    },
  };
}
