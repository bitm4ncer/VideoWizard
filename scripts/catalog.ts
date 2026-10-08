import { fileURLToPath } from "node:url";
import { buildCatalog } from "../src/lib/catalog.js";

/** Duenner Runner: Ausgabe nach stdout, Aufruf ueber `npm run catalog`. */
const root = fileURLToPath(new URL("..", import.meta.url));
process.stdout.write(await buildCatalog(root));
