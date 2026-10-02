import { contrastRatio } from "./contrast";
import {
    derivePanelTokens,
    GRAPHIC_CONTRAST,
    panelColorsFor,
    panelCssProperties,
    TEXT_CONTRAST,
} from "./panelTokens";
import { getEffectiveThemeAppearance, normalizeAppearancePreferences } from "./appearancePreferences";
import { THEMES } from "./registry";

/**
 * Contraste calculé (WCAG) de chaque paire texte / surface des panneaux, pour les six
 * thèmes en sombre et en clair, sur leurs palettes (sans personnalisation).
 * Limite : le contraste est mesuré sur surface opaque ; la transparence sur le fond
 * d'écran est jugée aux captures (Task 8).
 */

/** Seuils (spec §3.3) : texte 4,5 ; grands éléments, icônes et pastilles 3. */
const TEXT = TEXT_CONTRAST;
const GRAPHIC = GRAPHIC_CONTRAST;

/**
 * Une paire qui ne tient pas SEULEMENT parce que la palette officielle est en
 * cause (relevé de la Task 4). Clé `thème/mode/paire`, valeur : la raison.
 * Chaque entrée est aussi justifiée dans le relevé (section « Exemptions de contraste »).
 */
const EXEMPTIONS: Record<string, string> = {
    "one/dark/accent sur panneau (pastille, icône)":
        "Le bleu de bouton One (#4d78cc, relevé) fait 3,25 sur le fond One officiel, au ras du seuil : sur le panneau, un peu plus clair, il passe sous 3.",
    "ayu/light/accent sur fond (pastille, icône)":
        "Le jaune-orangé Ayu Light (#f29718, button.background officiel) ne fait que 2,22 sur le fond Ayu Light officiel (#fcfcfc) : la palette seule est en cause.",
    "ayu/light/accent sur panneau (pastille, icône)":
        "Même couleur officielle (#f29718) sur un panneau plus sombre que le fond Ayu Light : elle ne se lit pas mieux, la palette est seule en cause.",
    "rose-pine/light/accent sur fond (pastille, icône)":
        "Le rose Dawn (#d7827e, rose officiel) ne fait que 2,60 sur le fond Dawn officiel (#faf4ed) : la palette seule est en cause.",
    "rose-pine/light/accent sur panneau (pastille, icône)":
        "Même rose officiel (#d7827e) sur un panneau plus sombre que le fond Dawn : la palette est seule en cause.",
};

interface Pair {
    name: string;
    fg: string;
    bg: string;
    min: number;
}

function pairsFor(themeId: string, mode: "light" | "dark"): Pair[] {
    const theme = THEMES.find((candidate) => candidate.id === themeId)!;
    const effective = getEffectiveThemeAppearance(
        theme,
        normalizeAppearancePreferences({})
    );
    const colors = panelColorsFor(theme, effective, mode);
    const t = derivePanelTokens(colors);
    // Ce que l'application pose réellement sur la page, pas une copie des formules.
    const applied = panelCssProperties(colors, mode, theme);
    const accentText = applied["--nc-accent-text"];
    const danger = applied["--nc-danger"];
    const success = applied["--nc-success"];
    const surfaces: Array<[string, string]> = [
        ["fond", t.bgPrimary],
        ["panneau", t.bgSecondary],
        ["champ", t.formField],
        ["survol", t.hover],
    ];
    const pairs: Pair[] = [];
    for (const [surfaceName, surface] of surfaces) {
        pairs.push({ name: `texte sur ${surfaceName}`, fg: t.text, bg: surface, min: TEXT });
        pairs.push({ name: `secondaire sur ${surfaceName}`, fg: t.muted, bg: surface, min: TEXT });
        pairs.push({ name: `discret sur ${surfaceName}`, fg: t.faint, bg: surface, min: GRAPHIC });
    }
    pairs.push({ name: "texte sur accent", fg: accentText, bg: colors.accent, min: TEXT });
    pairs.push({ name: "accent sur fond (pastille, icône)", fg: colors.accent, bg: t.bgPrimary, min: GRAPHIC });
    pairs.push({ name: "accent sur panneau (pastille, icône)", fg: colors.accent, bg: t.bgSecondary, min: GRAPHIC });
    pairs.push({ name: "erreur sur fond", fg: danger, bg: t.bgPrimary, min: TEXT });
    pairs.push({ name: "succès sur fond", fg: success, bg: t.bgPrimary, min: GRAPHIC });
    return pairs;
}

describe("contraste des thèmes, tous les panneaux", () => {
    for (const theme of THEMES) {
        for (const mode of ["dark", "light"] as const) {
            it(`${theme.id} (${mode}) tient tous ses seuils`, () => {
                const failures: string[] = [];
                for (const pair of pairsFor(theme.id, mode)) {
                    const key = `${theme.id}/${mode}/${pair.name}`;
                    const ratio = contrastRatio(pair.fg, pair.bg);
                    if (ratio < pair.min && !(key in EXEMPTIONS)) {
                        failures.push(`${key} : ${ratio.toFixed(2)} < ${pair.min}`);
                    }
                }
                expect(failures).toEqual([]);
            });
        }
    }

    it("chaque exemption a une raison et échoue encore vraiment", () => {
        for (const [key, reason] of Object.entries(EXEMPTIONS)) {
            expect(reason.trim().length).toBeGreaterThan(20);
            const [themeId, mode, name] = key.split("/");
            const pair = pairsFor(themeId, mode as "light" | "dark").find((p) => p.name === name);
            expect(pair).toBeDefined();
            expect(contrastRatio(pair!.fg, pair!.bg)).toBeLessThan(pair!.min);
        }
    });
});
