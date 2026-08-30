/*
 * Livre une version d'un seul geste :
 *
 *   git ship "Fix description toolbar overflow"   le travail, puis 1.53.2 → 1.53.3
 *   git ship minor "Add the sub-tasks"            le travail, puis 1.53.3 → 1.54.0
 *   git ship 1.60.0 "Align both stores"           le numéro exact, quand il le faut
 *   git ship                                      l'arbre est déjà propre : bump seul
 *   git ship --watch "Fix a leak"                 et reste devant la CI
 *
 * L'alias se pose une fois :
 *
 *   git config --global alias.ship '!node scripts/ship.mjs'
 *
 * Git exécute un alias `!` depuis la racine du dépôt, si bien que le chemin
 * relatif suffit : la commande n'existe que là où ce fichier existe.
 *
 * CE QUE FAIT LA COMMANDE, dans cet ordre :
 *
 *   1. les gardes — la branche main, un distant qui n'a pas avancé sans nous ;
 *   2. le commit du travail, quand il y en a ;
 *   3. la montée de version dans les six fichiers (`set-version.mjs`) ;
 *   4. le commit « Version X » et l'étiquette `vX` ;
 *   5. le push, atomique, de la branche ET de l'étiquette.
 *
 * Le push est la DERNIÈRE étape, et il est atomique. Tout ce qui casse avant
 * lui reste local, donc rattrapable ; et une branche refusée n'abandonne pas
 * derrière elle une étiquette poussée toute seule, qui déclencherait une
 * release sur un commit que personne d'autre n'a.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    LEVELS,
    isVersion,
    resolveVersion,
    setVersion,
} from "./set-version.mjs";

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

const BRANCH = "main";

/**
 * Ce que la ligne de commande demande. Le niveau est facultatif — une
 * livraison sur deux ne fait que réparer — et le message aussi, puisque le
 * travail peut déjà être commité.
 */
export function readArguments(args) {
    const words = [];
    let watch = false;

    for (const argument of args) {
        if (argument === "--watch") {
            watch = true;
            continue;
        }
        if (argument.startsWith("-")) {
            throw new Error(
                `Drapeau inconnu : « ${argument} ». Seul --watch existe.`
            );
        }
        words.push(argument);
    }

    let request = "patch";
    if (words.length > 0 && (LEVELS.includes(words[0]) || isVersion(words[0]))) {
        request = words.shift();
    }

    const message = words.shift();

    if (words.length > 0) {
        throw new Error(
            `Un mot de trop : « ${words.join(" ")} ». Le message du commit ` +
                "tient entre guillemets, en un seul argument."
        );
    }

    return { request, message, watch };
}

/**
 * Y a-t-il un commit de travail à faire avant la montée de version ? Les deux
 * désaccords possibles entre l'arbre et la ligne de commande s'arrêtent ici,
 * avant que quoi que ce soit ne bouge.
 */
export function worksToCommit(message, dirty) {
    if (dirty && !message) {
        throw new Error(
            "Des changements attendent d'être commités : donne leur message.\n" +
                '  git ship "Ce que ça change"'
        );
    }
    if (!message) return false;
    if (!dirty) {
        throw new Error(
            `Rien à commiter : « ${message} » ne s'accrocherait à aucun ` +
                "changement. Sans message, la commande monte la version seule."
        );
    }
    return true;
}

/** La page des exécutions du dépôt, pour aller voir la release se construire. */
export function actionsUrl(remote) {
    const found = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return found ? `https://github.com/${found[1]}/actions` : undefined;
}

function git(args, options = {}) {
    return execFileSync("git", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        ...options,
    });
}

/** Les mêmes commandes, mais leur sortie va à l'écran : on suit ce qui se passe. */
function run(command, args) {
    console.log(`  ${command} ${args.join(" ")}`);
    execFileSync(command, args, { cwd: repositoryRoot, stdio: "inherit" });
}

/**
 * Ce qui doit être vrai avant de toucher à quoi que ce soit. Chacune de ces
 * vérifications a sa raison d'être ici plutôt qu'au moment du push : passé le
 * premier commit, l'échec laisse un dépôt à démêler à la main.
 */
function guard(version) {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    if (branch !== BRANCH) {
        throw new Error(
            `Une version se livre depuis ${BRANCH}, pas depuis « ${branch} ».`
        );
    }

    if (git(["tag", "--list", `v${version}`]).trim()) {
        throw new Error(
            `L'étiquette v${version} existe déjà : cette version est publiée.`
        );
    }

    // Le distant a-t-il avancé sans nous ? Le savoir maintenant coûte un
    // fetch ; le savoir au push coûte un commit et une étiquette à défaire.
    git(["fetch", "--quiet", "origin", BRANCH]);
    const behind = git([
        "rev-list",
        "--count",
        `HEAD..origin/${BRANCH}`,
    ]).trim();

    if (behind !== "0") {
        throw new Error(
            `origin/${BRANCH} a ${behind} commit(s) d'avance. ` +
                "Rattrape-les avant de livrer :\n  git pull --rebase"
        );
    }
}

async function ship(args) {
    const { request, message, watch } = readArguments(args);

    const dirty = git(["status", "--porcelain"]).trim() !== "";
    const commitWork = worksToCommit(message, dirty);

    const version = await resolveVersion(request);
    guard(version);

    if (commitWork) {
        run("git", ["add", "-A"]);
        run("git", ["commit", "-m", message]);
    }

    console.log(`\nVersion ${version} :`);
    for (const relativePath of await setVersion(version)) {
        console.log(`  ${relativePath}`);
    }

    console.log("");
    run("git", ["commit", "-am", `Version ${version}`]);
    run("git", ["tag", `v${version}`]);
    run("git", ["push", "--atomic", "origin", BRANCH, `v${version}`]);

    const actions = actionsUrl(git(["remote", "get-url", "origin"]).trim());
    console.log(`\nVersion ${version} livrée.`);
    if (actions) console.log(`  ${actions}`);

    if (watch) {
        // `gh` peut manquer, et une CI que l'on n'a pas pu suivre ne défait
        // pas une version déjà poussée : la commande a fait son travail.
        try {
            run("gh", ["run", "watch", "--exit-status"]);
        } catch (error) {
            console.error(`\nSuivi impossible : ${error.message}`);
        }
    }
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    try {
        await ship(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
