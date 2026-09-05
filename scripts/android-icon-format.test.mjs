import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ANDROID_ICON_PATHS = [
    "apps/android/native/app/src/main/res/drawable-nodpi/neo_calendar_icon.png",
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
