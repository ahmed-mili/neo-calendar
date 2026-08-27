/*
 * What counts as a link when you paste one in.
 *
 * The old rule was `new URL(value)` and nothing else, which is stricter than
 * anything a phone actually hands you. `youtube.com/watch?v=…` has no scheme
 * and threw. So did the text every app shares — "Regarde ça
 * https://vm.tiktok.com/… " — because of the words around it. And when it
 * threw, nothing happened at all: no link, no message, a field that swallowed
 * what you typed.
 *
 * So: find a link anywhere in what was given, add the scheme it obviously
 * meant, and say so out loud when there is genuinely nothing there.
 */

/**
 * Schemes that execute rather than address.
 *
 * A note is opened by a click, and these turn a link into something that runs.
 * Nothing shared from an app is ever one of them.
 */
const DANGEROUS_SCHEMES = ["javascript", "data", "vbscript", "blob"];

const schemeOf = (value: string): string | null => {
    const match = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim());
    return match ? match[1].toLowerCase() : null;
};

/** Already written as `[label](target)`, so it is taken as it stands. */
export function isInlineMarkdownLink(value: string): boolean {
    const labelStart = value.startsWith("!")
        ? value.startsWith("![")
            ? 2
            : -1
        : value.startsWith("[")
        ? 1
        : -1;
    if (labelStart < 0 || !value.endsWith(")")) return false;

    const destinationStart = value.indexOf("](", labelStart);
    return (
        destinationStart >= labelStart &&
        destinationStart + 2 < value.length - 1
    );
}

/**
 * The link inside whatever was pasted, or null if there is none.
 *
 * Takes the first thing that looks like a web address: a scheme, or a bare
 * host with a dot in it. Trailing punctuation is dropped — a link at the end
 * of a sentence keeps the full stop otherwise, and a link in brackets keeps
 * the bracket.
 */
export function findUrl(value: string): string | null {
    const text = value.trim();
    if (!text) return null;

    const withScheme = /[a-z][a-z0-9+.-]*:\/\/\S+|(?:mailto|tel):\S+/i.exec(
        text
    );
    const candidate =
        withScheme?.[0] ??
        // A bare host: at least one dot, no spaces, and something that looks
        // like a domain rather than a sentence or a file name.
        /(?:^|\s)((?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?)/i.exec(text)?.[1];

    if (!candidate) return null;

    // ")" is kept when it closes one the link itself opened, as in the
    // parenthesised titles Wikipedia uses.
    let trimmed = candidate.replace(/[.,;:!?"'»]+$/, "");
    while (
        trimmed.endsWith(")") &&
        (trimmed.match(/\(/g)?.length ?? 0) <
            (trimmed.match(/\)/g)?.length ?? 0)
    ) {
        trimmed = trimmed.slice(0, -1);
    }

    return trimmed || null;
}

/**
 * A label short enough to read in a row: the host, without its "www.".
 *
 * The address itself is kept as the link's target, so nothing is lost — this
 * is only what the eye lands on.
 */
export function labelFor(target: string): string {
    const scheme = schemeOf(target);
    if (scheme === "mailto" || scheme === "tel") {
        return target.slice(scheme.length + 1) || target;
    }
    // Only the web has a host worth showing on its own. Anything else — a
    // vault link, an app's own scheme — says more in full than it would as a
    // hostname pulled out of the middle of it.
    if (scheme !== null && scheme !== "http" && scheme !== "https") {
        return target;
    }
    try {
        const url = new URL(target);
        /*
         * L'adresse entière, et pas seulement l'hôte.
         *
         * L'hôte seul suffit quand on garde un lien par site ; il ne suffit
         * plus dès qu'on en garde trois du même. Trois lignes disant toutes
         * « vm.tiktok.com » ne se distinguent pas, et c'est justement le code
         * de partage, à la fin, qui les sépare.
         *
         * Le schéma part quand même : « https:// » est le même sur tout, ne
         * distingue rien, et prend huit caractères de la place qui manque à ce
         * qui distingue. La barre finale part pour la même raison.
         */
        const shown = `${url.host.replace(/^www\./, "")}${url.pathname}${
            url.search
        }${url.hash}`.replace(/\/+$/, "");
        return shown || target;
    } catch {
        return target;
    }
}

/**
 * The markdown to write for what was typed, or null if it holds no link.
 *
 * A bare host is assumed to be https: that is what a phone means when it hands
 * you "instagram.com/…", and http would be a downgrade nobody asked for.
 */
export function urlMarkdown(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isInlineMarkdownLink(trimmed)) return trimmed;

    const found = findUrl(trimmed);
    if (!found) return null;

    const scheme = schemeOf(found);
    if (scheme && DANGEROUS_SCHEMES.includes(scheme)) return null;

    // A bare host is https: that is what a phone means when it hands you
    // "instagram.com/…", and http would be a downgrade nobody asked for.
    const target = scheme === null ? `https://${found}` : found;
    return `[${labelFor(target)}](${target})`;
}

export interface DescriptionMention {
    start: number;
    end: number;
    query: string;
}

/**
 * The vault-note mention currently being written in a description.
 *
 * The last `@` on the current line owns everything up to the caret, including
 * spaces, so note titles can be searched naturally. It starts a word (or a
 * parenthesised word), never the middle of an email, identifier or URL.
 */
export function descriptionMentionAt(
    value: string,
    caret: number
): DescriptionMention | null {
    const end = Math.max(0, Math.min(caret, value.length));
    const lineStart = value.lastIndexOf("\n", end - 1) + 1;
    const start = value.lastIndexOf("@", end - 1);
    if (start < lineStart) return null;

    const before = value[start - 1] ?? "";
    if (before && !/[\s(\[{]/.test(before)) return null;

    const query = value.slice(start + 1, end);
    if (query.includes("@") || query.includes("\n")) return null;
    return { start, end, query };
}

/** Remove the `@query` after its selected note has been stored as a link. */
export function withoutDescriptionMention(
    value: string,
    mention: DescriptionMention
): { value: string; caret: number } {
    const before = value.slice(0, mention.start);
    let after = value.slice(mention.end);
    if (before.endsWith(" ") && after.startsWith(" ")) after = after.slice(1);
    return { value: before + after, caret: before.length };
}

/**
 * Whether two link targets are the same place.
 *
 * Compared as addresses rather than as text: the scheme and host are
 * case-insensitive and a trailing slash means nothing, so "TikTok.com/a" and
 * "https://tiktok.com/a/" are one link written twice. The path and query keep
 * their case, because on most servers they are the only part that does.
 *
 * Anything that is not an address — a note inside the vault — is compared as
 * the path it is, trimmed.
 */
export function sameTarget(a: string, b: string): boolean {
    return normaliseTarget(a) === normaliseTarget(b);
}

/**
 * Whether two links lead to the same thing.
 *
 * Not the same question as being the same address. A site hands out a new
 * short code every time something is shared — two codes, one video — so two
 * rows that look unrelated can point at one place. Once each has been resolved
 * to the address it really goes to, the item's own id is what they have in
 * common, and it is the only part of either address that is about the thing
 * rather than about the sharing.
 */
export function sameDestination(a: string, b: string): boolean {
    if (sameTarget(a, b)) return true;
    const here = itemOf(a);
    return here !== null && here === itemOf(b);
}

/** A site and the id of one item on it: what two shares of it agree about. */
function itemOf(value: string): string | null {
    try {
        const url = new URL(value.trim());
        const id = url.pathname
            .split("/")
            .filter(Boolean)
            .reverse()
            .find((part) => /^\d{6,}$/.test(part));
        if (!id) return null;
        return `${url.hostname
            .toLowerCase()
            .split(".")
            .slice(-2)
            .join(".")}/${id}`;
    } catch {
        return null;
    }
}

function normaliseTarget(value: string): string {
    const trimmed = value.trim();
    try {
        const url = new URL(trimmed);
        const path = url.pathname.replace(/\/+$/, "");
        return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}${
            url.search
        }`;
    } catch {
        return trimmed.replace(/\/+$/, "");
    }
}
