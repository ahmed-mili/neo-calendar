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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    if (
        words.length > 0 &&
        (LEVELS.includes(words[0]) || isVersion(words[0]))
    ) {
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
/*
 * Quand la version sera installable.
 *
 * Le chiffre n'est pas inventé : mesuré sur les huit dernières exécutions du
 * workflow Release, elles tiennent toutes entre 8 et 10 minutes. La fourchette
 * est annoncée telle quelle plutôt qu'un instant unique, qui serait faux dans
 * les deux sens.
 */
export const NEXT_VERSION_FILE = "docs/PROCHAINE_VERSION.md";

/** Le debut d'un point de la liste, coche ou non. */
const ITEM = /^\s*[-*]\s*\[[ xX]\]/;

/** Le debut d'un point fait. Seule une croix dit qu'il n'est plus a faire. */
const DONE = /^\s*[-*]\s*\[[xX]\]/;

/*
 * La livraison raye du pense-bete les points coches, et eux seuls.
 *
 * Elle effacait la liste entiere, au motif que ce qui est livre n'est plus a
 * faire. Mesure le 2026-09-02 : la 1.68.0 a emporte onze points qui
 * attendaient depuis des versions et qu'elle n'avait pas livres. La perte est
 * seche — le fichier n'etant pas versionne, aucun `git checkout` ne le
 * ramene — et silencieuse, puisque rien ne distingue une liste videe d'une
 * liste faite. Seule une croix dit « c'est fait » ; le reste attend, et une
 * livraison n'a pas a en decider.
 *
 * Un point tient sur plusieurs lignes, les suivantes indentees : elles partent
 * avec la leur, sans quoi la liste garderait des paragraphes sans sujet. Un
 * titre de section et une ligne vide commencent a la marge, ils ferment donc
 * le point en cours et survivent.
 *
 * Le fichier n'est reecrit que s'il change vraiment : une livraison qui ne
 * coche rien — de loin la plus frequente — ne le touche pas et n'annonce pas
 * un menage qu'elle n'a pas fait.
 *
 * Le fichier absent n'est pas une erreur : on ne recree pas un document que
 * quelqu'un a delibere de supprimer.
 */
export function resetNextVersion(root = process.cwd()) {
    const file = path.join(root, NEXT_VERSION_FILE);
    if (!existsSync(file)) return null;

    // Tout ce qui precede la premiere ligne de separation est le mode d'emploi
    // du fichier : il reste intact, seule la liste qui le suit est relue.
    const SEPARATOR = ["", "---", ""].join("\n");
    const text = readFileSync(file, "utf8");
    const cut = text.indexOf(SEPARATOR);
    if (cut < 0) return null;

    const head = text.slice(0, cut + SEPARATOR.length);
    const kept = [];
    let dropping = false;

    for (const line of text.slice(cut + SEPARATOR.length).split("\n")) {
        if (ITEM.test(line)) dropping = DONE.test(line);
        else if (!/^\s+\S/.test(line)) dropping = false;
        if (!dropping) kept.push(line);
    }

    // Seule la fin est rognee : ce qui separe le mode d'emploi du premier
    // titre appartient au fichier tel qu'il est ecrit, pas a cette fonction.
    const list = kept.join("\n").replace(/\s+$/, "");
    const next = list.trim()
        ? `${head}${list}\n`
        : `${head}\n_Rien en attente._\n`;
    if (next === text) return null;

    writeFileSync(file, next);
    return NEXT_VERSION_FILE;
}

const BUILD_MINUTES = [8, 10];

export function readyAt(now = new Date()) {
    const clock = (minutes) =>
        new Date(now.getTime() + minutes * 60000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    const [fastest, slowest] = BUILD_MINUTES;
    return `Version prête entre ${clock(fastest)} et ${clock(slowest)}.`;
}

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

    const cleared = resetNextVersion();
    if (cleared) console.log(`  ${cleared} (points coches rayes)`);

    console.log("");
    run("git", ["commit", "-am", `Version ${version}`]);
    run("git", ["tag", `v${version}`]);
    run("git", ["push", "--atomic", "origin", BRANCH, `v${version}`]);

    const actions = actionsUrl(git(["remote", "get-url", "origin"]).trim());
    console.log(`\nVersion ${version} livrée.`);
    console.log(`  ${readyAt()}`);
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
