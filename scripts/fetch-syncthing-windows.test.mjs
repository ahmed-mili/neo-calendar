import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    assertSignedBy,
    hashFromSums,
    parsePins,
    sha256Hex,
} from "./fetch-syncthing-windows.mjs";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");
const FINGERPRINT = "FBA2E162F2F44657B38F0309E5665F9BD5970C47";

test("les épinglages du moteur Windows ont la bonne forme", async () => {
    const pins = parsePins(
        await read("apps/android/native/syncthing/version.env")
    );
    assert.match(pins.SYNCTHING_VERSION, /^v\d+\.\d+\.\d+$/);
    assert.equal(pins.SYNCTHING_KEY_FINGERPRINT, FINGERPRINT);
    assert.match(pins.SYNCTHING_WINDOWS_ZIP_SHA256, /^[0-9a-f]{64}$/);
    assert.match(pins.SYNCTHING_WINDOWS_EXE_SHA256, /^[0-9a-f]{64}$/);
});

test("le SHA-256 d'une archive se lit dans sha256sum.txt, jamais par approximation", () => {
    const sums = [
        `${"a".repeat(64)}  syncthing-linux-amd64-v2.1.5.tar.gz`,
        `${"b".repeat(64)}  syncthing-windows-amd64-v2.1.5.zip`,
        `${"c".repeat(64)} *syncthing-windows-arm64-v2.1.5.zip`,
    ].join("\n");
    assert.equal(
        hashFromSums(sums, "syncthing-windows-amd64-v2.1.5.zip"),
        "b".repeat(64)
    );
    assert.equal(
        hashFromSums(sums, "syncthing-windows-arm64-v2.1.5.zip"),
        "c".repeat(64)
    );
    assert.throws(() => hashFromSums(sums, "syncthing-windows-amd64"), /absent/);
});

test("une signature n'est acceptée que valide ET de la clé épinglée", () => {
    const valid = `[GNUPG:] NEWSIG\n[GNUPG:] VALIDSIG ${FINGERPRINT} 2026-09-08 1788850675 0 4 0 22 8 00 ${FINGERPRINT}\n`;
    assert.doesNotThrow(() => assertSignedBy(valid, FINGERPRINT));
    assert.throws(
        () => assertSignedBy(`[GNUPG:] BADSIG 1234 syncthing\n${valid}`, FINGERPRINT),
        /INVALIDE/
    );
    assert.throws(
        () => assertSignedBy(valid.replaceAll(FINGERPRINT, "0".repeat(40)), FINGERPRINT),
        /épinglée/
    );
    assert.throws(() => assertSignedBy("[GNUPG:] NO_PUBKEY ABCDEF\n", FINGERPRINT), /épinglée/);
    assert.throws(() => assertSignedBy("", FINGERPRINT), /épinglée/);
});

test("sha256Hex est le SHA-256 hexadécimal", () => {
    assert.equal(
        sha256Hex(Buffer.from("abc")),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
});

test("Tauri embarque le moteur comme sidecar et le dépôt ne le commite pas", async () => {
    const conf = JSON.parse(await read("apps/windows/src-tauri/tauri.conf.json"));
    assert.deepEqual(conf.bundle.externalBin, ["binaries/syncthing"]);
    assert.ok((await read(".gitignore")).includes("apps/windows/src-tauri/binaries/"));
});

test("la release et la validation posent le moteur Windows vérifié", async () => {
    const release = await read(".github/workflows/release.yml");
    const windowsJob = release.slice(release.indexOf("    windows:"));
    assert.ok(windowsJob.includes("node scripts/fetch-syncthing-windows.mjs"));
    assert.ok(
        windowsJob.indexOf("fetch-syncthing-windows.mjs") <
            windowsJob.indexOf("npm --prefix apps/windows run package")
    );
    const packaging = await read(
        ".github/workflows/windows-tauri-package-validation.yml"
    );
    assert.ok(packaging.includes("node scripts/fetch-syncthing-windows.mjs"));
    assert.ok(packaging.includes("scripts/fetch-syncthing-windows.mjs"));
    const rust = await read(".github/workflows/windows-sync-tests.yml");
    assert.ok(rust.includes("node scripts/fetch-syncthing-windows.mjs"));
    assert.ok(rust.includes("SYNCTHING_BINARY"));
    assert.ok(rust.includes("cargo test"));
});
