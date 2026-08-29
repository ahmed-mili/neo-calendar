import fs from "node:fs";
import test from "node:test";
import prettier from "prettier";

const files = [
  "apps/windows/src/platform/androidReminders.test.ts",
  "src/ui/calendar/EventDateControls.test.tsx",
  "src/ui/calendar/reminderChoices.ts",
];

test("print canonical Prettier output for release files", () => {
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const formatted = prettier.format(source, { filepath: file });
    console.log(`PRETTIER-BEGIN:${file}\n${formatted}PRETTIER-END:${file}`);
  }
});
