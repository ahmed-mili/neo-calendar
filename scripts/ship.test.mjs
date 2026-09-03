import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    readArguments,
    worksToCommit,
    actionsUrl,
    resetNextVersion,
    NEXT_VERSION_FILE,
} from "./ship.mjs";

test("sans rien, la livraison répare", () => {
    assert.deepEqual(readArguments([]), {
        request: "patch",
        message: undefined,
        watch: false,
    });
});

test("un seul mot est le message, pas un niveau", () => {
    assert.deepEqual(readArguments(["Fix description toolbar overflow"]), {
        request: "patch",
        message: "Fix description toolbar overflow",
        watch: false,
    });
});

test("le niveau précède le message", () => {
    assert.deepEqual(readArguments(["minor", "Add the sub-tasks"]), {
        request: "minor",
        message: "Add the sub-tasks",
        watch: false,
    });
});

test("un numéro écrit en toutes lettres tient lieu de niveau", () => {
    assert.deepEqual(readArguments(["1.60.0", "Align both stores"]), {
        request: "1.60.0",
        message: "Align both stores",
        watch: false,
    });
});

test("un niveau peut venir seul, quand l'arbre est déjà propre", () => {
    assert.deepEqual(readArguments(["major"]), {
        request: "major",
        message: undefined,
        watch: false,
    });
});

test("le drapeau de suivi se glisse où il veut", () => {
    assert.deepEqual(readArguments(["--watch", "minor", "Add a view"]), {
        request: "minor",
        message: "Add a view",
        watch: true,
    });
    assert.deepEqual(readArguments(["Fix a leak", "--watch"]), {
        request: "patch",
        message: "Fix a leak",
        watch: true,
    });
});

test("refuse un mot de plus, plutôt que d'en perdre un", () => {
    // Un message oublié entre guillemets arriverait en morceaux : mieux vaut
    // le dire que publier une version dont le commit s'appelle « Fix ».
    assert.throws(() => readArguments(["Fix", "the", "toolbar"]), /guillemets/);
});

test("refuse un drapeau inconnu", () => {
    assert.throws(() => readArguments(["--force", "Fix a leak"]), /--force/);
});

test("un arbre sale sans message ne part pas", () => {
    assert.throws(() => worksToCommit(undefined, true), /message/);
});

test("un arbre sale avec un message donne un commit de travail", () => {
    assert.equal(worksToCommit("Fix a leak", true), true);
});

test("un arbre propre se passe de commit de travail", () => {
    assert.equal(worksToCommit(undefined, false), false);
});

test("un message sans rien à commiter est une erreur, pas un silence", () => {
    // Le message serait perdu sans un mot : l'arbre est propre, il n'y a
    // aucun changement à lui accrocher.
    assert.throws(() => worksToCommit("Fix a leak", false), /Rien à commiter/);
});

test("l'adresse des exécutions se lit sur le dépôt distant", () => {
    assert.equal(
        actionsUrl("https://github.com/ahmed-mili/neo-calendar.git"),
        "https://github.com/ahmed-mili/neo-calendar/actions"
    );
    assert.equal(
        actionsUrl("git@github.com:ahmed-mili/neo-calendar.git"),
        "https://github.com/ahmed-mili/neo-calendar/actions"
    );
    assert.equal(
        actionsUrl("https://github.com/ahmed-mili/neo-calendar"),
        "https://github.com/ahmed-mili/neo-calendar/actions"
    );
});

test("un distant qui n'est pas GitHub n'a pas d'exécutions à montrer", () => {
    assert.equal(
        actionsUrl("https://example.com/ahmed/neo-calendar.git"),
        undefined
    );
});

/*
 * Ce que la livraison raye du pense-bête.
 *
 * Elle effaçait la liste entière, au motif que ce qui est livré n'est plus à
 * faire. Mesuré le 2026-09-02 : la 1.68.0 a emporté onze points qui
 * attendaient depuis des versions et qu'elle n'avait pas livrés — une perte
 * sèche et silencieuse, le fichier n'étant pas versionné, aucun `git checkout`
 * ne le ramène. Seule une case cochée dit « c'est fait » ; le reste attend, et
 * doit survivre à la livraison.
 */

const PREAMBLE = [
    "# Prochaine version",
    "",
    "Ce qui reste à implémenter avant la prochaine livraison.",
    "",
    "---",
    "",
].join("\n");

const withList = (...lines) => PREAMBLE + lines.join("\n") + "\n";

function inATemporaryFolder(contents) {
    const root = mkdtempSync(path.join(tmpdir(), "nc-ship-"));
    const file = path.join(root, NEXT_VERSION_FILE);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
    return { root, read: () => readFileSync(file, "utf8") };
}

test("une case cochée s'en va", () => {
    const { root, read } = inATemporaryFolder(
        withList("- [x] Livré dans cette version.", "- [ ] Pas encore.")
    );

    resetNextVersion(root);

    assert.ok(!read().includes("Livré dans cette version"));
});

test("une case non cochée reste", () => {
    const { root, read } = inATemporaryFolder(
        withList("- [x] Fait.", "- [ ] Toujours à faire.")
    );

    resetNextVersion(root);

    assert.ok(read().includes("- [ ] Toujours à faire."));
});

test("les lignes de continuation suivent leur case", () => {
    // Un point du pense-bête tient sur plusieurs lignes, les suivantes
    // indentées. Rayer la première seule laisserait un paragraphe orphelin,
    // et garder les siennes en rayant la première laisserait un texte sans
    // sujet — c'est l'item entier qui part, ou rien.
    const { root, read } = inATemporaryFolder(
        withList(
            "- [x] Fait, et raconté",
            "      sur une deuxième ligne.",
            "- [ ] À faire, et raconté",
            "      sur une deuxième ligne aussi."
        )
    );

    resetNextVersion(root);
    const left = read();

    assert.ok(!left.includes("sur une deuxième ligne."));
    assert.ok(left.includes("sur une deuxième ligne aussi."));
});

test("le mode d'emploi n'est jamais touché", () => {
    const { root, read } = inATemporaryFolder(
        withList("- [x] Fait.", "- [ ] Pas fait.")
    );

    resetNextVersion(root);

    assert.ok(read().startsWith(PREAMBLE));
});

test("un titre de section survit à ses points", () => {
    const { root, read } = inATemporaryFolder(
        withList("## Reste au 2026-09-02", "", "- [x] Fait.", "- [ ] Pas fait.")
    );

    resetNextVersion(root);

    assert.ok(read().includes("## Reste au 2026-09-02"));
});

test("tout coché laisse le fichier vide, comme avant", () => {
    const { root, read } = inATemporaryFolder(
        withList("- [x] Fait.", "- [x] Fait aussi.")
    );

    resetNextVersion(root);

    assert.ok(read().includes("_Rien en attente._"));
});

test("rien de coché ne touche pas au fichier", () => {
    // Le cas de loin le plus fréquent : une livraison qui ne coche rien n'a
    // aucune raison de réécrire le fichier, ni d'annoncer un ménage qu'elle
    // n'a pas fait.
    const contents = withList("- [ ] Pas fait.");
    const { root, read } = inATemporaryFolder(contents);

    assert.equal(resetNextVersion(root), null);
    assert.equal(read(), contents);
});

test("le fichier absent n'est pas une erreur", () => {
    const root = mkdtempSync(path.join(tmpdir(), "nc-ship-"));

    assert.equal(resetNextVersion(root), null);
});
