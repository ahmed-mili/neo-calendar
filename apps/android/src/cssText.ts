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

/**
 * What `selector` ends up declaring, `!important` dropped.
 *
 * Every rule naming it is merged in source order, later winning, because these
 * stylesheets state the same property on the same selector several times over —
 * one pass per revision — and only the last of each reaches the screen. Reading
 * one rule alone answers a question nobody asked.
 */
export function declarationsFor(
    css: string,
    selector: string
): Record<string, string> {
    let found: Record<string, string> | null = null;

    for (const rule of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        found = Object.assign(
            found ?? {},
            Object.fromEntries(
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
            )
        );
    }

    if (!found) throw new Error(`Missing CSS selector: ${selector}`);
    return found;
}
