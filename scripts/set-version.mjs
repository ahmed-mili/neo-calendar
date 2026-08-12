/*
 * Monte la version partout d'un seul geste :
 *
 *   npm run version:set -- patch     1.37.0 → 1.37.1
 *   npm run version:set -- minor     1.37.1 → 1.38.0
 *   npm run version:set -- major     1.38.0 → 2.0.0
 *   npm run version:set -- 1.42.0    le numéro exact, quand il le faut
 *
 * CE QUE DIT UN NUMÉRO. Les trois nombres ne sont pas décoratifs : ils
 * répondent à « qu'est-ce que ça change pour moi ? », et c'est la seule
 * question que se pose quelqu'un devant une mise à jour.
 *
 *   MAJEUR    l'application devient autre chose : un format de note qui ne se
 *             relit plus comme avant, un réglage qui disparaît, une habitude
 *             qui casse. Ce qui se lisait hier ne se lit plus pareil.
 *   MINEUR    quelque chose de neuf que l'on peut faire et que l'on ne pouvait
 *             pas : les sous-tâches, une vue, un réglage. Rien ne casse.
 *   CORRECTIF le dernier nombre. Rien de neuf : ce qui existait déjà marche
 *             enfin comme il devait. Un décalage de trois pixels rattrapé, un
 *             panneau qui ne se recharge plus, une bande qui s'anime.
 *
 * Il servait de rustine d'urgence et rien d'autre, si bien que toute livraison
 * — trois corrections comprises — montait le mineur : la version passait de
 * 1.36.0 à 1.37.0 pour dire « il s'est passé quelque chose », et jamais quoi.
 * Une suite de 1.x.0 ne distingue plus la version qui répare de celle qui
 * ajoute, alors que c'est exactement ce qu'un numéro est là pour dire.
 *
 * Le mineur ne se remet pas à zéro en changeant de majeur ? Si — c'est ce que
 * `nextVersion` fait, et c'est la règle commune (semver) : 1.38.0 → 2.0.0.
 *
 * Six fichiers portent le même numéro, et l'un d'eux — le `versionCode` du
 * module Android — doit en plus être strictement croissant, sans quoi le
 * téléphone refuse la mise à jour. Le tenir à la main, c'est en oublier un.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

const PACKAGES = [
    "package.json",
    "apps/windows/package.json",
    "apps/android/package.json",
];

/** Les lockfiles répètent le numéro du paquet qu'ils décrivent, deux fois. */
const LOCKFILES = [
    "package-lock.json",
    "apps/windows/package-lock.json",
    "apps/android/package-lock.json",
];

const TAURI_CONFIG = "apps/windows/src-tauri/tauri.conf.json";
const CARGO_MANIFEST = "apps/windows/src-tauri/Cargo.toml";
const CARGO_LOCK = "apps/windows/src-tauri/Cargo.lock";
const GRADLE_MODULE = "apps/android/native/app/build.gradle.kts";

/**
 * Every file this script rewrites — the ones that change on a release because
 * a release happened, not because anything was built differently.
 *
 * Exported so `releaseScope.mjs` can subtract them when it works out which
 * platforms a release actually touched. Kept here rather than copied there so
 * the two can never drift: whatever the bump writes is exactly what is not
 * evidence of a change.
 */
export const VERSION_FILES = [
    ...PACKAGES,
    ...LOCKFILES,
    TAURI_CONFIG,
    CARGO_MANIFEST,
    CARGO_LOCK,
    GRADLE_MODULE,
];

export function isVersion(value) {
    return /^\d+\.\d+\.\d+$/.test(value);
}

/** Les trois mots qui décrivent une livraison, du plus lourd au plus léger. */
export const LEVELS = ["major", "minor", "patch"];

/**
 * Le numéro suivant, à partir de celui d'aujourd'hui et de ce que la livraison
 * change. Voir l'en-tête pour ce que chaque niveau veut dire.
 */
export function nextVersion(current, level) {
    if (!isVersion(current)) {
        throw new Error(`Version actuelle illisible : « ${current} ».`);
    }
    const [major, minor, patch] = current.split(".").map(Number);

    switch (level) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error(
                `Niveau attendu parmi ${LEVELS.join(", ")}, reçu « ${level} ».`
            );
    }
}

/** Le numéro que porte le dépôt en ce moment. */
export async function currentVersion() {
    const manifest = await readFile(
        path.join(repositoryRoot, "package.json"),
        "utf8"
    );
    const found = manifest.match(/"version": "([^"]+)"/);

    if (!found) {
        throw new Error("Version introuvable dans package.json.");
    }

    return found[1];
}

/**
 * Ce qui est demandé, résolu en un numéro : « patch » et consorts se lisent à
 * partir de la version en place, un numéro écrit en toutes lettres passe tel
 * quel — il reste des cas (une reprise, un alignement) où c'est le seul moyen.
 */
export async function resolveVersion(request) {
    if (!request) {
        throw new Error(
            `Attendu : ${LEVELS.join(" | ")} ou un numéro comme 1.42.0.`
        );
    }
    if (LEVELS.includes(request)) {
        return nextVersion(await currentVersion(), request);
    }
    if (isVersion(request)) return request;

    throw new Error(
        `Attendu : ${LEVELS.join(" | ")} ou un numéro comme 1.42.0, ` +
            `reçu « ${request} ».`
    );
}

async function edit(relativePath, rewrite) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    const before = await readFile(absolutePath, "utf8");
    const after = rewrite(before);

    if (after === before) {
        throw new Error(`Rien à changer dans ${relativePath}.`);
    }

    await writeFile(absolutePath, after);
    return relativePath;
}

/**
 * Remplace exactement `count` occurrences, ou échoue plutôt que d'en rater une.
 *
 * Le comptage passe par une copie globale du motif : `match` sans le drapeau `g`
 * rend les groupes de capture, pas les occurrences, et compterait « un »
 * remplacement comme trois.
 */
export function replaceExactly(text, pattern, replacement, count, description) {
    const everywhere = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
    );
    const found = [...text.matchAll(everywhere)].length;

    if (found !== count) {
        throw new Error(
            `${description} : ${count} occurrence(s) attendue(s), ${found} trouvée(s).`
        );
    }

    return text.replace(pattern, replacement);
}

export function nextVersionCode(gradleModule) {
    const match = gradleModule.match(/versionCode = (\d+)/);

    if (!match) {
        throw new Error("versionCode introuvable dans le module Gradle.");
    }

    return Number(match[1]) + 1;
}

export async function setVersion(version) {
    if (!isVersion(version)) {
        throw new Error(
            `Version attendue sous la forme 1.2.3, reçu « ${version} ».`
        );
    }

    const touched = [];

    for (const relativePath of PACKAGES) {
        touched.push(
            await edit(relativePath, (text) =>
                replaceExactly(
                    text,
                    /("version": ")[^"]+(")/,
                    `$1${version}$2`,
                    1,
                    relativePath
                )
            )
        );
    }

    // Le numéro du paquet lui-même ouvre le fichier, puis se répète dans
    // l'entrée qui le décrit ; les versions des dépendances viennent après.
    for (const relativePath of LOCKFILES) {
        touched.push(
            await edit(relativePath, (text) => {
                let seen = 0;

                return text.replace(/"version": "[^"]+"/g, (match) => {
                    seen += 1;
                    return seen <= 2 ? `"version": "${version}"` : match;
                });
            })
        );
    }

    touched.push(
        await edit(TAURI_CONFIG, (text) =>
            replaceExactly(
                text,
                /("version": ")[^"]+(")/,
                `$1${version}$2`,
                1,
                TAURI_CONFIG
            )
        )
    );

    touched.push(
        await edit(CARGO_MANIFEST, (text) =>
            replaceExactly(
                text,
                /^version = "[^"]+"$/m,
                `version = "${version}"`,
                1,
                CARGO_MANIFEST
            )
        )
    );

    touched.push(
        await edit(CARGO_LOCK, (text) =>
            replaceExactly(
                text,
                /(name = "neo-calendar-windows"\nversion = ")[^"]+(")/,
                `$1${version}$2`,
                1,
                CARGO_LOCK
            )
        )
    );

    touched.push(
        await edit(GRADLE_MODULE, (text) => {
            const bumped = replaceExactly(
                text,
                /versionCode = \d+/,
                `versionCode = ${nextVersionCode(text)}`,
                1,
                `${GRADLE_MODULE} (versionCode)`
            );

            return replaceExactly(
                bumped,
                /versionName = "[^"]+"/,
                `versionName = "${version}"`,
                1,
                `${GRADLE_MODULE} (versionName)`
            );
        })
    );

    return touched;
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    const [request] = process.argv.slice(2);

    try {
        const version = await resolveVersion(request);
        const touched = await setVersion(version);
        for (const relativePath of touched) {
            console.log(`  ${relativePath}`);
        }
        console.log(`\nVersion ${version}. Reste à publier :`);
        console.log(`  git commit -am "Version ${version}"`);
        console.log(
            `  git tag v${version} && git push origin main v${version}`
        );
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
