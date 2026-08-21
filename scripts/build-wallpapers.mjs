/*
 * Le catalogue des fonds d'écran, fabriqué à partir du dossier lui-même.
 *
 * Ajouter un fond d'écran doit rester UN geste : déposer un JPEG dans
 * `apps/windows/public/themes/neo-wallpapers/`, lancer `npm run wallpapers`,
 * committer. Le reste — la vignette, les dimensions, le poids, l'entrée dans le
 * manifeste — est déduit du fichier. À vingt-quatre images on pourrait tenir un
 * JSON à la main ; à cent, personne ne le fait, et un catalogue qu'on n'ose plus
 * modifier est un catalogue qui cesse de grandir.
 *
 * Les vignettes et le manifeste sont COMMITTÉS plutôt que produits au moment de
 * la release : l'app les lit sur raw.githubusercontent, ce qui ne demande aucun
 * changement au workflow, et un fond d'écran ajouté est disponible dès que le
 * commit est poussé — sans attendre une version.
 *
 * Le script est idempotent : il ne réécrit une vignette que si elle manque ou
 * si l'original est plus récent, donc le relancer ne salit pas le diff.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const WALLPAPERS = path.join(
    root,
    "apps/windows/public/themes/neo-wallpapers"
);
const THUMBS = path.join(WALLPAPERS, "thumbs");
const MANIFEST = path.join(WALLPAPERS, "wallpapers.json");
const CATALOGUE = path.join(root, "apps/windows/src/themes/wallpapers.ts");

/** Assez large pour rester net sur une tuile de sélecteur, assez petit pour que
    parcourir cent fonds coûte quelques mégaoctets et non quarante. */
const THUMB_WIDTH = 320;
const THUMB_QUALITY = 72;

/** Le titre affiché, déduit du nom de fichier : `alpine-crown` → `Alpine crown`.
    Un humain nomme le fichier, la casse suit. */
function titleFrom(slug) {
    const words = slug.replace(/[-_]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

async function newerThan(source, target) {
    try {
        const [a, b] = await Promise.all([fs.stat(source), fs.stat(target)]);
        return a.mtimeMs > b.mtimeMs;
    } catch {
        return true; // la vignette n'existe pas encore
    }
}

async function main() {
    await fs.mkdir(THUMBS, { recursive: true });

    const names = (await fs.readdir(WALLPAPERS))
        .filter((name) => /\.jpe?g$/i.test(name))
        .sort();

    if (names.length === 0) {
        throw new Error(`Aucune image dans ${WALLPAPERS}`);
    }

    const entries = [];
    let built = 0;

    for (const name of names) {
        const full = path.join(WALLPAPERS, name);
        const slug = name.replace(/\.jpe?g$/i, "");
        const thumbName = `${slug}.jpg`;
        const thumb = path.join(THUMBS, thumbName);

        const image = sharp(full);
        const { width, height } = await image.metadata();
        const { size } = await fs.stat(full);

        if (await newerThan(full, thumb)) {
            await sharp(full)
                .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
                .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
                .toFile(thumb);
            built += 1;
        }

        // L'empreinte voyage avec l'entrée : l'app refuse un fichier qui n'est
        // pas celui annoncé, exactement comme elle le fait pour l'APK.
        const sha256 = createHash("sha256")
            .update(await fs.readFile(full))
            .digest("hex");

        entries.push({
            id: slug,
            title: titleFrom(slug),
            file: name,
            thumb: `thumbs/${thumbName}`,
            width,
            height,
            bytes: size,
            sha256,
        });
    }

    const manifest = {
        // La version du FORMAT, pas du contenu : elle ne bouge que si la forme
        // des entrées change, pour qu'une app plus ancienne sache renoncer
        // plutôt que de lire de travers.
        format: 1,
        wallpapers: entries,
    };

    await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 4) + "\n");

    const totalMo = entries.reduce((sum, e) => sum + e.bytes, 0) / 1024 / 1024;
    console.log(
        `${entries.length} fonds d'écran, ${totalMo.toFixed(1)} Mo en pleine ` +
            `résolution — ${built} vignette(s) (re)fabriquée(s).`
    );
    console.log(`Manifeste : ${path.relative(root, MANIFEST)}`);

    await reportMissingFromCatalogue(entries);
}

/*
 * Le libellé et la description sont écrits par un humain, en français, et le
 * script ne peut pas les deviner : le catalogue reste donc à la main. Ce qu'on
 * peut faire, c'est ne jamais laisser deviner ce qu'il reste à faire — le
 * script dit quelles images n'y sont pas encore et donne le texte à coller,
 * plutôt que de laisser découvrir l'oubli en ouvrant le sélecteur.
 */
async function reportMissingFromCatalogue(entries) {
    let source;
    try {
        source = await fs.readFile(CATALOGUE, "utf8");
    } catch {
        return;
    }

    // On cherche l'identifiant et non le chemin : le catalogue monte les deux
    // formats d'une même photo à partir d'une seule ligne, et les chemins y
    // sont donc calculés plutôt qu'écrits.
    const missing = entries.filter(
        (entry) => !source.includes(`"${entry.id}"`)
    );
    if (missing.length === 0) {
        console.log("Catalogue à jour : chaque image y a son entrée.");
        return;
    }

    console.log(
        `\n${missing.length} image(s) sans entrée dans ` +
            `${path.relative(root, CATALOGUE)}.\n` +
            `À ajouter à WALLPAPER_IDS puis à WALLPAPERS ` +
            `(libellé et description à écrire) :\n`
    );

    for (const entry of missing) {
        // Une photo plus haute que large est faite pour un téléphone ; l'inverse
        // pour un écran d'ordinateur. Le déduire évite le seul champ qu'on se
        // trompe systématiquement à remplir.
        const portrait = entry.height > entry.width;
        console.log(
            `    {
        id: "${entry.id}",
        label: "${entry.title}",
        description: "",
        imageUrl: "/themes/neo-wallpapers/${entry.file}",
        previewStyle: "image",
        target: "${portrait ? "android" : "pc"}",
        aspect: "${portrait ? "portrait" : "landscape"}",
    },`
        );
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
