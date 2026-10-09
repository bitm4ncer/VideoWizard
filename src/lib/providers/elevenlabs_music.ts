/**
 * ElevenLabs als Musikquelle.
 *
 * ElevenLabs (https://elevenlabs.io) liefert Musik ueber die REST-API.
 * Der Aufruf stammt aus der VideoPipeline (src/lib/elevenlabs.ts,
 * `composeMusic`):
 * POST /v1/music mit der Kopfzeile `xi-api-key` und dem Rumpf
 * { prompt, music_length_ms, model_id }. Die Antwort sind die rohen
 * Audiodaten (MP3), kein JSON.
 *
 * `seed` wird nicht gesendet: die Vorlage kennt fuer Musik keinen Seed,
 * ein mitgegebener Wert wird ignoriert.
 *
 * Der Schluessel kommt aus einer SecretSource; der Wert taucht in keiner
 * Meldung auf, auch nicht im Fehlerfall.
 */

import { resolveSecret, resolveSecretSource } from "../secrets.js";
import type { SecretSource } from "../secrets.js";
import type { FetchLike, MusicDeps, MusicProvider, MusicRequest } from "./music.js";

const BASE = "https://api.elevenlabs.io";

/** Vorgabe des Modells; belegter Wert aus der VideoPipeline. */
const DEFAULT_MODEL = "music_v2";

/** Die Vorgabe der Schluessel-Quelle: nur die Umgebungsvariable, keine Datei. */
const DEFAULT_SECRET: SecretSource = { env: "ELEVENLABS_API_KEY" };

/** Die Optionen des ElevenLabs-Anbieters aus `capabilities.music.options`. */
export interface ElevenLabsMusicOptions {
  /** Modell, etwa "music_v2". Fehlt es, gilt die Vorgabe. */
  model?: string;
  /** Woher der Schluessel kommt. Vorgabe: env "ELEVENLABS_API_KEY", keine Datei. */
  secret?: SecretSource;
}

/** Liest die bekannten Optionen; falsche Typen zaehlen als nicht gesetzt. */
export function toElevenLabsMusicOptions(
  options: Record<string, unknown> = {},
): ElevenLabsMusicOptions {
  const cfg: ElevenLabsMusicOptions = { secret: toSecretSource(options["secret"]) };
  const model = options["model"];
  if (typeof model === "string" && model.trim() !== "") cfg.model = model.trim();
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
  return parts.length > 0 ? parts.join(" oder ") : "secret in capabilities.music.options";
}

/** Ersetzt den Schluessel in einer Meldung; er darf nirgends auftauchen. */
function redact(message: string, apiKey: string): string {
  return message.split(apiKey).join("<geschwaerzt>");
}

/**
 * Der ElevenLabs-Anbieter hinter dem gemeinsamen Vertrag. `deps.fetch` und
 * `deps.env` sind einhakbar, damit der Test ohne Netz und ohne echten
 * Schluessel laeuft; `deps.baseDir` loest eine relative Schluesseldatei gegen
 * den Projektordner auf.
 */
export function elevenlabsMusicProvider(
  cfg: ElevenLabsMusicOptions,
  deps: MusicDeps = {},
): MusicProvider {
  const fetchFn: FetchLike = deps.fetch ?? fetch;
  const configured = cfg.secret ?? DEFAULT_SECRET;
  const secret = resolveSecretSource(configured, deps.baseDir);

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
    generate: async (req: MusicRequest): Promise<Buffer> => {
      const key = await resolveSecret(secret, { env: deps.env });
      if (key === null) {
        throw new Error(`ElevenLabs: Der Schluessel fehlt (${secretHint(configured)}).`);
      }

      // music_length_ms = seconds * 1000, wie in der Vorlage auf ganze
      // Millisekunden gerundet. seed kennt die Vorlage fuer Musik nicht und
      // wird deshalb nicht gesendet.
      const body = {
        prompt: req.prompt,
        music_length_ms: Math.round(req.seconds * 1000),
        model_id: cfg.model ?? DEFAULT_MODEL,
      };

      const response = await fetchFn(`${BASE}/v1/music`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(
          `ElevenLabs Musik scheiterte (HTTP ${response.status}): ` +
          redact(raw, key).slice(0, 400),
        );
      }

      // Die Antwort sind die rohen Audiodaten (MP3), kein JSON.
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
