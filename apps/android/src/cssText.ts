/**
 * Reading a stylesheet as text, for the tests that guard how the phone looks.
 *
 * There is no DOM under Jest here, so the Android styles are checked by reading
 * what the file declares. The one subtlety worth a module of its own is that
 * the LAST rule wins: nearly every rule in mobile.css carries `!important`, so
 * source order — not specificity — decides what reaches the screen, and reading
 * the first match is how a surface can be believed to be one colour in the file
 * while the phone shows another.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/** Everything the last rule on `selector` declares, `!important` dropped. */
export function declarationsFor(
    css: string,
    selector: string
): Record<string, string> {
    let found: Record<string, string> | null = null;

    for (const rule of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        found = Object.fromEntries(
            rule[2]
                .split(";")
                .map((declaration) => declaration.trim())
                .filter(Boolean)
                .map((declaration) => {
                    const separator = declaration.indexOf(":");
                    return [
                        declaration.slice(0, separator).trim(),
                        normalize(declaration.slice(separator + 1)).replace(
                            / ?!important$/,
                            ""
                        ),
                    ];
                })
        );
    }

    if (!found) throw new Error(`Missing CSS selector: ${selector}`);
    return found;
}
