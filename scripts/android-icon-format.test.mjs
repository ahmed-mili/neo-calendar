import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const SOURCE_ICON_PATH =
    "apps/android/native/app/src/main/res/drawable-nodpi/neo_calendar_icon.png";
const ADAPTIVE_FOREGROUND_PATH =
    "apps/android/native/app/src/main/res/drawable/ic_launcher_foreground.xml";
const ADAPTIVE_ICON_PATHS = [
    "apps/android/native/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    "apps/android/native/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
];
const ANDROID_ICON_PATHS = [
    SOURCE_ICON_PATH,
    "apps/android/native/app/src/main/res/mipmap/ic_launcher.png",
    "apps/android/native/app/src/main/res/mipmap/ic_launcher_round.png",
];

function readPngHeader(buffer, path) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(buffer.subarray(0, 8).equals(signature), `${path} must be a PNG`);
    assert.equal(buffer.toString("ascii", 12, 16), "IHDR", `${path} must start with IHDR`);
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        bitDepth: buffer[24],
        colorType: buffer[25],
    };
}

async function readVisibleAlphaBounds(path, minimumAlpha = 5) {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaChannel = info.channels - 1;
    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            const alpha = data[(y * info.width + x) * info.channels + alphaChannel];
            if (alpha < minimumAlpha) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }

    assert.ok(right >= left && bottom >= top, `${path} must contain visible pixels`);
    return {
        width: info.width,
        height: info.height,
        visibleWidth: right - left + 1,
        visibleHeight: bottom - top + 1,
    };
}

test("Android launcher PNGs are truecolor RGBA resources accepted by AAPT2", async () => {
    for (const path of ANDROID_ICON_PATHS) {
        const header = readPngHeader(await readFile(path), path);
        assert.ok(header.width >= 256 && header.height >= 256, `${path} must be at least 256x256`);
        assert.equal(header.bitDepth, 8, `${path} must use 8-bit channels`);
        assert.equal(
            header.colorType,
            6,
            `${path} must be truecolor RGBA (PNG color type 6), not indexed/paletted`
        );
    }
});

test("Android adaptive launcher keeps the complete rounded-square artwork visible", async () => {
    const foreground = await readFile(ADAPTIVE_FOREGROUND_PATH, "utf8");
    assert.match(
        foreground,
        /android:drawable="@drawable\/neo_calendar_icon"/,
        "the adaptive foreground must use the complete Neo Calendar artwork"
    );

    const insetMatch = foreground.match(/android:inset="([0-9.]+)%"/);
    assert.ok(insetMatch, "the adaptive foreground must declare an inset");
    const insetFraction = Number(insetMatch[1]) / 100;

    // AdaptiveIconDrawable lays a 108dp layer behind a 72dp viewport, so the
    // layer is effectively drawn at 150% before the OEM mask is applied.
    const renderedLayerScale = (108 / 72) * (1 - 2 * insetFraction);
    assert.ok(
        renderedLayerScale >= 0.9,
        `adaptive artwork must stay large enough; current scale is ${renderedLayerScale.toFixed(3)}`
    );

    const bounds = await readVisibleAlphaBounds(SOURCE_ICON_PATH);
    const visibleWidthScale = (bounds.visibleWidth / bounds.width) * renderedLayerScale;
    const visibleHeightScale = (bounds.visibleHeight / bounds.height) * renderedLayerScale;
    const oemSafeZoneScale = 66 / 72;

    assert.ok(
        visibleWidthScale <= oemSafeZoneScale,
        `rounded-square width would be cropped by an OEM mask (${visibleWidthScale.toFixed(3)} > ${oemSafeZoneScale.toFixed(3)})`
    );
    assert.ok(
        visibleHeightScale <= oemSafeZoneScale,
        `rounded-square height would be cropped by an OEM mask (${visibleHeightScale.toFixed(3)} > ${oemSafeZoneScale.toFixed(3)})`
    );

    for (const path of ADAPTIVE_ICON_PATHS) {
        const xml = await readFile(path, "utf8");
        assert.match(
            xml,
            /<foreground android:drawable="@drawable\/ic_launcher_foreground" \/>/,
            `${path} must use the tested adaptive foreground`
        );
    }
});
