import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ICO_PATH = "apps/windows/src-tauri/icons/icon.ico";
const PNG_PATHS = [
    "apps/windows/src-tauri/icons/icon.png",
    "apps/windows/src-tauri/icons/32x32.png",
    "apps/windows/src-tauri/icons/64x64.png",
    "apps/windows/src-tauri/icons/128x128.png",
    "apps/windows/src-tauri/icons/128x128@2x.png",
];

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngColorType(buffer, label) {
    assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${label} must be a PNG`);
    assert.equal(buffer.toString("ascii", 12, 16), "IHDR", `${label} must start with IHDR`);
    return buffer[25];
}

test("Windows icon.ico embeds only truecolor RGBA PNGs accepted by Tauri", async () => {
    const ico = await readFile(ICO_PATH);
    assert.equal(ico.readUInt16LE(0), 0, "ICO reserved field must be zero");
    assert.equal(ico.readUInt16LE(2), 1, "file must be an ICO");

    const count = ico.readUInt16LE(4);
    assert.ok(count > 0, "ICO must contain at least one image");

    for (let index = 0; index < count; index += 1) {
        const entry = 6 + index * 16;
        const size = ico.readUInt32LE(entry + 8);
        const offset = ico.readUInt32LE(entry + 12);
        const image = ico.subarray(offset, offset + size);

        if (!image.subarray(0, 8).equals(PNG_SIGNATURE)) continue;

        assert.equal(
            pngColorType(image, `${ICO_PATH} image ${index + 1}`),
            6,
            `${ICO_PATH} image ${index + 1} must be truecolor RGBA (PNG color type 6), not indexed/paletted`,
        );
    }
});

test("standalone Windows Tauri PNG icons are truecolor RGBA", async () => {
    for (const path of PNG_PATHS) {
        const png = await readFile(path);
        assert.equal(
            pngColorType(png, path),
            6,
            `${path} must be truecolor RGBA (PNG color type 6), not indexed/paletted`,
        );
    }
});
