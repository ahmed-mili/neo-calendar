import assert from "node:assert/strict";
import test from "node:test";
import { createMetadata, releaseAssetUrl } from "./generate-update-metadata.mjs";

test("encodes GitHub release asset names", () => {
    assert.equal(
        releaseAssetUrl("v1.2.3", "Neo Calendar.exe"),
        "https://github.com/ahmed-mili/neo-calendar/releases/download/v1.2.3/Neo%20Calendar.exe",
    );
});

test("creates Android and Tauri metadata from one release", () => {
    const metadata = createMetadata({
        version: "1.2.3",
        versionCode: 42,
        tag: "v1.2.3",
        android: { filename: "neo.apk", sha256: "a".repeat(64) },
        windows: { filename: "neo.exe", signature: "signed-value\n" },
    });
    assert.equal(metadata.android.versionCode, 42);
    assert.equal(metadata.android.sha256, "a".repeat(64));
    assert.equal(metadata.desktop.platforms["windows-x86_64"].signature, "signed-value");
    assert.match(metadata.desktop.platforms["windows-x86_64"].url, /v1\.2\.3\/neo\.exe$/);
});

test("rejects incomplete integrity metadata", () => {
    assert.throws(() => createMetadata({
        version: "1.2.3",
        versionCode: 42,
        tag: "v1.2.3",
        android: { filename: "neo.apk", sha256: "nope" },
        windows: { filename: "neo.exe", signature: "" },
    }));
});