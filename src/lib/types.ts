/** Alle geteilten Typen des Projektformats (Spezifikation Abschnitt 7). */

/** Bildformat des fertigen Videos. */
export interface Format {
  fps: number;
  width: number;
  height: number;
}

/** Sprachpaar: recorded ist die Sprache der Quellen, output die des Videos. */
export interface Language {
  recorded: string;
  output: string;
}

/** Bildherkunft eines Blocks: ein Ausschnitt der Quelle oder ein Standbild. */
export type BlockKind = "take" | "still";

/** Ergebnis der Sync-Logik; "none", solange sie nicht gelaufen ist. */
export type Fit = "none" | "trim" | "hold" | "overflow";

/** Eine Einblendung ueber dem Bild; `at` und `duration` in Sekunden. */
export interface Overlay {
  type: string;
  at: number;
  duration: number;
  props?: Record<string, unknown>;
}

/**
 * Ein Block verbindet Bildbereich, Text und Ton. Die Reihenfolge im Array ist
 * die Reihenfolge im Video. Alle Zeiten in Sekunden, alle Pfade relativ zum
 * Projektordner (bewaehrt in der VideoPipeline).
 */
export interface Block {
  /** Kennung, fortlaufend "b001", bewaehrt in der VideoPipeline. */
  id: string;
  /** "take" schneidet einen Bereich der Quelle, "still" haelt einen Frame. */
  kind: BlockKind;
  /** Quelle des Bildes; auch ein Standbild stammt aus einer Quelle. */
  source_id: string;
  /** Abschnittstitel aus dem Transkript; die Grundlage exakter Schnitte. */
  chapter?: string;
  /** Beginn des Bereichs in der Quelle. */
  source_in: number;
  /** Ende des Bereichs in der Quelle. */
  source_out: number;
  /** Frame-Zeitpunkt fuer "still"; ohne Angabe gilt source_in. */
  freeze_at?: number;
  /** Vom silencedetect gefundene Pausen im Block, roh. */
  silences: Array<[number, number]>;
  /** Der gesprochene Text; fehlt er, ist der Block noch offen. */
  text?: string;
  /** Erzeugte Tondatei samt Pruefsumme; fehlt, solange nicht vertont wurde. */
  tts?: { file: string; duration: number; hash: string; generated_at: string };
  /** Stille nach dem Block im fertigen Voiceover. */
  pause_after: number;
  /** Ergebnis der Sync-Logik, siehe Etappe 2a, Aufgabe 2. */
  fit: Fit;
  /** Einblendungen ueber dem Bild dieses Blocks. */
  overlays: Overlay[];
}

/** Rohmaterial eines Projekts; die Felder folgen mit dem Ingest (Etappe 2). */
export type Source = Record<string, unknown>;

/** Wahl eines Anbieters je Faehigkeit. */
export interface CapabilityChoice {
  provider: string;
  options?: Record<string, unknown>;
}

/** Faehigkeiten mit je genau einem gewaehlten Anbieter (Abschnitt 4). */
export type Capabilities = Record<string, CapabilityChoice>;

/** Ausgabeziele, etwa "youtube-shorts" und "tiktok". */
export interface Delivery {
  targets: string[];
}

/** Die Wahrheitsdatei project.json eines Projekts. */
export interface Project {
  schema: number;
  id: string;
  title: string;
  format: Format;
  language: Language;
  sources: Source[];
  blocks: Block[];
  capabilities: Capabilities;
  delivery: Delivery;
}
