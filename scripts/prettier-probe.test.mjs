import { execFileSync } from "node:child_process";
import { test } from "node:test";

const files = [
    "apps/android/src/androidDescriptionEditor.ts",
    "apps/android/src/androidDescriptionEditor.test.tsx",
    "apps/android/src/descriptionToolbarLayout.test.ts",
];

test("report Prettier changes for the Android toolbar PR", () => {
    execFileSync("npx", ["prettier", "--write", ...files], {
        stdio: "inherit",
    });
    const diff = execFileSync("git", ["diff", "--", ...files], {
        encoding: "utf8",
    });
    console.log("PRETTIER_DIFF_START");
    console.log(diff);
    console.log("PRETTIER_DIFF_END");
});
