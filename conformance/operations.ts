import { filenameForEvent, parseFrontmatter } from "../apps/windows/src/platform/desktopEventFormat";
import type { NeoEvent } from "../src/types";

/** Relie chaque opération du corpus au code TypeScript qui fait foi.
 *  Le corpus nomme des opérations, pas des fonctions : renommer une
 *  fonction ne touche qu'ici. */
export const OPERATIONS: Record<string, (input: any) => unknown> = {
    "notes.frontmatter": ({ text }) => parseFrontmatter(text),
    "notes.filename": ({ event }) => filenameForEvent(event as NeoEvent),
};
