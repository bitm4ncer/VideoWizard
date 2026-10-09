import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSecret } from "../src/lib/secrets.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vw-secrets-"));
});

/** Legt eine Schluesseldatei an und liefert ihren absoluten Pfad. */
async function datei(name: string, inhalt: string): Promise<string> {
  const pfad = join(dir, name);
  await writeFile(pfad, inhalt, "utf8");
  return pfad;
}

describe("resolveSecret", () => {
  it("nimmt den Wert aus der Umgebung, wenn die Variable gesetzt ist", async () => {
    const pfad = await datei("key", "sk-aus-der-datei");
    const wert = await resolveSecret(
      { env: "ELEVENLABS_API_KEY", file: pfad },
      { env: { ELEVENLABS_API_KEY: "  sk-aus-der-umgebung  " } },
    );
    expect(wert).toBe("sk-aus-der-umgebung");
  });

  it("liest sonst den nackten Wert aus der Datei", async () => {
    const pfad = await datei("nackt", "sk-nackt\n");
    expect(await resolveSecret({ env: "X", file: pfad }, { env: {} })).toBe("sk-nackt");
  });

  it("streift das NAME=-Praefix ab, im Beispiel ELEVENLABS_API_KEY", async () => {
    const pfad = await datei("key", 'ELEVENLABS_API_KEY="sk-abc"\n');
    expect(await resolveSecret({ env: "ELEVENLABS_API_KEY", file: pfad }, { env: {} }))
      .toBe("sk-abc");
  });

  it("streift auch blosse einfache und doppelte Anfuehrungszeichen ab", async () => {
    const doppelt = await datei("doppelt", '"sk-doppelt"');
    const einfach = await datei("einfach", "'sk-einfach'");

    expect(await resolveSecret({ env: "X", file: doppelt }, { env: {} })).toBe("sk-doppelt");
    expect(await resolveSecret({ env: "X", file: einfach }, { env: {} })).toBe("sk-einfach");
  });

  it("gilt bei leerer Datei, leerer Variable und fehlender Datei als nicht gesetzt", async () => {
    const leer = await datei("leer", "  \n");

    expect(await resolveSecret({ env: "ELEVENLABS_API_KEY", file: leer }, { env: {} }))
      .toBeNull();
    expect(
      await resolveSecret({ env: "ELEVENLABS_API_KEY" }, { env: { ELEVENLABS_API_KEY: "" } }),
    ).toBeNull();
    expect(
      await resolveSecret(
        { env: "ELEVENLABS_API_KEY", file: join(dir, "gibt-es-nicht") },
        { env: {} },
      ),
    ).toBeNull();
    // Ohne Umgebungsnamen und ohne Datei gibt es nichts zu lesen.
    expect(await resolveSecret({}, { env: {} })).toBeNull();
  });

  it("faellt bei leerer Variable auf die Datei zurueck, weil leer nicht gesetzt ist", async () => {
    const pfad = await datei("key", "sk-datei");
    const wert = await resolveSecret(
      { env: "ELEVENLABS_API_KEY", file: pfad },
      { env: { ELEVENLABS_API_KEY: "   " } },
    );
    expect(wert).toBe("sk-datei");
  });

  it("ergibt null statt eines Wurfs, wenn die Datei nicht lesbar ist", async () => {
    const ordner = join(dir, "keine-datei-sondern-ein-ordner");
    await mkdir(ordner);
    await expect(resolveSecret({ env: "X", file: ordner }, { env: {} })).resolves.toBeNull();
  });

  it("gibt den Wert in keinem Fehlerpfad aus", async () => {
    const wert = "sk-nie-im-klartext";
    // Der Pfad selbst traegt den Wert: ein roher Dateisystemfehler wuerde ihn
    // nennen. Genau das darf nicht nach aussen dringen.
    const fehlend = join(dir, wert);
    const spione = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "debug"),
    ];

    let ergebnis: string | null | undefined;
    let fehler = "";
    let meldungen: string[] = [];
    try {
      ergebnis = await resolveSecret({ env: "FEHLT", file: fehlend }, { env: {} });
    } catch (error) {
      fehler = String(error);
    } finally {
      // Zuerst lesen, dann zuruecksetzen: mockRestore leert die Aufrufliste.
      meldungen = spione.flatMap((spion) =>
        spion.mock.calls.map((aufruf) => aufruf.join(" ")),
      );
      for (const spion of spione) spion.mockRestore();
    }

    expect(fehler).toBe("");
    expect(ergebnis).toBeNull();
    expect(meldungen.join("\n")).not.toContain(wert);
  });

  it("liest ohne deps aus process.env", async () => {
    vi.stubEnv("VW_TEST_GEHEIM", "sk-aus-process-env");
    try {
      expect(await resolveSecret({ env: "VW_TEST_GEHEIM" })).toBe("sk-aus-process-env");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
