import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    DEBUG_FLAGS_FILE,
    DIAGNOSTIC_SUFFIX,
    diagnosticFlagsIn,
    suffixFor,
} from "./releaseChannel.mjs";

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

test("une version ordinaire ne porte aucun suffixe", () => {
    const source = "export const GRID_LINE_DEBUG = false;\n";
    assert.deepEqual(diagnosticFlagsIn(source), []);
    assert.equal(suffixFor(source), "");
});

test("un seul interrupteur allumé disqualifie la version", () => {
    const source =
        "export const GRID_LINE_DEBUG = false;\n" +
        "export const SOMETHING_ELSE = true;\n";
    assert.deepEqual(diagnosticFlagsIn(source), ["SOMETHING_ELSE"]);
    assert.equal(suffixFor(source), DIAGNOSTIC_SUFFIX);
});

// Le fichier s'explique, et il parle de ce que fait l'interrupteur quand il
// vaut true. Une phrase n'est pas un réglage.
test("un commentaire qui parle de l'interrupteur n'est pas l'interrupteur", () => {
    const source =
        "/** On: … set it to true to colour the lines. */\n" +
        "// export const GRID_LINE_DEBUG = true;\n" +
        "export const GRID_LINE_DEBUG = false;\n";
    assert.deepEqual(diagnosticFlagsIn(source), []);
});

// Le contrat avec le workflow : le fichier existe, à cet endroit-là, et il se
// lit. Sans quoi la publication ne saurait plus reconnaître un diagnostic.
test("le fichier des interrupteurs est là où la publication le cherche", async () => {
    const source = await readFile(
        path.join(repositoryRoot, DEBUG_FLAGS_FILE),
        "utf8"
    );
    assert.match(source, /^export const [A-Z0-9_]+ = (true|false);$/m);
});
