/**
 * Parsing et normalisation des couleurs de calendrier.
 *
 * Pourquoi ce module existe : la couleur d'une source n'est PAS garantie d'etre
 * un `#rrggbb`. Un nouveau calendrier part de la couleur d'accent du theme, lue
 * par `getComputedStyle(body).getPropertyValue("--interactive-accent")`. Les
 * themes Obsidian derivent cette variable (`hsl(var(--accent-h) …)`), et
 * getPropertyValue rend la valeur SUBSTITUEE : mesure dans le vault Personal,
 * `rgb(101,143,242)`. Tous les consommateurs qui faisaient
 * `parseInt(hex.substring(0,2), 16)` obtenaient alors NaN et produisaient
 * `rgba(NaN, NaN, NaN, 0.15)` — declaration invalide, donc silencieusement
 * ignoree : bloc d'evenement sans fond teinte, ghost de drag transparent, pastille
 * du color picker retombee sur son violet de secours.
 *
 * La regle est donc : une seule fonction sait lire une couleur CSS, et la couleur
 * ECRITE dans les settings est toujours normalisee en `#rrggbb` (voir
 * `normalizeColor`). Les parseurs restent tolerants malgre tout — les data.json
 * deja ecrits contiennent des `rgb(...)` qu'on ne peut pas migrer a l'aveugle.
 */

export interface Rgb {
    r: number;
    g: number;
    b: number;
}

/** Couleur de repli quand une chaine est totalement illisible. Le violet
    historique du color picker, pour ne pas changer ce que voyaient les
    utilisateurs dont la couleur etait deja invalide. */
export const FALLBACK_COLOR = "#7c5cff";

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** hsl -> rgb, hue en degres, s/l en 0..1. */
function hslToRgb(h: number, s: number, l: number): Rgb {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0,
        g = 0,
        b = 0;
    if (hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return {
        r: clamp255((r + m) * 255),
        g: clamp255((g + m) * 255),
        b: clamp255((b + m) * 255),
    };
}

/** Les trois premiers nombres d'une notation fonctionnelle, quel que soit le
    separateur (virgules historiques ou espaces de la syntaxe moderne) et en
    ignorant l'alpha apres `/` ou en 4e position. */
function functionalComponents(inner: string): string[] {
    return inner
        .replace(/\//g, " ")
        .split(/[\s,]+/)
        .filter(Boolean);
}

/**
 * Lit n'importe quelle couleur CSS que le navigateur peut produire pour une
 * custom property : hex 3/4/6/8 chiffres, `rgb()`/`rgba()`, `hsl()`/`hsla()`.
 * Rend `null` — et non une couleur par defaut — quand la chaine est illisible :
 * c'est a l'appelant de decider s'il veut un repli ou s'abstenir.
 */
export function parseColor(css: string | null | undefined): Rgb | null {
    if (!css) return null;
    const value = css.trim().toLowerCase();
    if (!value) return null;

    if (value.startsWith("#")) {
        let h = value.slice(1);
        // #rgb / #rgba : chaque chiffre vaut son doublement.
        if (h.length === 3 || h.length === 4) {
            h = h
                .split("")
                .map((c) => c + c)
                .join("");
        }
        // L'alpha eventuel (#rrggbbaa) est ignore : seule la teinte nous
        // interesse, l'opacite est toujours imposee par l'appelant.
        if (h.length !== 6 && h.length !== 8) return null;
        if (!/^[0-9a-f]+$/.test(h)) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    const fn = value.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
    if (!fn) return null;
    const parts = functionalComponents(fn[2]);
    if (parts.length < 3) return null;

    if (fn[1].startsWith("rgb")) {
        const nums = parts.slice(0, 3).map((p) => {
            const n = parseFloat(p);
            if (Number.isNaN(n)) return NaN;
            // rgb() accepte aussi des pourcentages.
            return p.endsWith("%") ? (n / 100) * 255 : n;
        });
        if (nums.some(Number.isNaN)) return null;
        return {
            r: clamp255(nums[0]),
            g: clamp255(nums[1]),
            b: clamp255(nums[2]),
        };
    }

    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    const l = parseFloat(parts[2]);
    if ([h, s, l].some(Number.isNaN)) return null;
    // s et l sont des pourcentages en CSS ; on tolere aussi la forme 0..1.
    const norm = (v: number, raw: string) =>
        raw.endsWith("%") ? v / 100 : v > 1 ? v / 100 : v;
    return hslToRgb(
        h,
        Math.max(0, Math.min(1, norm(s, parts[1]))),
        Math.max(0, Math.min(1, norm(l, parts[2])))
    );
}

const toHexPair = (v: number) => clamp255(v).toString(16).padStart(2, "0");

export function rgbToHex({ r, g, b }: Rgb): string {
    return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

/**
 * Ramene une couleur a la forme `#rrggbb`. A appeler sur TOUTE couleur qui entre
 * dans les settings : c'est ce qui garantit que `<input type="color">`, le color
 * picker et le nom de couleur presetee travaillent tous sur la meme forme.
 */
export function normalizeColor(css: string | null | undefined): string {
    const rgb = parseColor(css);
    return rgb ? rgbToHex(rgb) : FALLBACK_COLOR;
}

/**
 * La meme couleur, a l'opacite demandee, en `rgba()`. Remplace les
 * concatenations `color + "99"` qui ne marchaient que sur du hex.
 */
export function withAlpha(
    css: string | null | undefined,
    alpha: number
): string {
    const { r, g, b } = parseColor(css) ?? parseColor(FALLBACK_COLOR)!;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Noir ou blanc, selon ce qui se lit le mieux sur `css`. Luminance percue sRGB :
 * un fond clair recoit du texte sombre.
 */
export function readableTextColor(css: string | null | undefined): string {
    const { r, g, b } = parseColor(css) ?? parseColor(FALLBACK_COLOR)!;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}
