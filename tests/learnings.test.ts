import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { learningPath, renderLearning, slugify } from "../src/lib/learnings.js";

describe("learningPath", () => {
  it("bildet Titel und Datum auf einen Slug-Pfad unter learnings ab", () => {
    expect(learningPath("", "FFmpeg Filter: Pfad-Apostroph", "2026-10-09")).toBe(
      join("learnings", "2026-10-09-ffmpeg-filter-pfad-apostroph.md"),
    );
  });

  it("setzt den Pfad an die uebergebene Wurzel", () => {
    expect(learningPath("repo", "FFmpeg Filter: Pfad-Apostroph", "2026-10-09")).toBe(
      join("repo", "learnings", "2026-10-09-ffmpeg-filter-pfad-apostroph.md"),
    );
  });

  it("schreibt Umlaute als ae/oe/ue und ß als ss", () => {
    expect(learningPath("repo", "Ärger über Öfen: Straße", "2026-10-09")).toBe(
      join("repo", "learnings", "2026-10-09-aerger-ueber-oefen-strasse.md"),
    );
  });

  it("macht aus Nicht-Buchstaben und Nicht-Ziffern Bindestriche und raeumt die Raender", () => {
    expect(learningPath("repo", "--Loud  &  Clear--", "2026-10-09")).toBe(
      join("repo", "learnings", "2026-10-09-loud-clear.md"),
    );
  });
});

describe("slugify", () => {
  it("laesst aus reiner Zeichensetzung keinen Slug uebrig", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("...")).toBe("");
  });
});

describe("renderLearning", () => {
  it("setzt Titel, Datum, Quelle, Status und die vier Abschnitte wortgleich zur Vorlage", () => {
    const entry = renderLearning({ title: "FFmpeg Filter", date: "2026-10-09" });

    expect(entry).toBe(
      [
        "# FFmpeg Filter",
        "",
        "*Angelegt: 2026-10-09*",
        "*Quelle: eigene Beobachtung*",
        "*Status: offen*",
        "",
        "## Beobachtung",
        "<Platzhalter>",
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
      ].join("\n"),
    );
  });

  it("nimmt Quelle und Beobachtung, wenn sie genannt sind", () => {
    const entry = renderLearning({
      title: "Apostroph",
      date: "2026-10-09",
      source: "Etappe 2b",
      note: "Der Filter reisst am Apostroph ab.",
    });

    expect(entry).toContain("*Quelle: Etappe 2b*");
    expect(entry).toContain("## Beobachtung\nDer Filter reisst am Apostroph ab.");
    expect(entry).not.toContain("eigene Beobachtung");
  });
});
