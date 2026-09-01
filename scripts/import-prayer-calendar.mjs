/*
 * Un calendrier annuel de prière de mosquée, converti en table utilisable.
 *
 * Les mosquées publient un PDF par an — celui que Mawaqit imprime : une page par
 * mois, une ligne par jour, six colonnes d'heures (Fajr, Chourouk, Dhuhr, Asr,
 * Maghrib, Isha), et le vendredi porte ses horaires de Jumu'a dans le libellé du
 * jour plutôt que dans une colonne. Ce script en tire la table que
 * l'application lit, et rien d'autre : aucun horaire n'est recalculé, aucun
 * n'est arrondi. Ce que la mosquée imprime est ce qui s'affiche.
 *
 * À relancer chaque année, quand les mosquées publient le PDF suivant :
 *
 *   node scripts/import-prayer-calendar.mjs \
 *     --pdf "~/Downloads/calendar.pdf" \
 *     --id foi-et-unicite \
 *     --name "Mosquée Foi et Unicité"
 *
 * Le nom est donné à la main parce que le PDF ne le rend pas lisible : sa
 * police n'embarque pas de table ToUnicode pour les accents, et « Mosquée »
 * ressort en « Mosqu<FFFD>e ». Le script imprime l'en-tête qu'il a lu, pour que
 * l'on vérifie viser le bon fichier.
 *
 * Dépend de `pdftotext` (poppler), présent avec Git for Windows. Sans lui le
 * script s'arrête en le disant plutôt qu'en produisant une table vide.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUTPUT_DIRECTORY = path.join("src", "ui", "calendar", "prayerTimetables");

/** Les six colonnes d'heures, dans l'ordre où le PDF les imprime. */
export const COLUMNS = [
    "fajr",
    "sunrise",
    "dhuhr",
    "asr",
    "maghrib",
    "isha",
];

const TIME = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

/** Minutes depuis minuit. L'unité de tout ce qui suit : la grille place ses
 *  traits en heures décimales, et une heure est plus vite comparée en entier
 *  qu'en chaîne. */
export function minutesOf(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

/**
 * Une ligne du PDF.
 *
 * Les six dernières heures de la ligne sont les colonnes ; celles qui les
 * précèdent appartiennent au libellé du jour, donc à Jumu'a. Compter depuis la
 * fin est ce qui rend la lecture insensible au nombre de séances que la mosquée
 * annonce et à la longueur du libellé.
 */
export function parseLine(line) {
    const date = line.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (!date) return null;

    const times = [...line.matchAll(TIME)].map((match) => match[0]);
    if (times.length < COLUMNS.length) return null;

    const columns = times.slice(-COLUMNS.length);
    const jumua = times.slice(0, times.length - COLUMNS.length);

    return {
        year: Number(date[3]),
        month: Number(date[2]),
        key: `${date[2]}-${date[1]}`,
        minutes: columns.map(minutesOf),
        jumua,
    };
}

/** Le mois qu'une page annonce dans son en-tête, ou `null` si ce n'en est pas
 *  une : « Calendrier annuel de prière   03 ». */
export function pageMonthOf(line) {
    const header = line.match(/Calendrier annuel de pri.re\s+(\d{2})\s*$/);
    return header ? Number(header[1]) : null;
}

export function parseCalendar(text) {
    const days = new Map();
    const jumuaSets = new Map();
    let year = null;
    let pageMonth = null;

    for (const line of text.split(/\r?\n/)) {
        const month = pageMonthOf(line);
        if (month !== null) {
            pageMonth = month;
            continue;
        }

        const parsed = parseLine(line);
        if (!parsed) continue;

        /*
         * La grille d'un mois court déborde d'une ligne sur le mois suivant :
         * la page de février finit sur un 1er mars, sans date hégirienne et
         * avec des horaires d'une minute en écart de ceux que la page de mars
         * imprimera pour ce même jour. C'est la page du mois qui fait foi pour
         * ses propres jours, donc une ligne dont le mois n'est pas celui de sa
         * page est un débordement, et on la laisse.
         */
        if (pageMonth !== null && parsed.month !== pageMonth) continue;

        year ??= parsed.year;
        if (parsed.year !== year) {
            throw new Error(
                `Le PDF mêle deux années (${year} et ${parsed.year}).`
            );
        }
        if (days.has(parsed.key)) {
            throw new Error(`Le jour ${parsed.key} apparaît deux fois.`);
        }
        days.set(parsed.key, parsed.minutes);
        if (parsed.jumua.length) {
            jumuaSets.set(parsed.jumua.join(" "), parsed.jumua);
        }
    }

    if (days.size < 365) {
        throw new Error(
            `Seulement ${days.size} jours lus : le PDF est incomplet ou sa mise en page a changé.`
        );
    }

    return { year, days, jumuaSets };
}

function argument(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
    const pdf = argument("pdf");
    const id = argument("id");
    const name = argument("name");

    if (!pdf || !id || !name) {
        console.error(
            "usage: node scripts/import-prayer-calendar.mjs --pdf <fichier> --id <identifiant> --name <nom affiché>"
        );
        process.exitCode = 1;
        return;
    }

    let text;
    try {
        text = execFileSync("pdftotext", ["-layout", pdf, "-"], {
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
        });
    } catch (error) {
        throw new Error(
            `pdftotext n'a pas pu lire « ${pdf} » : ${error.message}`
        );
    }

    // Ce que le PDF dit de lui-meme, pour verifier qu'on vise le bon fichier.
    const header = text
        .split(/\r?\n/)
        .slice(0, 4)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" | ");
    console.log(`  lu : ${header}`);

    const { year, days, jumuaSets } = parseCalendar(text);

    // Une mosquée annonce ses séances de Jumu'a une fois pour l'année. Si le PDF
    // en donne plusieurs jeux différents, les écraser en un seul mentirait :
    // mieux vaut s'arrêter et regarder.
    if (jumuaSets.size !== 1) {
        throw new Error(
            `${jumuaSets.size} jeux d'horaires de Jumu'a différents dans l'année : ${[
                ...jumuaSets.keys(),
            ].join(" / ")}`
        );
    }

    const timetable = {
        id,
        name,
        year,
        jumua: [...jumuaSets.values()][0],
        days: Object.fromEntries([...days.entries()].sort()),
    };

    /*
     * Un module TypeScript, pas un JSON : le tsconfig de la racine — celui du
     * plugin et des tests — n'active pas `resolveJsonModule`, et un `.json`
     * importé depuis src/ ne compilerait que dans les deux applications. Un
     * module se lit partout, et se type tout seul.
     */
    const lines = Object.entries(timetable.days).map(
        ([key, minutes]) => `        "${key}": [${minutes.join(", ")}],`
    );
    const source = [
        "// Fichier produit par scripts/import-prayer-calendar.mjs — ne pas modifier a la main.",
        `// Source : le calendrier annuel ${timetable.year} publie par la mosquee.`,
        `// Regenerer : node scripts/import-prayer-calendar.mjs --pdf <fichier> --id ${id} --name "${name}"`,
        'import type { PrayerTimetable } from "../prayerTimes";',
        "",
        "const timetable: PrayerTimetable = {",
        `    id: "${timetable.id}",`,
        `    name: "${timetable.name}",`,
        `    year: ${timetable.year},`,
        `    jumua: [${timetable.jumua.map((time) => `"${time}"`).join(", ")}],`,
        "    // Par jour « MM-JJ », les minutes depuis minuit de",
        `    // [${COLUMNS.join(", ")}].`,
        "    days: {",
        ...lines,
        "    },",
        "};",
        "",
        "export default timetable;",
        "",
    ].join("\n");

    mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
    const file = path.join(OUTPUT_DIRECTORY, `${id}.ts`);
    writeFileSync(file, source);

    console.log(
        `  ${file} — ${days.size} jours de ${year}, Jumu'a ${timetable.jumua.join(
            " & "
        )}`
    );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
