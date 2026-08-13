import assert from "node:assert/strict";
import test from "node:test";

import {
    UPDATER_ENDPOINT,
    withUpdaterConfig,
} from "./configure-tauri-updater.mjs";

const PUBLIC_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IHRlc3QgcHVibGljIGtleQpSV1Rlc3RLZXk=";

test("adds signed passive Windows updater configuration", () => {
    const configured = withUpdaterConfig(
        {
            bundle: { active: true },
            plugins: { "deep-link": { desktop: {} } },
        },
        PUBLIC_KEY,
    );

    assert.equal(configured.bundle.active, true);
    assert.equal(configured.bundle.createUpdaterArtifacts, true);
    assert.deepEqual(configured.plugins["deep-link"], { desktop: {} });
    assert.deepEqual(configured.plugins.updater, {
        pubkey: PUBLIC_KEY,
        endpoints: [UPDATER_ENDPOINT],
        windows: { installMode: "passive" },
    });
});

test("refuses to build an updater without a public key", () => {
    assert.throws(
        () => withUpdaterConfig({}, ""),
        /TAURI_UPDATER_PUBLIC_KEY/,
    );
});