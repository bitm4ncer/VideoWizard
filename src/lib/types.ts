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

/**
 * Rohmaterial eines Projekts, einmal beim Ingest aufgenommen. Alle Pfade
 * relativ zum Projektordner (bewaehrt in der VideoPipeline).
 */
export interface Source {
  /** Kennung, fortlaufend "s01", bewaehrt in der VideoPipeline. */
  id: string;
  /** Anzeigename der Quelle, etwa der Dateiname der Aufnahme. */
  label: string;
  /** Der abgelegte Film, relativ zum Projektordner. */
  file: string;
  /** Aufnahmedatum als ISO-Datum YYYY-MM-DD. */
  added: string;
  /** Dauer in Sekunden, gemessen am abgelegten Film. */
  duration: number;
  /** SHA-256 ueber Dateigroesse und die ersten 8 MB, auf 32 Zeichen gekuerzt. */
  checksum: string;
  /** true, wenn Bildrate und Aufloesung auf das Projektformat gebracht wurden. */
  normalized: boolean;
}

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

/** Musikbett unter der Stimme. Fehlende Werte fallen auf die Vorgaben zurueck. */
export interface Music {
  /** Pfad relativ zum Projektordner. */
  file: string;
  /** Absenkung in Dezibel, Vorgabe -22. */
  gain_db?: number;
  /** Ducking gegen die Stimme in Dezibel, Vorgabe -12; 0 schaltet es ab. */
  duck_db?: number;
}

/** Outro am Ende des Videos; fehlt es, endet das Video mit dem letzten Block. */
export interface Outro {
  /** Pfad relativ zum Projektordner. */
  file: string;
  /** Ueberblendung in Sekunden, Vorgabe 0.5. */
  crossfade?: number;
}

/** Tonwerte des Projekts; fehlende Werte fallen auf die erprobten Vorgaben zurueck. */
export interface AudioSettings {
  /** Pegel der Sprachspur in LUFS, Vorgabe -16. */
  voice_lufs?: number;
  /** Pegel der fertigen Mischung in LUFS, Vorgabe -14. */
  master_lufs?: number;
  /** Musikbett; fehlt es, wird ohne Musik gerendert. */
  music?: Music;
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
  /** Tonwerte; fehlen sie, gelten die Vorgaben aus dem Ruling. */
  audio?: AudioSettings;
  /** Outro; fehlt es, endet das Video mit dem letzten Block. */
  outro?: Outro;
}
