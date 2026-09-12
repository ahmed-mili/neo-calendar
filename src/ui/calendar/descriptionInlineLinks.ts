/**
 * Les liens d'une description, lus là où ils sont écrits : dans son texte.
 *
 * Un lien était gardé à part — dans le corps de la note, tiré hors du champ et
 * dessiné au-dessus de lui. Il ne comptait donc pas dans la description : le
 * champ restait vide sous le lien et proposait encore de la remplir, et il n'y
 * avait aucun endroit où poser le curseur pour écrire avant lui, donc aucune
 * façon d'en faire une étape ou une puce.
 *
 * Un lien est du texte, `[nom](adresse)`, exactement comme dans une note
 * Obsidian. Ce module ne fait que le retrouver dans la ligne pour que le
 * panneau sache le dessiner ; le texte reste la vérité, et rien ici n'en garde
 * de copie.
 */

/** Un lien écrit dans le texte, et où il commence et finit dedans. */
export interface InlineLink {
    /** L'index du `[` (ou du `!` d'une image) dans le texte donné. */
    start: number;
    /** L'index qui suit le `)` de fermeture. */
    end: number;
    /** Ce qui se lit : le nom, déjà déséchappé. */
    label: string;
    /** Où il mène. */
    target: string;
}

/** Un morceau de ligne : du texte nu, ou un lien. */
export type InlineSegment =
    | { kind: "text"; text: string; start: number; end: number }
    | ({ kind: "link" } & InlineLink);

/** `\]` et `\\` sont des caractères, pas de la syntaxe : ils se lisent nus. */
function unescapeLabel(value: string): string {
    return value.replace(/\\([\\\]])/g, "$1");
}

/**
 * Tous les liens du texte donné, dans l'ordre.
 *
 * Les parenthèses de l'adresse sont comptées : `(2025-2026)` dans un chemin de
 * note ferme la sienne, pas celle du lien. Un lien ne franchit pas une fin de
 * ligne — un `[` isolé, en haut d'une description, ne doit pas avaler les cinq
 * lignes qui le suivent jusqu'au premier `](`.
 */
export function readInlineLinks(source: string): InlineLink[] {
    const links: InlineLink[] = [];
    let index = 0;

    while (index < source.length) {
        const image = source[index] === "!" && source[index + 1] === "[";
        const labelStart = image
            ? index + 2
            : source[index] === "["
            ? index + 1
            : -1;

        if (labelStart < 0) {
            index += 1;
            continue;
        }

        let labelEnd = labelStart;
        let escaped = false;
        while (labelEnd < source.length) {
            const character = source[labelEnd];
            if (character === "\n") break;
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "]") {
                break;
            }
            labelEnd += 1;
        }

        if (
            labelEnd >= source.length ||
            source[labelEnd] !== "]" ||
            source[labelEnd + 1] !== "("
        ) {
            index = labelStart;
            continue;
        }

        const targetStart = labelEnd + 2;
        let cursor = targetStart;
        let depth = 1;
        escaped = false;

        while (cursor < source.length && depth > 0) {
            const character = source[cursor];
            if (character === "\n") break;
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "(") {
                depth += 1;
            } else if (character === ")") {
                depth -= 1;
                if (depth === 0) break;
            }
            cursor += 1;
        }

        if (depth !== 0 || cursor >= source.length) {
            index = targetStart;
            continue;
        }

        const target = source.slice(targetStart, cursor).trim();
        if (!target) {
            index = cursor + 1;
            continue;
        }

        links.push({
            start: image ? index : labelStart - 1,
            end: cursor + 1,
            label: unescapeLabel(source.slice(labelStart, labelEnd)),
            target,
        });
        index = cursor + 1;
    }

    return links;
}

/** Le texte donné, coupé en morceaux à dessiner tels quels. */
export function splitInlineLinks(source: string): InlineSegment[] {
    const links = readInlineLinks(source);
    if (!links.length) {
        return source
            ? [{ kind: "text", text: source, start: 0, end: source.length }]
            : [];
    }

    const segments: InlineSegment[] = [];
    let cursor = 0;
    for (const link of links) {
        if (link.start > cursor) {
            segments.push({
                kind: "text",
                text: source.slice(cursor, link.start),
                start: cursor,
                end: link.start,
            });
        }
        segments.push({ kind: "link", ...link });
        cursor = link.end;
    }
    if (cursor < source.length) {
        segments.push({
            kind: "text",
            text: source.slice(cursor),
            start: cursor,
            end: source.length,
        });
    }
    return segments;
}

/** Y a-t-il un lien là-dedans ? */
export function hasInlineLink(source: string): boolean {
    return readInlineLinks(source).length > 0;
}

/**
 * Le lien qui finit juste avant le curseur, s'il y en a un.
 *
 * C'est ce que vise un retour arrière : effacer un lien caractère par caractère
 * le défait en syntaxe avant de l'effacer, et on n'a jamais voulu supprimer une
 * parenthèse. La fiche ouvre donc sa fenêtre, où « Supprimer le lien » l'enlève
 * d'un coup.
 */
export function inlineLinkEndingAt(
    source: string,
    caret: number
): InlineLink | null {
    return readInlineLinks(source).find((link) => link.end === caret) ?? null;
}

/**
 * Le lien que le curseur touche, s'il y en a un : dedans, ou collé à l'un de
 * ses bords.
 *
 * Un clic à côté d'un lien ouvrait la ligne sur son markdown, et c'est ce
 * qu'on cherchait le moins à voir. Le curseur posé contre un lien vise le
 * lien ; sa fenêtre est ce qu'il y a à ouvrir.
 */
export function inlineLinkTouching(
    source: string,
    caret: number
): InlineLink | null {
    return (
        readInlineLinks(source).find(
            (link) => link.start <= caret && caret <= link.end
        ) ?? null
    );
}

/** Le lien qui tient cette position dans le texte, s'il y en a un. */
export function inlineLinkAt(
    source: string,
    position: number
): InlineLink | null {
    return (
        readInlineLinks(source).find(
            (link) => link.start <= position && position < link.end
        ) ?? null
    );
}

/** Le markdown à écrire pour un lien nommé. */
export function inlineLinkMarkdown(label: string, target: string): string {
    const escaped = label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
    return `[${escaped}](${target})`;
}
