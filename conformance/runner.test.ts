import * as fs from "fs";
import * as path from "path";
import { OPERATIONS } from "./operations";

interface ConformanceCase {
    name: string;
    fn: string;
    input: unknown;
    expected: unknown;
}

function caseFiles(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const full = path.join(dir, entry.name);
            // `form/` se rejoue sous jsdom : voir formRunner.test.tsx.
            if (entry.isDirectory()) return entry.name === "form" ? [] : caseFiles(full);
            return entry.name.endsWith(".json") ? [full] : [];
        })
        .sort();
}

// JSON.stringify retire les `undefined` : c'est la forme que le Kotlin
// compare aussi, clé absente = clé absente.
const asJson = (value: unknown) =>
    value === undefined ? null : JSON.parse(JSON.stringify(value));

const files = caseFiles(__dirname);

describe("corpus de conformité", () => {
    it("contient au moins un cas", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    // Le fuseau est posé par `test_helpers/globalTimezone.js` (globalSetup) :
    // poser `process.env.TZ` ici ne servirait à rien, Jest n'en donne qu'une
    // copie. Sans ce garde-fou, une CI en UTC décale des centaines de cas.
    it("tourne à l'heure de Paris, comme le noyau Kotlin", () => {
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Paris");
    });

    it.each(files.map((file) => [path.relative(__dirname, file), file]))(
        "%s",
        async (_label, file) => {
            const c = JSON.parse(fs.readFileSync(file, "utf8")) as ConformanceCase;
            const operation = OPERATIONS[c.fn];
            if (!operation) throw new Error(`Opération inconnue : ${c.fn}`);
            expect(asJson(await operation(c.input))).toEqual(c.expected);
        }
    );
});
