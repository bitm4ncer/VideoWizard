import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wurzel des Repos, unabhaengig vom Arbeitsverzeichnis. Ueber die Lage dieser
 * Datei aufgeloest, damit Befehle ihre Ablage im Repo finden (etwa learnings/).
 */
export function repoRoot(): string {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)));
}
