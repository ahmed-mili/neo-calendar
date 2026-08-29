import test from "node:test";
import { readFile } from "node:fs/promises";
import prettier from "prettier";

test("prints the canonical updater dialog formatting", async () => {
    const source = await readFile(
        new URL("../src/ui/calendar/UpdateInstallDialog.tsx", import.meta.url),
        "utf8",
    );
    const formatted = prettier.format(source, {
        parser: "typescript",
        tabWidth: 4,
        useTabs: false,
        semi: true,
        singleQuote: false,
        trailingComma: "es5",
        printWidth: 80,
        bracketSpacing: true,
        arrowParens: "always",
    });
    const encoded = Buffer.from(formatted, "utf8").toString("base64");
    console.log("PRETTIER_PROBE_BEGIN");
    for (let offset = 0; offset < encoded.length; offset += 160) {
        console.log(encoded.slice(offset, offset + 160));
    }
    console.log("PRETTIER_PROBE_END");
});
