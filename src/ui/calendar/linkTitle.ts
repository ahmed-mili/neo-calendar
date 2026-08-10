/*
 * The name of the thing a link points at.
 *
 * A row that reads "vm.tiktok.com" tells you the shape of the link and nothing
 * about what is on the other end. The title is what you actually kept the link
 * for — but it lives on a server, and a calendar has to work on a train.
 *
 * So it is read once, when the link is added, and written into the event's own
 * markdown as the link's label: `[the title](the address)`. After that the file
 * carries it. Nothing is fetched again, ever, and the row reads the same
 * offline as on. Only following the link needs the network, which is true of
 * links in general.
 *
 * Failing to read it is not a failure to add the link. No network, a site that
 * refuses, a page with no title — the link is added with its host as the label,
 * exactly as before. A title is an improvement on that, never a condition.
 */

/** Past this, we are reading a page, not looking for its head. */
export const TITLE_SCAN_BYTES = 64 * 1024;

/** Longer than this is a page that put its whole first paragraph in the title. */
export const MAX_TITLE_LENGTH = 120;

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#39": "'",
    nbsp: " ",
};

/** Turns the handful of entities a title realistically contains back into text. */
export function decodeEntities(value: string): string {
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
        const known = ENTITIES[name.toLowerCase()];
        if (known !== undefined) return known;
        if (name[0] === "#") {
            const code = name[1]?.toLowerCase() === "x"
                ? Number.parseInt(name.slice(2), 16)
                : Number.parseInt(name.slice(1), 10);
            if (Number.isFinite(code) && code > 0 && code < 0x110000) {
                return String.fromCodePoint(code);
            }
        }
        return whole;
    });
}

const meta = (html: string, property: string): string | null => {
    // Either order of attributes, either quote, and only in what we scanned.
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
        "i"
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) return null;
    return /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null;
};

/**
 * The title a page gives itself, or null if it gives none.
 *
 * `og:title` first: it is what a page says about itself when it is being shared,
 * which is exactly this. A `<title>` is written for a browser tab and often
 * carries the site's name after the real one — better than nothing, and second
 * for that reason.
 */
export function pageTitleFrom(html: string): string | null {
    const head = html.slice(0, TITLE_SCAN_BYTES);

    const raw =
        meta(head, "og:title") ??
        meta(head, "twitter:title") ??
        /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ??
        null;
    if (raw === null) return null;

    const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
    if (!text) return null;

    return text.length > MAX_TITLE_LENGTH
        ? text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd() + "…"
        : text;
}

/**
 * A markdown label may not contain a bracket: the link would end early, and
 * what followed would be loose text in the note.
 */
export function safeLabel(title: string): string {
    return title.replace(/[[\]]/g, "").trim();
}

/**
 * Waits for a promise, but not for long.
 *
 * The request itself has the timeout the platform gave it, which is measured in
 * tens of seconds — far too long to hold up adding a link. This is the wait,
 * not the request: when it runs out the link is added without a title, and
 * whatever the server eventually says is dropped.
 */
export function withDeadline<T>(
    work: Promise<T>,
    ms: number,
    setTimer: (fn: () => void, ms: number) => number = setTimeout,
    clearTimer: (id: number) => void = clearTimeout
): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
        let settled = false;
        const timer = setTimer(() => {
            if (settled) return;
            settled = true;
            resolve(null);
        }, ms);

        void work
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimer(timer);
                resolve(value);
            })
            .catch(() => {
                if (settled) return;
                settled = true;
                clearTimer(timer);
                resolve(null);
            });
    });
}
