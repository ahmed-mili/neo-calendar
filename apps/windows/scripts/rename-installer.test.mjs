import assert from "node:assert/strict";
import test from "node:test";

import { formatInstallerName, signaturePath } from "./rename-installer.mjs";

test("formats the Windows installer like a conventional desktop setup", () => {
    assert.equal(
        formatInstallerName("Neo Calendar", "1.0.0"),
        "Neo-Calendar-Setup-1.0.0.exe",
    );
});
test("keeps the updater signature beside the renamed installer", () => {
    assert.equal(
        signaturePath("Neo-Calendar-Setup-1.0.0.exe"),
        "Neo-Calendar-Setup-1.0.0.exe.sig",
    );
});