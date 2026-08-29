import fs from "node:fs";
import test from "node:test";
import prettier from "prettier";

const files = [
    "apps/android/src/androidDescriptionEditor.test.tsx",
    "src/ui/calendar/EventDateControls.style.test.ts",
];
const config = { tabWidth: 4, useTabs: false, endOfLine: "auto" };

test("print canonical Prettier output for remaining release files", () => {
    for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        const formatted = prettier.format(source, { ...config, filepath: file });
        console.log(`PRETTIER-BEGIN:${file}\n${formatted}PRETTIER-END:${file}`);
    }
});
