export type Rgb = [number, number, number];

export interface ParsedColor {
    rgb: Rgb;
    alpha: number;
}

/** `#rrggbb`, `rgb(r, g, b)` ou `rgba(r, g, b, a)` : tout le reste lève. */
export function parseColor(value: string): ParsedColor {
    const text = value.trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(text);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
    }
    const fn =
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
            text
        );
    if (fn) {
        return {
            rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
            alpha: fn[4] === undefined ? 1 : Number(fn[4]),
        };
    }
    throw new Error(`Couleur illisible : ${value}`);
}

function toHex(rgb: Rgb): string {
    return (
        "#" +
        rgb
            .map((channel) =>
                Math.max(0, Math.min(255, Math.round(channel)))
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("")
    );
}

/** `color-mix(in srgb, a (1 - t), b t)` sur deux couleurs opaques. */
export function mixSrgb(a: string, b: string, t: number): string {
    const left = parseColor(a).rgb;
    const right = parseColor(b).rgb;
    return toHex([
        left[0] * (1 - t) + right[0] * t,
        left[1] * (1 - t) + right[1] * t,
        left[2] * (1 - t) + right[2] * t,
    ]);
}

export function withAlpha(hex: string, alpha: number): string {
    const [r, g, b] = parseColor(hex).rgb;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Le premier plan (éventuellement translucide) composé sur un fond opaque. */
export function over(fg: string, bg: string): string {
    const top = parseColor(fg);
    const back = parseColor(bg).rgb;
    return toHex([
        top.rgb[0] * top.alpha + back[0] * (1 - top.alpha),
        top.rgb[1] * top.alpha + back[1] * (1 - top.alpha),
        top.rgb[2] * top.alpha + back[2] * (1 - top.alpha),
    ]);
}

export function relativeLuminance(hex: string): number {
    const [r, g, b] = parseColor(hex).rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG 2.x ; le premier plan translucide est composé sur `bg`. */
export function contrastRatio(fg: string, bg: string): number {
    const a = relativeLuminance(over(fg, bg));
    const b = relativeLuminance(bg);
    const [light, dark] = a >= b ? [a, b] : [b, a];
    return (light + 0.05) / (dark + 0.05);
}

/** Du blanc ou du noir, selon ce qui se lit le mieux sur `bg`. */
export function readableOn(bg: string): "#ffffff" | "#000000" {
    return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg)
        ? "#ffffff"
        : "#000000";
}

/**
 * La couleur `color` rapprochée de `toward` (par pas de 1 %) jusqu'à tenir `min` sur chacun des fonds.
 * Rend `color` telle quelle quand elle tient déjà, et `toward` si rien ne suffit.
 */
export function ensureContrast(
    color: string,
    backgrounds: readonly string[],
    min: number,
    toward: string
): string {
    for (let step = 0; step <= 100; step++) {
        const candidate = step === 0 ? color : mixSrgb(color, toward, step / 100);
        if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= min)) {
            return candidate;
        }
    }
    return toward;
}
