/** @jest-environment jsdom */

import * as fs from "fs";
import * as path from "path";
import { formPayload } from "./formOperation";

/*
 * Les cas de `form/` : la fiche rendue pour de bon, donc sous jsdom. Le runner
 * principal (runner.test.ts) les laisse de côté ; le runner JUnit les rejoue
 * comme les autres.
 */

const dir = path.join(__dirname, "form");
const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
    : [];

// Le fuseau du corpus : les heures des ébauches se lisent en heure locale.
let previousTz: string | undefined;
beforeAll(() => {
    previousTz = process.env.TZ;
    process.env.TZ = "Europe/Paris";
});
afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
});

describe("corpus de conformité : la fiche", () => {
    it("contient au moins un cas", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files)("form/%s", (name) => {
        const c = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        expect(c.fn).toBe("form.payload");
        const actual = formPayload(c.input);
        expect(JSON.parse(JSON.stringify(actual ?? null))).toEqual(c.expected);
    });
});
