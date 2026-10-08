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

/**
 * Ein Block verbindet Bildbereich, Text und Ton. Die Reihenfolge im Array ist
 * die Reihenfolge im Video.
 *
 * Festgelegt ist bisher nur die Kennung; die uebrigen Felder folgen mit dem
 * ffmpeg-Kern (Etappe 2) und der VideoPipeline als Beweisquelle.
 */
export interface Block {
  /** Kennung, fortlaufend "b001", bewaehrt in der VideoPipeline. */
  id: string;
  [key: string]: unknown;
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
