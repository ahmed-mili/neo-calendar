import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8"
);
const start = workflow.indexOf("\n    tests:\n");
const end = workflow.indexOf("\n    android:\n", start);
assert.notEqual(start, -1, "release workflow must have a tests job");
assert.notEqual(end, -1, "release workflow tests job must precede android");
const testsJob = workflow.slice(start, end);

test("release tests install every workspace used by npm test", () => {
    const testCommand = testsJob.indexOf("- run: npm test");
    assert.ok(testCommand >= 0, "release tests job must run npm test");
    for (const command of [
        "npm install --no-audit --no-fund",
        "npm --prefix apps/windows install --ignore-scripts --no-audit --no-fund",
        "npm --prefix apps/android install --ignore-scripts --no-audit --no-fund",
    ]) {
        const install = testsJob.indexOf(command);
        assert.ok(
            install >= 0 && install < testCommand,
            `${command} must run before npm test`
        );
    }
});
