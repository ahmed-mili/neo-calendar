/*
 * Est-ce une version que l'on installe, ou une version que l'on regarde ?
 *
 * Une version de diagnostic — les traits de la grille coloriés, les mesures à
 * l'écran — ne doit surtout pas ressembler à une version ordinaire sur la page
 * des Releases : c'est celle du haut que l'on prend, et on la prendrait.
 *
 * Le nom de la branche aurait pu le dire, mais il faut alors y penser à chaque
 * fois, et l'oubli ne se voit qu'après coup, quand le paquet est déjà en ligne.
 * C'est donc l'APPLICATION qui le dit : si elle a été compilée avec un de ses
 * interrupteurs de diagnostic allumé (`src/ui/calendar/debugFlags.ts`), elle
 * n'est pas une version à installer, et la publication le sait sans qu'on ait
 * rien à lui apprendre. Éteindre l'interrupteur suffit à retrouver une version
 * normale : il n'y a pas deux choses à penser, il n'y en a qu'une.
 *
 * Ce que le suffixe change, en aval :
 *   - le nom des paquets       neo-calendar-android-1.38.2-debug.apk
 *   - l'étiquette et la release v1.38.2-debug
 *   - le drapeau GitHub         pre-release : badge jaune, et JAMAIS « Latest »
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

export const DEBUG_FLAGS_FILE = "src/ui/calendar/debugFlags.ts";

/** Ce que porte la version : rien, ou le mot qui la disqualifie. */
export const DIAGNOSTIC_SUFFIX = "-debug";

/**
 * Les interrupteurs de diagnostic allumés dans le fichier donné.
 *
 * Un seul suffit. Le motif est ancré sur la déclaration exportée pour qu'une
 * mention dans un commentaire — il y en a — ne compte pas pour un réglage.
 */
export function diagnosticFlagsIn(source) {
    return [...source.matchAll(/^export const ([A-Z0-9_]+) = true;$/gm)].map(
        (found) => found[1]
    );
}

/** Le suffixe que porte une version compilée avec cette source-là. */
export function suffixFor(source) {
    return diagnosticFlagsIn(source).length ? DIAGNOSTIC_SUFFIX : "";
}

export async function releaseSuffix() {
    const source = await readFile(
        path.join(repositoryRoot, DEBUG_FLAGS_FILE),
        "utf8"
    );
    return suffixFor(source);
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    const suffix = await releaseSuffix();
    // Sur la sortie standard, ce que le workflow colle aux noms : souvent rien.
    process.stdout.write(suffix);
}
