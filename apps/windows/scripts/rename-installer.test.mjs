import assert from "node:assert/strict";
import test from "node:test";

import { formatInstallerName } from "./rename-installer.mjs";

test("formats the Windows installer like a conventional desktop setup", () => {
    assert.equal(
        formatInstallerName("Neo Calendar", "1.0.0"),
        "Neo Calendar Setup 1.0.0.exe",
    );
});
