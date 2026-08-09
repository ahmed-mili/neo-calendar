import test from "node:test";
import assert from "node:assert/strict";

import { platformsFor, platformsForPath, asJobOutputs } from "./releaseScope.mjs";

test("shared source builds both applications", () => {
    assert.deepEqual(platformsFor(["src/ui/calendar/TimeGrid.tsx"]), {
        android: true,
        windows: true,
    });
});

test("the desktop screens are the phone's screens too", () => {
    // apps/android/src/main.tsx imports ../../windows/src/App, so a change
    // under apps/windows/src ships in the APK as much as in the installer.
    assert.deepEqual(platformsFor(["apps/windows/src/DesktopSettings.tsx"]), {
        android: true,
        windows: true,
    });
});

test("the desktop's own build belongs to the desktop alone", () => {
    assert.deepEqual(platformsFor(["apps/windows/src-tauri/src/main.rs"]), {
        android: false,
        windows: true,
    });
    assert.deepEqual(platformsFor(["apps/windows/vite.config.ts"]), {
        android: false,
        windows: true,
    });
});

test("the phone's own files build only the phone", () => {
    assert.deepEqual(platformsFor(["apps/android/src/mobile.css"]), {
        android: true,
        windows: false,
    });
    assert.deepEqual(
        platformsFor(["apps/android/native/app/src/main/AndroidManifest.xml"]),
        { android: true, windows: false }
    );
});

test("a release that only bumped the version builds nothing", () => {
    // Every one of these changes on every release because a release happened.
    assert.deepEqual(
        platformsFor([
            "package.json",
            "package-lock.json",
            "apps/windows/package.json",
            "apps/android/package.json",
            "apps/windows/src-tauri/tauri.conf.json",
            "apps/windows/src-tauri/Cargo.toml",
            "apps/windows/src-tauri/Cargo.lock",
            "apps/android/native/app/build.gradle.kts",
        ]),
        { android: false, windows: false }
    );
});

test("the version bump never hides a real change beside it", () => {
    assert.deepEqual(
        platformsFor([
            "package.json",
            "apps/android/native/app/build.gradle.kts",
            "apps/android/src/mobile.css",
        ]),
        { android: true, windows: false }
    );
});

test("one platform's change does not drag the other in", () => {
    assert.deepEqual(
        platformsFor([
            "apps/android/src/mobile.css",
            "apps/windows/src-tauri/src/main.rs",
        ]),
        { android: true, windows: true }
    );
});

test("an unknown path builds everything rather than skip something", () => {
    assert.deepEqual(platformsForPath("README.md"), {
        android: true,
        windows: true,
    });
    assert.deepEqual(platformsForPath(".github/workflows/release.yml"), {
        android: true,
        windows: true,
    });
});

test("no paths at all builds both", () => {
    // Not knowing what changed is not a reason to ship nothing.
    assert.deepEqual(platformsFor([]), { android: true, windows: true });
    assert.deepEqual(platformsFor(undefined), { android: true, windows: true });
});

test("job outputs are the two lines a workflow reads back", () => {
    assert.equal(
        asJobOutputs({ android: true, windows: false }),
        "android=true\nwindows=false"
    );
});
