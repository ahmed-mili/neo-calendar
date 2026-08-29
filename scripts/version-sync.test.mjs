import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");
const readJson = async (path) => JSON.parse(await read(path));

test("all release manifests carry the same version", async () => {
    const root = await readJson("package.json");
    const version = root.version;

    assert.match(version, /^\d+\.\d+\.\d+$/);

    for (const path of [
        "apps/windows/package.json",
        "apps/android/package.json",
    ]) {
        assert.equal((await readJson(path)).version, version, path);
    }

    for (const path of [
        "package-lock.json",
        "apps/windows/package-lock.json",
        "apps/android/package-lock.json",
    ]) {
        const lock = await readJson(path);
        assert.equal(lock.version, version, `${path} top-level version`);
        assert.equal(
            lock.packages?.[""]?.version,
            version,
            `${path} root package version`
        );
    }

    const tauri = await readJson("apps/windows/src-tauri/tauri.conf.json");
    assert.equal(tauri.version, version, "Tauri config");

    const cargoManifest = await read("apps/windows/src-tauri/Cargo.toml");
    assert.match(
        cargoManifest,
        new RegExp(`^version = "${version.replaceAll(".", "\\.")}"$`, "m"),
        "Cargo manifest"
    );

    const cargoLock = await read("apps/windows/src-tauri/Cargo.lock");
    assert.match(
        cargoLock,
        new RegExp(
            `name = "neo-calendar-windows"\\r?\\nversion = "${version.replaceAll(".", "\\.")}"`
        ),
        "Cargo lock"
    );

    const gradle = await read("apps/android/native/app/build.gradle.kts");
    assert.match(
        gradle,
        new RegExp(`versionName = "${version.replaceAll(".", "\\.")}"`),
        "Android versionName"
    );
    assert.match(gradle, /versionCode = [1-9]\d*/, "Android versionCode");
});
