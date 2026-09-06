// Génère les icônes Android depuis apps/android/native/icon-source.png.
//
// Pourquoi ce script existe : Android ne pré-filtre pas un bitmap qu'il doit
// réduire au moment de peindre. Une icône fournie en un seul gros PNG (ou pire,
// en `drawable-nodpi`, qui interdit tout rééchantillonnage au chargement) est
// donc échantillonnée presque point par point vers la taille de l'écran, et
// les arêtes fines partent en escalier. La 1.74.0 l'a montré : 768 px réduits
// à 162 px sur un écran 480 dpi, et l'icône est sortie crénelée.
//
// La parade est de livrer chaque densité déjà à sa taille : la réduction de
// qualité (Lanczos) se fait ici, au build, et il ne reste presque rien à
// réduire à l'affichage.
//
//   node scripts/generate-android-icons.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "apps/android/native/icon-source.png");
const res = path.join(root, "apps/android/native/app/src/main/res");

// Facteur d'échelle de chaque seau de densité, relatif à mdpi.
const DENSITIES = {
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
};

// Tailles de base en dp.
//
// `neo_calendar_icon` sert deux consommateurs qui l'insèrent différemment :
// le premier plan de l'icône adaptative (inset 15 %) et l'icône de l'écran de
// démarrage (inset 30 %). C'est le second qui la peint le plus grand, à peu
// près 96 dp de bitmap, d'où cette base ; le lanceur n'a plus alors qu'une
// réduction inférieure à 2:1, que le filtrage d'Android absorbe sans marches.
const ICON_DP = 96;
// L'icône héritée, elle, n'est lue que par les lanceurs d'avant Android 8 :
// 48 dp, la taille standard.
const LEGACY_DP = 48;

export const ANDROID_ICONS = [
    ...Object.entries(DENSITIES).map(([density, scale]) => ({
        file: `drawable-${density}/neo_calendar_icon.png`,
        size: Math.round(ICON_DP * scale),
    })),
    // L'écran de démarrage pose l'icône à plat sur son fond, sans masque : une
    // image opaque y découpe un carré franc, que la 1.74.0 affichait à chaque
    // lancement. Celle-ci s'éteint sur ses bords, donc elle se fond dans le
    // fond quelle qu'en soit la couleur.
    ...Object.entries(DENSITIES).map(([density, scale]) => ({
        file: `drawable-${density}/splash_icon_image.png`,
        size: Math.round(ICON_DP * scale),
        fade: true,
    })),
    ...Object.entries(DENSITIES).flatMap(([density, scale]) =>
        ["ic_launcher", "ic_launcher_round"].map((name) => ({
            file: `mipmap-${density}/${name}.png`,
            size: Math.round(LEGACY_DP * scale),
        }))
    ),
];

// Un masque opaque au centre qui s'efface sur le pourtour. Le rayon des coins
// et la largeur du dégradé suivent la taille, pour que toutes les densités
// donnent la même image.
function fadeMask(size) {
    const blur = size * 0.06;
    const margin = blur * 1.2;
    const side = size - 2 * margin;
    return Buffer.from(
        `<svg width="${size}" height="${size}">` +
            `<defs><filter id="f" x="-20%" y="-20%" width="140%" height="140%">` +
            `<feGaussianBlur stdDeviation="${blur}" /></filter></defs>` +
            `<rect x="${margin}" y="${margin}" width="${side}" height="${side}" ` +
            `rx="${size * 0.18}" fill="#fff" filter="url(#f)" />` +
            `</svg>`
    );
}

async function main() {
    for (const { file, size, fade } of ANDROID_ICONS) {
        const target = path.join(res, file);
        await mkdir(path.dirname(target), { recursive: true });
        let image = sharp(source).resize(size, size, {
            kernel: "lanczos3",
            fit: "fill",
        });
        if (fade) {
            image = sharp(await image.ensureAlpha().png().toBuffer()).composite(
                [{ input: fadeMask(size), blend: "dest-in" }]
            );
        }
        const png = await image
            // AAPT2 refuse les PNG indexés ; on reste en truecolor RGBA.
            .ensureAlpha()
            .png({ compressionLevel: 9, palette: false })
            .toBuffer();
        await writeFile(target, png);
        console.log(
            `${file} — ${size}x${size}${fade ? " (bords fondus)" : ""}`
        );
    }
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}
