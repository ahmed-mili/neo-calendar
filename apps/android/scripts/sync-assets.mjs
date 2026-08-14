import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = new URL("../dist/", import.meta.url);
const dst = new URL("../native/app/src/main/assets/", import.meta.url);

/*
 * Les fonds d'écran ne voyagent plus dans l'APK.
 *
 * Onze mégaoctets de photographies y représentaient les trois quarts de chaque
 * mise à jour, pour des fichiers qui ne changent jamais — retéléchargés en
 * entier à chaque version, et perdus à chaque désinstallation. Ils vivent
 * maintenant dans `.neo-calendar/wallpapers/` du dossier de données, où ils
 * arrivent un par un quand on les choisit et où ils restent ensuite.
 *
 * Ce qui reste ici : les vignettes (552 Ko pour vingt-quatre) et le manifeste.
 * Les garder est ce qui permet au sélecteur de s'ouvrir instantanément et hors
 * ligne — on voit ce qu'on choisit avant de payer le transfert. À cent fonds ce
 * sera 2,3 Mo, ce qui reste très en dessous des quarante-quatre qu'auraient
 * coûté les originaux.
 */
const WALLPAPERS = "themes/neo-wallpapers";
const root = fileURLToPath(src);

function keep(source) {
    const relative = path
        .relative(root, source)
        .split(path.sep)
        .join("/");

    if (!relative.startsWith(`${WALLPAPERS}/`)) return true;

    const rest = relative.slice(WALLPAPERS.length + 1);
    // Les vignettes et le manifeste restent ; les pleines résolutions, non.
    return rest.startsWith("thumbs/") || !/\.jpe?g$/i.test(rest);
}

function bytesOf(directory) {
    let total = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        total += entry.isDirectory()
            ? bytesOf(full)
            : fs.statSync(full).size;
    }
    return total;
}

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true, filter: keep });

const before = bytesOf(root);
const after = bytesOf(fileURLToPath(dst));
const mo = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

console.log(`Synced Android web assets to ${fileURLToPath(dst)}`);
console.log(
    `${mo(after)} embarqués, ${mo(before - after)} laissés dehors ` +
        `(fonds d'écran en pleine résolution).`
);
