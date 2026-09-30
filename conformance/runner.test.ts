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
            if (entry.isDirectory()) return caseFiles(full);
            return entry.name.endsWith(".json") ? [full] : [];
        })
        .sort();
}

// JSON.stringify retire les `undefined` : c'est la forme que le Kotlin
// compare aussi, clé absente = clé absente.
const asJson = (value: unknown) =>
    value === undefined ? null : JSON.parse(JSON.stringify(value));

const files = caseFiles(__dirname);

let previousTz: string | undefined;
beforeAll(() => {
    previousTz = process.env.TZ;
    process.env.TZ = "Europe/Paris";
});
afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
});

describe("corpus de conformité", () => {
    it("contient au moins un cas", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files.map((file) => [path.relative(__dirname, file), file]))(
        "%s",
        (_label, file) => {
            const c = JSON.parse(fs.readFileSync(file, "utf8")) as ConformanceCase;
            const operation = OPERATIONS[c.fn];
            if (!operation) throw new Error(`Opération inconnue : ${c.fn}`);
            expect(asJson(operation(c.input))).toEqual(c.expected);
        }
    );
});
