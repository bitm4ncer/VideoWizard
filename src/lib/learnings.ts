import { join } from "node:path";

/**
 * Ein Eintrag des Belegarchivs. `source` und `note` sind freiwillig; fehlen
 * sie, fuellt die Vorlage sie mit ihrer Vorgabe.
 */
export interface LearningEntry {
  title: string;
  date: string;
  source?: string;
  note?: string;
}

/**
 * Bildet einen Titel auf einen Slug ab: Kleinschreibung, Umlaute als
 * ae/oe/ue, ss fuer Eszett, alles Uebrige als Bindestrich, mehrfache
 * Bindestriche zusammen, keine Bindestriche am Rand. Bleibt der Slug leer,
 * hat der Titel keinen verwertbaren Inhalt (reine Zeichensetzung).
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Der Pfad eines Eintrags: `<root>/learnings/JJJJ-MM-TT-<slug>.md`. Das Datum
 * reicht der Aufrufer herein, damit der Pfad nicht von der Uhr abhaengt.
 */
export function learningPath(root: string, title: string, today: string): string {
  return join(root, "learnings", `${today}-${slugify(title)}.md`);
}

/**
 * Der Rahmen eines Eintrags, wortgleich die Vorlage aus dem Plan. Die festen
 * Zeilen sind bindend; die Winkelklammern markieren, was Menschen nachtragen.
 */
export function renderLearning(entry: LearningEntry): string {
  return [
    `# ${entry.title}`,
    "",
    `*Angelegt: ${entry.date}*`,
    `*Quelle: ${entry.source ?? "eigene Beobachtung"}*`,
    "*Status: offen*",
    "",
    "## Beobachtung",
    entry.note ?? "<Platzhalter>",
    "",
    "## Beleg",
    "<Platzhalter: Messung, Datei, Ausgabe>",
    "",
    "## Ergebnis",
    "<Platzhalter: was daraus folgt>",
    "",
    "## Offene Frage",
    "<Platzhalter>",
    "",
  ].join("\n");
}
