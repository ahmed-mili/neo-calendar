import type { EffectiveThemeAppearance } from "./appearancePreferences";
import { contrastRatio, ensureContrast, mixSrgb, readableOn, withAlpha } from "./contrast";
import type { ThemeDefinition } from "./types";

export interface PanelColors {
    surface: string;
    ink: string;
    accent: string;
}

export interface PanelTokens {
    bgPrimary: string;
    bgSecondary: string;
    formField: string;
    hover: string;
    border: string;
    borderHover: string;
    text: string;
    muted: string;
    faint: string;
}

/** Seuils de lisibilité (spec §3.3) : texte 4,5 ; icônes, pastilles et texte discret 3. */
export const TEXT_CONTRAST = 4.5;
export const GRAPHIC_CONTRAST = 3;

const SECONDARY_MIX = 0.12;
const FIELD_MIX = 0.16;
const HOVER_MIX = 0.22;
const MUTED_MIX = 0.72;
const FAINT_MIX = 0.52;

/**
 * Le survol et les deux textes atténués. Départ : les proportions d'origine (survol 22 %, secondaire
 * 72 %, discret 52 % d'encre). Une palette peu contrastée ne les tient pas : on rapproche d'abord
 * le texte de l'encre (jusqu'à 100 %), puis, si l'encre elle-même ne se lit pas sur le survol, on
 * éclaircit moins le survol (jusqu'au niveau du champ). Une seule règle pour tous les thèmes ; une
 * palette qui tient déjà garde exactement les proportions d'origine.
 */
function deriveTones(surface: string, ink: string): { hoverMix: number; mutedMix: number; faintMix: number } {
    const fixed = [surface, mixSrgb(surface, ink, SECONDARY_MIX), mixSrgb(surface, ink, FIELD_MIX)];
    const reach = (from: number, min: number, surfaces: string[]): number | null => {
        for (let step = Math.round(from * 100); step <= 100; step++) {
            const color = mixSrgb(surface, ink, step / 100);
            if (surfaces.every((bg) => contrastRatio(color, bg) >= min)) return step / 100;
        }
        return null;
    };
    for (let hover = Math.round(HOVER_MIX * 100); hover >= Math.round(FIELD_MIX * 100); hover--) {
        const surfaces = [...fixed, mixSrgb(surface, ink, hover / 100)];
        const muted = reach(MUTED_MIX, TEXT_CONTRAST, surfaces);
        if (muted !== null) {
            const faint = reach(FAINT_MIX, GRAPHIC_CONTRAST, surfaces) ?? muted;
            return { hoverMix: hover / 100, mutedMix: muted, faintMix: Math.min(faint, muted) };
        }
    }
    return { hoverMix: FIELD_MIX, mutedMix: 1, faintMix: 1 };
}

/** Les surfaces et textes de tout panneau, à partir de trois couleurs : formules des `color-mix` d'`App.tsx` d'origine, textes atténués corrigés par `deriveTones`. */
export function derivePanelTokens({ surface, ink, accent }: PanelColors): PanelTokens {
    const tones = deriveTones(surface, ink);
    return {
        bgPrimary: surface,
        bgSecondary: mixSrgb(surface, ink, SECONDARY_MIX),
        formField: mixSrgb(surface, ink, FIELD_MIX),
        hover: mixSrgb(surface, ink, tones.hoverMix),
        border: withAlpha(ink, 0.22),
        borderHover: mixSrgb(accent, ink, 0.3),
        text: ink,
        muted: mixSrgb(surface, ink, tones.mutedMix),
        faint: mixSrgb(surface, ink, tones.faintMix),
    };
}

/** Texte sur accent : la couleur de la surface si elle se lit (4,5), sinon le noir ou le blanc le plus lisible. */
export function accentTextOn(accent: string, surface: string): string {
    return contrastRatio(surface, accent) >= TEXT_CONTRAST ? surface : readableOn(accent);
}

/** Le rouge et le vert du thème, rapprochés de l'encre juste ce qu'il faut pour se lire sur le fond et le panneau. */
export function readableSemantic(
    semantic: { danger: string; success: string },
    { surface, ink }: PanelColors
): { danger: string; success: string } {
    const surfaces = [surface, mixSrgb(surface, ink, SECONDARY_MIX)];
    return {
        danger: ensureContrast(semantic.danger, surfaces, TEXT_CONTRAST, ink),
        success: ensureContrast(semantic.success, surfaces, GRAPHIC_CONTRAST, ink),
    };
}

export interface LightExtras {
    crust: string;
    glass: string;
    accentStrong: string;
    accentText: string;
    danger: string;
    success: string;
}

/**
 * Ce que le CSS des thèmes fixe en sombre mais qu'un mode clair doit calculer :
 * le fond de page, la vitre, l'accent fort, le texte sur accent, le rouge et le
 * vert de la palette claire du thème (rendus lisibles par `readableSemantic`).
 */
export function deriveLightExtras(
    { surface, ink, accent }: PanelColors,
    semantic: { danger: string; success: string }
): LightExtras {
    return {
        crust: mixSrgb(surface, ink, 0.08),
        glass: withAlpha(surface, 0.88),
        accentStrong: mixSrgb(accent, "#000000", 0.12),
        accentText: accentTextOn(accent, surface),
        ...readableSemantic(semantic, { surface, ink, accent }),
    };
}

/**
 * Les trois couleurs d'un panneau : en sombre celles du thème (personnalisation
 * comprise) ; en clair la palette claire du thème, où seul l'accent suit la
 * personnalisation (un accent égal à celui du thème sombre est « non choisi »).
 */
export function panelColorsFor(
    theme: ThemeDefinition,
    appearance: EffectiveThemeAppearance,
    mode: "light" | "dark"
): PanelColors {
    if (mode === "dark") {
        return {
            surface: appearance.surface,
            ink: appearance.ink,
            accent: appearance.accent,
        };
    }
    return {
        surface: theme.light.surface,
        ink: theme.light.ink,
        accent:
            appearance.accent === theme.accent
                ? theme.light.accent
                : appearance.accent,
    };
}

/** Les propriétés CSS posées sur `html` et `body`. En clair, elles couvrent aussi ce que le CSS du thème fixerait en sombre. */
export function panelCssProperties(
    colors: PanelColors,
    mode: "light" | "dark",
    theme: ThemeDefinition
): Record<string, string> {
    const t = derivePanelTokens(colors);
    const semantic =
        mode === "light"
            ? theme.light
            : { danger: theme.semanticColors.diffRemoved, success: theme.semanticColors.diffAdded };
    const readable = readableSemantic(semantic, colors);
    const accentText = accentTextOn(colors.accent, colors.surface);
    const properties: Record<string, string> = {
        "--nc-accent-text": accentText,
        "--text-on-accent": accentText,
        "--text-error": readable.danger,
        "--nc-danger": readable.danger,
        "--nc-success": readable.success,
        "--interactive-accent": colors.accent,
        "--nc-accent": colors.accent,
        "--nc-theme-accent": colors.accent,
        "--background-primary": t.bgPrimary,
        "--nc-bg-primary": t.bgPrimary,
        "--nc-theme-surface": t.bgPrimary,
        "--background-secondary": t.bgSecondary,
        "--nc-bg-secondary": t.bgSecondary,
        "--background-modifier-form-field": t.formField,
        "--background-modifier-hover": t.hover,
        "--background-modifier-border": t.border,
        "--background-modifier-border-hover": t.borderHover,
        "--text-normal": t.text,
        "--nc-text-primary": t.text,
        "--nc-theme-ink": t.text,
        "--text-muted": t.muted,
        "--nc-text-secondary": t.muted,
        "--text-faint": t.faint,
        "--nc-text-faint": t.faint,
    };
    if (mode === "light") {
        const x = deriveLightExtras(colors, theme.light);
        Object.assign(properties, {
            "--nc-bg-crust": x.crust,
            "--nc-surface": x.glass,
            "--nc-surface-hover": t.hover,
            "--nc-accent-strong": x.accentStrong,
        });
    }
    return properties;
}
