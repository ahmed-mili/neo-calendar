import assert from "node:assert/strict";
import test from "node:test";

import { isVersion, nextVersionCode, replaceExactly } from "./set-version.mjs";

test("n'accepte qu'un numéro à trois nombres", () => {
    assert.equal(isVersion("1.0.3"), true);
    assert.equal(isVersion("v1.0.3"), false);
    assert.equal(isVersion("1.0"), false);
    assert.equal(isVersion("1.0.3-beta"), false);
});

// Android n'installe une mise à jour que si ce nombre a grandi ; le déduire de
// l'existant évite d'avoir à s'en souvenir.
test("fait grandir le versionCode d'un cran", () => {
    assert.equal(nextVersionCode("  versionCode = 4\n"), 5);
    assert.equal(nextVersionCode("  versionCode = 41\n"), 42);
});

test("refuse un module Gradle sans versionCode", () => {
    assert.throws(() => nextVersionCode("android { }"), /versionCode/);
});

// Compter les groupes de capture au lieu des occurrences ferait passer un
// remplacement unique pour trois, et le script échouerait sur un fichier sain.
test("compte les occurrences, pas les groupes de capture", () => {
    assert.equal(
        replaceExactly(
            '{ "version": "1.0.2" }',
            /("version": ")[^"]+(")/,
            "$11.0.3$2",
            1,
            "essai"
        ),
        '{ "version": "1.0.3" }'
    );
});

test("échoue quand le fichier n'a pas la forme attendue", () => {
    assert.throws(
        () => replaceExactly("rien ici", /introuvable/, "x", 1, "essai"),
        /0 trouvée/
    );
});
