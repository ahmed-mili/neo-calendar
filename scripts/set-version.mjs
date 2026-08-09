/*
 * Monte la version partout d'un seul geste : `npm run version 1.0.3`.
 *
 * Le numéro suit celui des applications du téléphone — GitHub en 1.270.0,
 * Notion Calendar en 1.48.0 : c'est le MINEUR qui monte à chaque version
 * publiée, sans jamais se remettre à zéro. Le majeur ne bouge que si
 * l'application devient autre chose, et le correctif ne sert qu'à une rustine
 * posée sur une version déjà sortie. Une livraison ordinaire va donc de 1.6.0
 * à 1.7.0, pas à 1.6.1.
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

export function isVersion(value) {
    return /^\d+\.\d+\.\d+$/.test(value);
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
    const [version] = process.argv.slice(2);

    try {
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
