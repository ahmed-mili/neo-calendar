import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const pins = Object.fromEntries(
    (await read("apps/android/native/syncthing/version.env"))
        .split("\n")
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => [
            line.slice(0, line.indexOf("=")),
            line.slice(line.indexOf("=") + 1).trim(),
        ])
);
const build = await read("apps/android/native/syncthing/build-syncthing.sh");
const release = await read(".github/workflows/release.yml");
const validation = await read(".github/workflows/pr-validation.yml");

test("les épinglages de Syncthing ont la bonne forme", () => {
    assert.match(pins.SYNCTHING_VERSION, /^v\d+\.\d+\.\d+$/);
    assert.match(pins.SYNCTHING_SOURCE_SHA256, /^[0-9a-f]{64}$/);
    assert.match(pins.SYNCTHING_KEY_FINGERPRINT, /^[0-9A-F]{40}$/);
    assert.match(pins.SOURCE_DATE_EPOCH, /^[1-9][0-9]+$/);
    assert.match(pins.GO_VERSION, /^\d+\.\d+\.\d+$/);
    assert.match(pins.GO_LINUX_AMD64_SHA256, /^[0-9a-f]{64}$/);
    assert.match(pins.NDK_VERSION, /^\d+\.\d+\.\d+$/);
});

test("l'API Android du moteur est le minSdk de l'app", async () => {
    const gradle = await read("apps/android/native/app/build.gradle.kts");
    assert.equal(pins.ANDROID_API, /minSdk = (\d+)/.exec(gradle)[1]);
});

test("la clé de release est en armure ASCII", async () => {
    const key = await read("apps/android/native/syncthing/release-key.asc");
    assert.ok(key.startsWith("-----BEGIN PGP PUBLIC KEY BLOCK-----"));
});

test("la compilation est vérifiée, hors réseau et reproductible", () => {
    for (const needle of [
        "sha256sum -c",
        "gpg --batch --status-fd 1 --verify",
        "VALIDSIG",
        "BADSIG",
        "-mod=vendor",
        "GOPROXY=off",
        "-trimpath",
        "SOURCE_DATE_EPOCH",
        "-checklinkname=0 -s -w",
        "CGO_ENABLED=1",
        "libsyncthingnative.so",
    ]) {
        assert.ok(
            build.includes(needle),
            `build-syncthing.sh doit contenir « ${needle} »`
        );
    }
});

test("la release compile le moteur ou le prend du cache, indexé par les épinglages", () => {
    assert.ok(release.includes("build-syncthing.sh"));
    assert.ok(
        release.includes(
            "hashFiles('apps/android/native/syncthing/version.env', 'apps/android/native/syncthing/build-syncthing.sh', 'apps/android/native/syncthing/release-key.asc')"
        )
    );
    assert.ok(release.includes("cache-hit != 'true'"));
    assert.ok(release.includes("libsyncthingnative.so"));
});

test("la validation des PR recompile Syncthing seulement si les épinglages ou le script changent", () => {
    assert.ok(validation.includes("syncthing-build:"));
    assert.ok(validation.includes("^apps/android/native/syncthing/"));
});

test("les binaires compilés ne sont jamais commités", async () => {
    const ignore = await read(".gitignore");
    assert.ok(ignore.includes("apps/android/native/app/src/main/jniLibs/"));
    assert.ok(ignore.includes("apps/android/native/syncthing/.work/"));
});

const fetchTest = await read(
    "apps/android/native/syncthing/fetch-test-binary.sh"
);

test("le binaire de test est vérifié comme le tarball", () => {
    assert.ok(fetchTest.includes("sha256sum -c"));
    assert.ok(fetchTest.includes("VALIDSIG"));
    assert.ok(fetchTest.includes("SYNCTHING_KEY_FINGERPRINT"));
});

test("la validation des PR lance le noyau Kotlin avec le test à deux moteurs", () => {
    assert.ok(validation.includes("android-core:"));
    assert.ok(validation.includes("fetch-test-binary.sh"));
    assert.ok(validation.includes("SYNCTHING_BINARY"));
    assert.ok(validation.includes(":core:test"));
});
