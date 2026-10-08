import { createHash } from "node:crypto";

/**
 * Fingerabdruck eines Blocktextes samt Anbieter-Kennung. Weicht der
 * gespeicherte Wert ab, ist die Tondatei veraltet. Es gehen nur Text und
 * Anbieter ein, nie Zeit oder Zufall: derselbe Text ergibt denselben Hash.
 * Der Text geht so ein, wie er gesprochen wird.
 */
export function ttsHash(text: string, providerId: string): string {
  const payload = JSON.stringify([text, providerId]);
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}
