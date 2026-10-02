import { readFileSync } from "fs";
import { join } from "path";
import { THEMES } from "./registry";

const THEMES_KT = join(
    __dirname,
    "..", "..", "..",
    "android", "native", "core", "src", "main", "kotlin",
    "com", "ahmed", "neocalendar", "core", "appearance", "Themes.kt"
);

function kotlinBlock(source: string, id: string): string {
    const start = source.indexOf(`id = "${id}"`);
    if (start < 0) throw new Error(`Thème absent de Themes.kt : ${id}`);
    const next = source.indexOf("ThemeDefinition(", start);
    return source.slice(start, next < 0 ? undefined : next);
}

function field(block: string, name: string): string {
    const match = new RegExp(`${name} = "(#[0-9a-fA-F]{6})"`).exec(block);
    if (!match) throw new Error(`Champ ${name} introuvable`);
    return match[1].toLowerCase();
}

describe("parité des thèmes PC / Android", () => {
    const kotlin = readFileSync(THEMES_KT, "utf8");

    it("Themes.kt a exactement les thèmes du registre, dans le même ordre", () => {
        const ids = [...kotlin.matchAll(/ThemeDefinition\(\s*id = "([a-z-]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(THEMES.map((theme) => theme.id));
    });

    for (const theme of THEMES) {
        it(`${theme.id} : mêmes accent, fond, texte (sombre) et palette claire`, () => {
            const block = kotlinBlock(kotlin, theme.id);
            expect(field(block, "accent")).toBe(theme.accent.toLowerCase());
            expect(field(block, "surface")).toBe(theme.surface.toLowerCase());
            expect(field(block, "ink")).toBe(theme.ink.toLowerCase());
            const light = /light = ThemeLight\(([^)]*)\)/.exec(block);
            expect(light).not.toBeNull();
            const inner = light![1];
            expect(field(inner, "accent")).toBe(theme.light.accent.toLowerCase());
            expect(field(inner, "surface")).toBe(theme.light.surface.toLowerCase());
            expect(field(inner, "ink")).toBe(theme.light.ink.toLowerCase());
            expect(field(inner, "error")).toBe(theme.light.danger.toLowerCase());
            expect(field(inner, "success")).toBe(theme.light.success.toLowerCase());
        });
    }

    it("chaque couleur du registre est un hexadécimal à six chiffres", () => {
        const hex = /^#[0-9a-f]{6}$/;
        for (const theme of THEMES) {
            for (const value of [theme.accent, theme.surface, theme.ink, ...Object.values(theme.light)]) {
                expect(value).toMatch(hex);
            }
        }
    });
});
