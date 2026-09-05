import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";

// Exercise production minification: the source and Vite dev both had working
// glass, while the shipped CSS kept only the Safari-prefixed declaration.
for (const platform of ["windows", "android"]) {
    test(`${platform} ships both layers of the nested glass to Chromium`, async () => {
        const root = fileURLToPath(new URL(`../../${platform}/`, import.meta.url));
        const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
        const result = await build({
            root,
            logLevel: "silent",
            publicDir: false,
            plugins: [{
                name: "glass-build-fixture",
                resolveId: (id) => id.startsWith("virtual:glass") ? id : null,
                load: (id) => id === "virtual:glass.js"
                    ? 'import "virtual:glass.css";'
                    : id === "virtual:glass.css" ? css : null,
            }],
            build: {
                write: false,
                sourcemap: false,
                rolldownOptions: { input: "virtual:glass.js" },
            },
        });
        const output = result.output.find((asset) => asset.fileName.endsWith(".css"));
        assert.ok(output, "the production build must emit CSS");
        const shipped = String(output.source);
        for (const blur of [5, 28]) {
            assert.match(shipped, new RegExp(`(?:^|[;{])backdrop-filter:blur\\(${blur}px\\)`),
                `the ${blur}px glass layer must retain the standard property`);
        }
    });
}
