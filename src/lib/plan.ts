import type { Block, Project } from "./types.js";

/**
 * Die Planoperationen auf `project.json`. Reine Operationen auf dem
 * Projektobjekt, kein Dateizugriff: Der Aufrufer entscheidet, wann er
 * speichert. Alle Zeiten in Sekunden (bewaehrt in der VideoPipeline).
 */

/** Findet den Index eines Blocks; ein unbekanntes id wirft mit dem Namen. */
function indexOfBlock(project: Project, id: string): number {
  const index = project.blocks.findIndex((block) => block.id === id);
  if (index === -1) {
    throw new Error(`Block unbekannt: ${id}`);
  }
  return index;
}

/** Haengt einen Block hinten an; die Reihenfolge im Array ist die im Video. */
export function addBlock(project: Project, block: Block): void {
  project.blocks.push(block);
}

/**
 * Verschiebt einen Block an die Zielposition. Der Index zaehlt im Array nach
 * dem Verschieben, der Block steht danach also genau an dieser Stelle. Werte
 * ausserhalb des Arrays landen am Rand.
 */
export function moveBlock(project: Project, id: string, index: number): void {
  const from = indexOfBlock(project, id);
  const [block] = project.blocks.splice(from, 1);
  if (block === undefined) {
    throw new Error(`Block unbekannt: ${id}`);
  }
  const target = Math.max(0, Math.min(index, project.blocks.length));
  project.blocks.splice(target, 0, block);
}

/** Entfernt genau den Block mit dieser Kennung. */
export function removeBlock(project: Project, id: string): void {
  project.blocks.splice(indexOfBlock(project, id), 1);
}

/** Liefert den Block mit dieser Kennung; ein unbekanntes id wirft. */
export function blockById(project: Project, id: string): Block {
  const block = project.blocks.find((candidate) => candidate.id === id);
  if (block === undefined) {
    throw new Error(`Block unbekannt: ${id}`);
  }
  return block;
}

/**
 * Der kleine Zustand eines Blocks: "todo", solange Text oder Ton fehlen,
 * sonst "ok". Mehr Zustaende kommen, wenn Vertonung und Sync sie brauchen.
 * Wird bei jedem Laden neu berechnet, nie gespeichert.
 */
export function blockStatus(block: Block): "todo" | "ok" {
  return block.text === undefined || block.tts === undefined ? "todo" : "ok";
}
