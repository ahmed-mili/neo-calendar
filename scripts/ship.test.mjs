import test from "node:test";
import assert from "node:assert/strict";

import { readArguments, worksToCommit, actionsUrl } from "./ship.mjs";

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
    assert.throws(
        () => readArguments(["Fix", "the", "toolbar"]),
        /guillemets/
    );
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
    assert.equal(actionsUrl("https://example.com/ahmed/neo-calendar.git"), undefined);
});
