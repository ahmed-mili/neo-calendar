import assert from "node:assert/strict";
import test from "node:test";

import {
    cargoLockWithVersion,
    isVersion,
    nextVersion,
    nextVersionCode,
    replaceExactly,
    resolveVersion,
} from "./set-version.mjs";

test("met à jour Cargo.lock avec des fins de ligne Windows", () => {
    const lock =
        '[[package]]\r\nname = "neo-calendar-windows"\r\nversion = "1.52.1"\r\n';

    assert.equal(
        cargoLockWithVersion(lock, "1.53.0"),
        '[[package]]\r\nname = "neo-calendar-windows"\r\nversion = "1.53.0"\r\n'
    );
});

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

// Le dernier nombre ne bougeait jamais : toute livraison montait le mineur, si
// bien qu'une suite de 1.x.0 ne disait plus si la version répare ou ajoute.
test("une livraison qui ne fait que réparer monte le dernier nombre", () => {
    assert.equal(nextVersion("1.37.0", "patch"), "1.37.1");
    assert.equal(nextVersion("1.37.1", "patch"), "1.37.2");
});

test("une livraison qui ajoute monte le mineur et repart de zéro", () => {
    assert.equal(nextVersion("1.37.1", "minor"), "1.38.0");
    assert.equal(nextVersion("1.37.9", "minor"), "1.38.0");
});

test("une rupture monte le majeur et remet le reste à zéro", () => {
    assert.equal(nextVersion("1.38.2", "major"), "2.0.0");
});

test("refuse un niveau qui ne veut rien dire", () => {
    assert.throws(() => nextVersion("1.0.0", "grand"), /Niveau attendu/);
    assert.throws(() => nextVersion("1.0", "patch"), /illisible/);
});

test("un numéro écrit en toutes lettres passe tel quel", async () => {
    assert.equal(await resolveVersion("1.42.0"), "1.42.0");
});

test("refuse ce qui n'est ni un niveau ni un numéro", async () => {
    await assert.rejects(() => resolveVersion("v1.42"), /Attendu/);
    await assert.rejects(() => resolveVersion(undefined), /Attendu/);
});
