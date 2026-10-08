/**
 * ACE-Step als Musikquelle.
 *
 * Lokaler Server mit echter REST-API: POST /release_task legt eine Aufgabe an,
 * POST /query_result fragt den Stand (0 laeuft, 1 fertig, 2 gescheitert), GET
 * holt die Datei. Kein Schluessel, keine Kosten. Felder und Endpunkte stammen
 * aus `docs/en/API.md` des ACE-Step-Projekts, nichts davon ist geraten.
 *
 * Jede Antwort steckt in einer Huelle `{ data, code, error }`; ein gesetzter
 * `error` ist ein Fehler, auch bei HTTP 200. `result` ist eine
 * JSON-Zeichenkette mit einer Liste; das erste Element nennt die Datei.
 */

import type { FetchLike, MusicDeps, MusicProvider, MusicRequest, SleepFn } from "./music.js";

/** Adresse des Servers, wenn das Projekt keine nennt. */
export const DEFAULT_BASE_URL = "http://127.0.0.1:8001";
/** Abstand zwischen zwei Standabfragen. */
export const POLL_MS = 2000;

/** Grosse Laeufe brauchen Zeit, aber nicht ewig. */
const GENERATE_TIMEOUT_MS = 20 * 60 * 1000;
/** Kurzes Zeitlimit fuer /health, damit ein fehlender Dienst schnell auffaellt. */
const HEALTH_TIMEOUT_MS = 3000;

/** Die Optionen des ACE-Step-Anbieters aus `capabilities.music.options`. */
export interface AcestepOptions {
  /** Adresse des API-Servers, Vorgabe http://127.0.0.1:8001 */
  base_url?: string;
  /** DiT-Modell, etwa "acestep-v15-turbo". Fehlt es, entscheidet der Server. */
  model?: string;
  /** thinking=true laesst das LM planen. Vorgabe true */
  thinking?: boolean;
}

/** Liest die bekannten Optionen; ein falscher Typ zaehlt als nicht gesetzt. */
export function toAcestepOptions(options: Record<string, unknown> = {}): AcestepOptions {
  const cfg: AcestepOptions = {};
  const base = options["base_url"];
  const model = options["model"];
  const thinking = options["thinking"];
  if (typeof base === "string") cfg.base_url = base;
  if (typeof model === "string") cfg.model = model;
  if (typeof thinking === "boolean") cfg.thinking = thinking;
  return cfg;
}

interface Wrapper<T> {
  data: T;
  code: number;
  error: string | null;
}

/** Die Serveradresse ohne abschliessende Schraegstriche. */
function baseOf(cfg: AcestepOptions): string {
  const raw = cfg.base_url?.trim();
  return (raw ? raw : DEFAULT_BASE_URL).replace(/\/+$/, "");
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

/** POST mit JSON und Auspacken der Huelle. Fehler werden zu einer klaren Meldung. */
async function postJson<T>(url: string, body: unknown, fetchFn: FetchLike): Promise<T> {
  const r = await withTimeout(
    fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    GENERATE_TIMEOUT_MS,
    url,
  );
  const text = await r.text();
  let wrapper: Wrapper<T>;
  try {
    wrapper = JSON.parse(text) as Wrapper<T>;
  } catch {
    throw new Error(`${url} -> keine gueltige JSON-Antwort: ${text.slice(0, 200)}`);
  }
  if (!r.ok || wrapper.error) {
    throw new Error(`${url} -> ${wrapper.error ?? `HTTP ${r.status}`}`);
  }
  return wrapper.data;
}

/** Laeuft der lokale Server? Wirft nie; was nicht antwortet, ist nicht bereit. */
async function healthy(base: string, fetchFn: FetchLike): Promise<boolean> {
  try {
    const r = await withTimeout(
      fetchFn(`${base}/health`, undefined),
      HEALTH_TIMEOUT_MS,
      "ACE-Step /health",
    );
    return r.ok;
  } catch {
    return false;
  }
}

/** Aufgabe anlegen; liefert die task_id fuer die Standabfrage. */
async function release(
  base: string,
  cfg: AcestepOptions,
  req: MusicRequest,
  fetchFn: FetchLike,
): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: req.prompt,
    lyrics: "",
    audio_format: "wav",
    audio_duration: req.seconds,
    thinking: cfg.thinking ?? true,
  };
  if (cfg.model) body["model"] = cfg.model;
  if (req.seed !== undefined) {
    body["seed"] = req.seed;
    body["use_random_seed"] = false;
  }
  const data = await postJson<{ task_id?: string }>(`${base}/release_task`, body, fetchFn);
  const id = data?.task_id;
  if (!id) throw new Error("ACE-Step lieferte keine task_id.");
  return id;
}

interface TaskState {
  /** 0 laeuft, 1 fertig, 2 gescheitert */
  status: number;
  /** Relativer oder absoluter Verweis auf die fertige Datei */
  file?: string;
}

/** Stand einer Aufgabe; bei Erfolg wird die Datei aus `result` gelesen. */
async function query(base: string, taskId: string, fetchFn: FetchLike): Promise<TaskState> {
  const data = await postJson<Array<{ task_id?: string; status?: number; result?: string }>>(
    `${base}/query_result`,
    { task_id_list: [taskId] },
    fetchFn,
  );
  const entry = Array.isArray(data) ? data[0] : undefined;
  const status = entry?.status ?? 0;
  let file: string | undefined;
  if (status === 1 && entry?.result) {
    try {
      const hits = JSON.parse(entry.result) as Array<{ file?: string }>;
      file = hits[0]?.file;
    } catch {
      // Ein leeres oder unbekanntes result ist kein Grund zu werfen; das
      // fehlende file faellt unten als klare Meldung auf.
    }
  }
  return file ? { status, file } : { status };
}

/** Fertige Datei holen. Ein relativer Verweis wird an die Serveradresse gesetzt. */
async function download(base: string, fileUrl: string, fetchFn: FetchLike): Promise<Buffer> {
  const url = /^https?:\/\//.test(fileUrl)
    ? fileUrl
    : `${base}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
  const r = await withTimeout(fetchFn(url, undefined), GENERATE_TIMEOUT_MS, url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Der ACE-Step-Anbieter hinter dem gemeinsamen Vertrag. `deps` ist einhakbar,
 * damit der Test ohne Server und ohne echtes Warten laeuft.
 */
export function acestepProvider(cfg: AcestepOptions = {}, deps: MusicDeps = {}): MusicProvider {
  const fetchFn = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const base = baseOf(cfg);

  return {
    id: "acestep",
    detect: () => healthy(base, fetchFn),
    generate: async (req) => {
      const id = await release(base, cfg, req, fetchFn);

      let status = 0;
      let file: string | undefined;
      for (;;) {
        const state = await query(base, id, fetchFn);
        status = state.status;
        file = state.file;
        if (status === 1 || status === 2) break;
        await sleep(POLL_MS);
      }

      if (status === 2) throw new Error("ACE-Step-Generierung fehlgeschlagen.");
      if (!file) throw new Error("ACE-Step meldet fertig, nennt aber keine Datei.");
      return download(base, file, fetchFn);
    },
  };
}
