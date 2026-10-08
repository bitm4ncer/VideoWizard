/**
 * Voicebox als Sprachquelle.
 *
 * Voicebox (https://voicebox.sh) laeuft lokal und liefert Sprache aus einem
 * geklonten Profil. Es liefert **keine echten Zeichenzeiten**, nur Text und
 * Dauer. Ein Take kommt deshalb mit `alignment: null` zurueck; es wird nichts
 * geschaetzt und nichts umgerechnet.
 *
 * Der Ablauf stammt aus der VideoPipeline (src/lib/voicebox.ts): Profil
 * aufloesen, POST /generate, GET /generate/{id}/status bis completed oder
 * failed, GET /audio/{id}. Der Unterschied dort: fehlende Zeitstempel wurden
 * gleichmaessig ueber die Zeichen verteilt und taten damit so, als waeren sie
 * gemessen; das wiederholt diese Fassung bewusst nicht.
 */

import type { FetchLike, SleepFn, VoiceDeps, VoiceProvider, VoiceTake } from "./voice.js";

/** Abstand zwischen zwei Standabfragen. */
export const POLL_MS = 2000;

/** Grosse Laeufe brauchen Zeit, aber nicht ewig. */
const GENERATE_TIMEOUT_MS = 20 * 60 * 1000;
/** Kurzes Zeitlimit fuer /health, damit ein fehlender Dienst schnell auffaellt. */
const HEALTH_TIMEOUT_MS = 3000;

/** Die Optionen des Voicebox-Anbieters aus `capabilities.voice.options`. */
export interface VoiceboxOptions {
  /** Adresse des lokalen Servers, etwa http://127.0.0.1:17493 */
  base_url: string;
  /** Name des geklonten Profils; wird in eine Kennung aufgeloest. */
  profile_name: string;
  /** TTS-Engine, etwa "qwen". Fehlt sie, entscheidet der Server. */
  engine?: string;
  /** Groesse des Modells, etwa "1.7B". Fehlt sie, entscheidet der Server. */
  model_size?: string;
  /** Sprache des Textes. Fehlt sie, gilt "en" wie in der Vorlage. */
  language?: string;
}

/**
 * Liest die bekannten Optionen; ein falscher Typ zaehlt als nicht gesetzt.
 * base_url und profile_name sind Pflicht: ohne sie gibt es eine klare Meldung
 * statt einer Anfrage ins Leere.
 */
export function toVoiceboxOptions(options: Record<string, unknown> = {}): VoiceboxOptions {
  const readString = (key: string): string | undefined => {
    const value = options[key];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const base_url = readString("base_url");
  const profile_name = readString("profile_name");
  if (base_url === undefined) {
    throw new Error('Voicebox: "base_url" fehlt in capabilities.voice.options.');
  }
  if (profile_name === undefined) {
    throw new Error('Voicebox: "profile_name" fehlt in capabilities.voice.options.');
  }
  const cfg: VoiceboxOptions = { base_url, profile_name };
  const engine = readString("engine");
  const model_size = readString("model_size");
  const language = readString("language");
  if (engine !== undefined) cfg.engine = engine;
  if (model_size !== undefined) cfg.model_size = model_size;
  if (language !== undefined) cfg.language = language;
  return cfg;
}

/** Die Serveradresse ohne abschliessende Schraegstriche. */
function baseOf(cfg: VoiceboxOptions): string {
  return cfg.base_url.replace(/\/+$/, "");
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${what} hat nach ${Math.round(ms / 1000)} s nicht geantwortet.`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Antwort lesen: Voicebox antwortet je nach Endpunkt mit reinem JSON oder mit
 * einem Strom aus data-Zeilen (Server-Sent Events). Beide Formen kommen vor;
 * aus einem Strom gilt das letzte Ereignis.
 */
export function parseVoiceboxResponse(text: string): unknown {
  const events: unknown[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // Eine unvollstaendige Zeile ist kein Grund zu werfen.
    }
  }
  if (events.length > 0) return events[events.length - 1];
  return text ? (JSON.parse(text) as unknown) : null;
}

/** JSON holen und lesen; HTTP-Fehler nennen Adresse und Status. */
async function requestJson(url: string, init: RequestInit | undefined, fetchFn: FetchLike): Promise<unknown> {
  const r = await withTimeout(fetchFn(url, init), GENERATE_TIMEOUT_MS, url);
  const text = await r.text();
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}: ${text.slice(0, 300)}`);
  try {
    return parseVoiceboxResponse(text);
  } catch {
    throw new Error(`${url} -> keine gueltige JSON-Antwort: ${text.slice(0, 200)}`);
  }
}

/** Je Adresse und Profilname die gefundene Kennung; einmal aufgeloest genuegt. */
const profileIds = new Map<string, string>();

/** Nur fuer Tests: die gemerkten Kennungen wieder vergessen. */
export function resetVoiceboxProfileCache(): void {
  profileIds.clear();
}

/**
 * Den Profilnamen in eine Kennung aufloesen. Fehlt das Profil, nennt die
 * Meldung Name und Adresse.
 */
async function resolveProfile(
  cfg: VoiceboxOptions,
  base: string,
  fetchFn: FetchLike,
): Promise<string> {
  const key = `${base}\u0000${cfg.profile_name}`;
  const cached = profileIds.get(key);
  if (cached !== undefined) return cached;

  const data = (await requestJson(`${base}/profiles`, undefined, fetchFn)) as
    | { value?: Array<{ id?: string; name?: string }> }
    | Array<{ id?: string; name?: string }>
    | null;
  const list = Array.isArray(data) ? data : (data?.value ?? []);
  const hit = list.find((profile) => profile.name === cfg.profile_name);
  if (!hit?.id) {
    throw new Error(
      `Voicebox-Profil "${cfg.profile_name}" fehlt auf ${base}. ` +
      `Anlegen in der Voicebox-Oberflaeche.`,
    );
  }
  profileIds.set(key, hit.id);
  return hit.id;
}

/** Laeuft der lokale Server? Wirft nie; was nicht antwortet, ist nicht bereit. */
async function healthy(base: string, fetchFn: FetchLike): Promise<boolean> {
  try {
    const r = await withTimeout(
      fetchFn(`${base}/health`, undefined),
      HEALTH_TIMEOUT_MS,
      "Voicebox /health",
    );
    return r.ok;
  } catch {
    return false;
  }
}

interface GenerateState {
  id?: string;
  status?: string;
  error?: string | null;
}

const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Der Voicebox-Anbieter hinter dem gemeinsamen Vertrag. `deps` ist einhakbar,
 * damit der Test ohne Server und ohne echtes Warten laeuft.
 */
export function voiceboxProvider(cfg: VoiceboxOptions, deps: VoiceDeps = {}): VoiceProvider {
  const fetchFn = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const base = baseOf(cfg);

  return {
    id: "voicebox",
    detect: () => healthy(base, fetchFn),
    speak: async (text, opts): Promise<VoiceTake> => {
      const profileId = await resolveProfile(cfg, base, fetchFn);

      const gen = (await requestJson(
        `${base}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: profileId,
            text,
            language: opts.language ?? cfg.language ?? "en",
            engine: cfg.engine,
            ...(cfg.model_size ? { model_size: cfg.model_size } : {}),
          }),
        },
        fetchFn,
      )) as GenerateState | null;
      if (!gen?.id) throw new Error("Voicebox lieferte keine Generierungs-Kennung.");
      const id = gen.id;

      let status = gen.status ?? "completed";
      let reason = gen.error ?? undefined;
      while (status !== "completed" && status !== "failed") {
        await sleep(POLL_MS);
        const state = (await requestJson(
          `${base}/generate/${id}/status`,
          undefined,
          fetchFn,
        )) as GenerateState | null;
        if (state) {
          status = state.status ?? status;
          reason = state.error ?? reason;
        }
      }
      if (status === "failed") {
        throw new Error(
          `Voicebox auf ${base}: Generierung ${id} fehlgeschlagen ` +
          `(Status failed): ${reason ?? "unbekannt"}.`,
        );
      }

      const audioResp = await withTimeout(
        fetchFn(`${base}/audio/${id}`, undefined),
        GENERATE_TIMEOUT_MS,
        `${base}/audio/${id}`,
      );
      if (!audioResp.ok) throw new Error(`${base}/audio/${id} -> HTTP ${audioResp.status}`);
      const audio = Buffer.from(await audioResp.arrayBuffer());

      // Voicebox misst keine Zeichenzeiten; geschaetzte gibt es hier nicht.
      return { audio, alignment: null };
    },
  };
}
