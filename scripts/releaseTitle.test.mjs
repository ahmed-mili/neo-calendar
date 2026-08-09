import test from "node:test";
import assert from "node:assert/strict";

import { releaseTitle } from "./releaseTitle.mjs";

test("a release carrying both applications is just its number", () => {
    assert.equal(
        releaseTitle("v1.14.0", [
            "neo-calendar-android-1.14.0.apk",
            "Neo.Calendar.Setup.1.14.0.exe",
        ]),
        "v1.14.0"
    );
});

test("a release carrying one application says which", () => {
    assert.equal(
        releaseTitle("v1.14.0", ["neo-calendar-android-1.14.0.apk"]),
        "v1.14.0-android"
    );
    assert.equal(
        releaseTitle("v1.14.0", ["Neo.Calendar.Setup.1.14.0.exe"]),
        "v1.14.0-windows"
    );
});

test("an empty release is still named after its version", () => {
    // Should not happen — but a missing name is worse than an unqualified one.
    assert.equal(releaseTitle("v1.14.0", []), "v1.14.0");
    assert.equal(releaseTitle("v1.14.0", undefined), "v1.14.0");
});

test("the extension is read whatever its case", () => {
    assert.equal(
        releaseTitle("v1.14.0", ["NEO-CALENDAR-1.14.0.APK"]),
        "v1.14.0-android"
    );
});

test("a file that is neither package qualifies nothing", () => {
    assert.equal(releaseTitle("v1.14.0", ["checksums.txt"]), "v1.14.0");
    assert.equal(
        releaseTitle("v1.14.0", ["checksums.txt", "app.apk"]),
        "v1.14.0-android"
    );
});
