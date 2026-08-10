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

/*
 * ── Asking the site directly ──────────────────────────────────
 *
 * Reading a page's <title> works for a page. It does not work for a video:
 * TikTok hands a plain HTTP client its front door, so every link came back
 * called "TikTok - Make Your Day", which is the name of the company and not of
 * anything you saved.
 *
 * The usual workaround is to pretend to be a browser by sending its
 * User-Agent. That is a lie told to get a different answer, it needs native
 * code on both platforms to send a header, and it breaks whenever the site
 * decides to look harder.
 *
 * These sites already answer the question honestly, at an address published
 * for it: oEmbed. It is a small piece of JSON, no key, no pretending, and it
 * gives the title of the thing rather than of the site. Where a site has one,
 * it is asked first; everything else still reads the page.
 */

const OEMBED: ReadonlyArray<readonly [string, (url: string) => string]> = [
    ["tiktok.com", (url) => `https://www.tiktok.com/oembed?url=${url}`],
    [
        "youtube.com",
        (url) => `https://www.youtube.com/oembed?format=json&url=${url}`,
    ],
    [
        "youtu.be",
        (url) => `https://www.youtube.com/oembed?format=json&url=${url}`,
    ],
    ["vimeo.com", (url) => `https://vimeo.com/api/oembed.json?url=${url}`],
    ["open.spotify.com", (url) => `https://open.spotify.com/oembed?url=${url}`],
    ["reddit.com", (url) => `https://www.reddit.com/oembed?url=${url}`],
];

/** Where to ask a site what a link of its own is called, if it says. */
export function oembedUrlFor(target: string): string | null {
    let host: string;
    try {
        const parsed = new URL(target);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return null;
    }

    for (const [domain, build] of OEMBED) {
        if (host === domain || host.endsWith(`.${domain}`)) {
            return build(encodeURIComponent(target));
        }
    }
    return null;
}

/**
 * The title inside an oEmbed answer.
 *
 * Anything that is not the JSON we asked for — an error page, a redirect to a
 * login, a rate limit — is no title rather than a crash.
 */
export function titleFromOembed(json: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;

    const title = (parsed as { title?: unknown }).title;
    if (typeof title !== "string") return null;

    const text = title.replace(/\s+/g, " ").trim();
    if (!text) return null;

    return text.length > MAX_TITLE_LENGTH
        ? text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd() + "…"
        : text;
}

/**
 * The address a page says it really lives at.
 *
 * A shared link is rarely the canonical one: `vm.tiktok.com/ZM…` is a note
 * saying where to go, and the place it points to is what the site will answer
 * questions about. Asking oEmbed about the short form gets a refusal, which is
 * how two different videos ended up with one title — the refusal fell back to
 * reading the page, and the page a plain client is shown is the front door.
 *
 * `og:url` first, then the canonical link tag: both are the page stating its
 * own address, which is exactly what is needed.
 */
export function canonicalUrlFrom(html: string): string | null {
    const head = html.slice(0, TITLE_SCAN_BYTES);

    const fromMeta = meta(head, "og:url");
    if (fromMeta) return fromMeta.trim() || null;

    const link = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.exec(head)?.[0];
    const href = link
        ? /href\s*=\s*["']([^"']+)["']/i.exec(link)?.[1]
        : undefined;
    return href?.trim() || null;
}

/**
 * Titles that mean "we are not telling you".
 *
 * These are not a guess at what a bad title looks like: they are the exact
 * words these sites put on the page they show a client they do not recognise.
 * Writing one into a note is worse than writing nothing, because it looks like
 * an answer — two different videos both called "TikTok - Make Your Day" read as
 * a bug in this app rather than as a refusal from theirs.
 *
 * Keyed by host so a video legitimately called "TikTok" on some other site is
 * left alone.
 */
const FRONT_DOORS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
        "tiktok.com",
        ["tiktok", "tiktok - make your day", "tiktok - trending videos"],
    ],
    ["instagram.com", ["instagram"]],
    ["x.com", ["x", "x (formerly twitter)"]],
    ["twitter.com", ["twitter"]],
    ["facebook.com", ["facebook", "facebook - log in or sign up"]],
    ["threads.net", ["threads"]],
];

export function isFrontDoorTitle(title: string, target: string): boolean {
    let host: string;
    try {
        host = new URL(target).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return false;
    }

    const said = title.toLowerCase().replace(/\s+/g, " ").trim();
    for (const [domain, doors] of FRONT_DOORS) {
        if (host === domain || host.endsWith(`.${domain}`)) {
            return doors.includes(said);
        }
    }
    return false;
}

/**
 * Whether an oEmbed answer is about the link we asked about.
 *
 * A title that belongs to something else is worse than no title: it reads as
 * an answer. Two different videos arriving with one title between them is what
 * that looks like from the outside, and nothing in the shape of the JSON says
 * which link it describes — so the link's own identifier is looked for inside
 * it.
 *
 * The identifier is the distinctive part of the address: the numeric video id
 * a canonical URL ends with, or the short code a shared link is made of. Every
 * oEmbed answer repeats it — in the embed markup, in the thumbnail, in the
 * author's address — so its absence means the answer is about something else.
 *
 * Unknown shapes are trusted rather than rejected: this guards against a wrong
 * answer, not against every answer.
 */
export function oembedAnswersFor(json: string, url: string): boolean {
    let path: string;
    try {
        const parsed = new URL(url);
        path = parsed.pathname;
    } catch {
        return true;
    }

    const segments = path.split("/").filter(Boolean);
    const identifier =
        // A canonical video address ends with its id.
        segments.reverse().find((part) => /^\d{6,}$/.test(part)) ??
        // A shared link is one opaque code and nothing else.
        (segments.length === 1 && /^[A-Za-z0-9_-]{6,}$/.test(segments[0])
            ? segments[0]
            : null);

    if (!identifier) return true;
    return json.includes(identifier);
}
