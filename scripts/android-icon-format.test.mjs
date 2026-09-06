import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { ANDROID_ICONS } from "./generate-android-icons.mjs";

const RES = "apps/android/native/app/src/main/res";

function readPngHeader(buffer, path) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(buffer.subarray(0, 8).equals(signature), `${path} must be a PNG`);
    assert.equal(
        buffer.toString("ascii", 12, 16),
        "IHDR",
        `${path} must start with IHDR`
    );
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        bitDepth: buffer[24],
        colorType: buffer[25],
    };
}

test("Android launcher PNGs are truecolor RGBA resources accepted by AAPT2", async () => {
    for (const { file } of ANDROID_ICONS) {
        const path = `${RES}/${file}`;
        const header = readPngHeader(await readFile(path), path);
        assert.equal(header.bitDepth, 8, `${path} must use 8-bit channels`);
        assert.equal(
            header.colorType,
            6,
            `${path} must be truecolor RGBA (PNG color type 6), not indexed/paletted`
        );
    }
});

test("each density carries the icon already at its own size", async () => {
    for (const { file, size } of ANDROID_ICONS) {
        const path = `${RES}/${file}`;
        const header = readPngHeader(await readFile(path), path);
        assert.equal(header.width, size, `${path} must be ${size} px wide`);
        assert.equal(header.height, size, `${path} must be ${size} px tall`);
    }
});

// L'autre moitié de la géométrie, celle que la 1.74.1 réglait dans l'autre
// sens. Son inset de 19 % gardait le PNG entier dans les 72 dp visibles, ce
// qui valait tant que l'illustration était un carré arrondi détouré : la
// rogner lui aurait coupé les coins. L'illustration d'aujourd'hui est un rendu
// plein cadre dont les bords ne sont que du fond, et la garder à l'intérieur
// laissait au contraire un anneau de `ic_launcher_background` autour d'elle,
// avec une arête carrée dans le masque rond du lanceur. Le premier plan doit
// donc couvrir la zone visible, et le masque ne rogner que du fond.
test("the adaptive foreground covers the whole masked area", async () => {
    const xml = await readFile(
        `${RES}/drawable/ic_launcher_foreground.xml`,
        "utf8"
    );
    const inset = xml.match(/android:inset="([0-9.]+)%"/);
    assert.ok(inset, "the adaptive foreground must declare an inset");

    // AdaptiveIconDrawable peint la couche sur 108 dp et n'en montre que les
    // 72 dp centraux, soit un agrandissement de 150 % avant le masque.
    const scale = (108 / 72) * (1 - (2 * Number(inset[1])) / 100);
    assert.ok(
        scale >= 1,
        `at ${inset[1]}% the artwork covers ${scale.toFixed(
            3
        )} of the masked area, so the background shows around it`
    );
    assert.ok(
        scale <= 1.15,
        `at ${inset[1]}% the artwork is blown up to ${scale.toFixed(
            3
        )} of the masked area, so the mask eats into the calendar`
    );
});

// La 1.74.0 est sortie avec une icône crénelée : elle vivait dans un unique
// `drawable-nodpi/neo_calendar_icon.png` de 768 px, qu'Android réduisait à
// 162 px au moment de peindre, sans pré-filtrage. Une ressource d'icône sans
// qualificateur de densité (ou en `nodpi`) laisse cette réduction au rendu,
// donc la seule parade est de n'en avoir aucune.
test("no icon bitmap escapes the density buckets", async () => {
    const entries = await readdir(RES, { withFileTypes: true });
    const offenders = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const type = entry.name.split("-")[0];
        if (type !== "drawable" && type !== "mipmap") continue;
        const qualifiers = entry.name.slice(type.length + 1);
        // `anydpi-v26` ne porte que des XML : ils décrivent la géométrie de
        // l'icône adaptative, ils ne sont pas rééchantillonnés.
        if (qualifiers && !qualifiers.startsWith("nodpi")) continue;
        for (const file of await readdir(`${RES}/${entry.name}`)) {
            if (!file.endsWith(".png")) continue;
            offenders.push(`${entry.name}/${file}`);
        }
    }
    assert.deepEqual(
        offenders,
        [],
        `these bitmaps have no density qualifier, so Android downscales them at paint time: ${offenders.join(
            ", "
        )}`
    );
});
