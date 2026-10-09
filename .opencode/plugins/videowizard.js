/**
 * VideoWizard-Huelle fuer OpenCode.
 *
 * Duenn: registriert nur das skills/-Verzeichnis dieses Repos, keine
 * Fachlogik, kein zweiter Weg. Zugleich V1- und V2-kompatibel wie die
 * Superpowers-Vorlage:
 * - V1 laeuft ueber den config-Hook (config.skills.paths),
 * - V2 ueber setup() und ctx.skill.transform() (ein Skill.Info je SKILL.md).
 * Die Bootstrap-Injektion der Vorlage braucht VideoWizard nicht.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Das skills/-Verzeichnis dieses Repos; die Huelle liegt in .opencode/plugins/. */
const videowizardSkillsDir = path.resolve(__dirname, "../../skills");

/**
 * Liest name und description aus dem einfachen Frontmatter einer SKILL.md
 * (einzeilige Werte, wie docs/writing-guide.md sie verlangt) und liefert den
 * Rumpf ohne Frontmatter. Keine YAML-Bibliothek.
 */
function readSkill(file) {
  const full = fs.readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(full);
  if (!match) {
    return { name: undefined, description: undefined, content: full };
  }
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const lineMatch = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/.exec(line);
    if (lineMatch) {
      frontmatter[lineMatch[1]] = lineMatch[2].trim();
    }
  }
  return { name: frontmatter.name, description: frontmatter.description, content: match[2] };
}

/**
 * Alle SKILL.md unterhalb von dir, rekursiv; die Skills dieses Repos liegen
 * in Kategorien (skills/<Kategorie>/<Name>/SKILL.md). Fehlende Ordner ergeben
 * eine leere Liste.
 */
function findSkillFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSkillFiles(full));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(full);
    }
  }
  return found;
}

/**
 * V1-Eingang: OpenCode 1.x findet das Plugin ueber den benannten Export und
 * ruft den config-Hook mit der lebenden Konfiguration auf.
 */
export const VideoWizardPlugin = async () => ({
  config: async (config) => {
    // V2: skills ist eine flache Liste, die Registrierung macht setup().
    if (Array.isArray(config.skills)) return;
    // V1: skills ist { paths: [...] }.
    config.skills = config.skills || {};
    config.skills.paths = config.skills.paths || [];
    if (!config.skills.paths.includes(videowizardSkillsDir)) {
      config.skills.paths.push(videowizardSkillsDir);
    }
  },
});

/**
 * V2-Eingang: OpenCode 2.x ruft setup() ueber den Default-Export auf. Die
 * Skill.Info-Objekte folgen der im Superpowers-Repo belegten Form
 * { id, name, description?, path, content } (Feld `path` statt `location`
 * ab OpenCode 2.0.4).
 */
async function setup(ctx) {
  // V1 ruft setup() mit einer V1-Form von ctx auf, die skill nicht hat.
  if (!ctx || !ctx.skill || typeof ctx.skill.transform !== "function") return;

  try {
    const skills = findSkillFiles(videowizardSkillsDir).map((file) => {
      const id = path.basename(path.dirname(file));
      const { name, description, content } = readSkill(file);
      return {
        id,
        name: name || id,
        ...(description ? { description } : {}),
        path: file,
        content,
      };
    });
    await ctx.skill.transform((draft) => {
      // Ein abgelehntes Skill soll nur sich selbst ueberspringen; ein Wurf aus
      // dem Callback deaktiviert laut Host-Vertrag das ganze Plugin.
      for (const skill of skills) {
        try {
          draft.add(skill);
        } catch (err) {
          console.error(`[videowizard] skill "${skill.id}" rejected by host, skipping:`, err);
        }
      }
    });
  } catch (err) {
    // Nie die Plugin-Aktivierung an der Registrierung scheitern lassen.
    console.error("[videowizard] skill registration failed:", err);
  }
}

/**
 * Default-Export fuer V2: PluginSupervisor liest { id, setup }. `server`
 * traegt denselben V1-Eingang wie der benannte Export.
 */
export default {
  id: "videowizard",
  server: VideoWizardPlugin,
  setup,
};
