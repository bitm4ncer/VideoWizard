import { join, resolve } from "node:path";

/** Alle Pfade eines Projekts. project.json ist die Wahrheitsdatei. */
export interface ProjectPaths {
  /** Der Projektordner, absolut aufgeloest. */
  dir: string;
  /** Die Wahrheitsdatei project.json. */
  projectFile: string;
  /** Der Plan, den die Planung schreibt (Abschnitt 9). */
  planFile: string;
  /** Der Ordner aller Quellen; je Quelle ein Unterordner mit ihrer Kennung. */
  sourcesDir: string;
}

export function projectPaths(dir: string): ProjectPaths {
  const absolute = resolve(dir);
  return {
    dir: absolute,
    projectFile: join(absolute, "project.json"),
    planFile: join(absolute, "plan.md"),
    sourcesDir: join(absolute, "sources"),
  };
}
