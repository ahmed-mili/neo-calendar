import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

const TAURI_CONFIG = "apps/windows/src-tauri/tauri.conf.json";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngColorType(buffer, label) {
    assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${label} must be a PNG`);
    assert.equal(buffer.toString("ascii", 12, 16), "IHDR", `${label} must start with IHDR`);
    return buffer[25];
}

function assertTruecolorPng(buffer, label) {
    assert.equal(
        pngColorType(buffer, label),
        6,
        `${label} must be truecolor RGBA (PNG color type 6), not indexed/paletted`,
    );
}

function assertTauriIco(ico, label) {
    assert.equal(ico.readUInt16LE(0), 0, "ICO reserved field must be zero");
    assert.equal(ico.readUInt16LE(2), 1, "file must be an ICO");

    const count = ico.readUInt16LE(4);
    assert.ok(count > 0, "ICO must contain at least one image");

    for (let index = 0; index < count; index += 1) {
        const entry = 6 + index * 16;
        const size = ico.readUInt32LE(entry + 8);
        const offset = ico.readUInt32LE(entry + 12);
        const image = ico.subarray(offset, offset + size);

        if (image.subarray(0, 8).equals(PNG_SIGNATURE)) {
            assertTruecolorPng(image, `${label} image ${index + 1}`);
        }
    }
}

test("every Windows bundle icon configured for Tauri avoids indexed PNG data", async () => {
    const config = JSON.parse(await readFile(TAURI_CONFIG, "utf8"));
    const iconPaths = config.bundle?.icon ?? [];
    assert.ok(iconPaths.length > 0, "Tauri must configure at least one bundle icon");

    for (const relativePath of iconPaths) {
        const path = join(dirname(TAURI_CONFIG), relativePath);
        const bytes = await readFile(path);

        if (relativePath.toLowerCase().endsWith(".ico")) {
            assertTauriIco(bytes, path);
        } else if (relativePath.toLowerCase().endsWith(".png")) {
            assertTruecolorPng(bytes, path);
        }
    }
});
