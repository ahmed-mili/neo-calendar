import fs from "node:fs";
import test from "node:test";
import prettier from "prettier";

const config = JSON.parse(fs.readFileSync(".prettierrc.json", "utf8"));
const files = [
    "apps/windows/src/desktopDescriptionEditor.test.tsx",
    "apps/android/src/androidDescriptionEditor.test.tsx",
];

test("prints final canonical Description regression formatting", () => {
    for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        const formatted = prettier.format(source, {
            ...config,
            filepath: file,
        });
        console.log(`PRETTIER_BEGIN:${file}\n${formatted}PRETTIER_END:${file}`);
    }
});
