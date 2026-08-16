/*
 * A link with another link behind it.
 *
 * Half the addresses that reach a calendar are not addresses at all: they are
 * notes saying where to go. `vm.tiktok.com/ZN88G1NAU`, `youtu.be/dQw4`,
 * `bit.ly/3xYz` — an opaque code minted for one share, carrying nothing about
 * what is at the other end. Everything this app shows about a link is read off
 * the address itself: the account, the publication date, whether two links are
 * the same video. A share code answers none of it, and the row shows a host
 * and nothing else.
 *
 * So the ones that hide something are recognised here, and looked through. The
 * question is only ever asked about a link that looks like a note: an ordinary
 * address is never rewritten to wherever it happens to redirect today, because
 * that is how a link ends up stored as a login page or a consent wall.
 */

/** Hosts whose whole purpose is to stand in for another address. */
const SHORTENERS = new Set([
    "amzn.eu",
    "amzn.to",
    "bit.ly",
    "buff.ly",
    "cutt.ly",
    "dlvr.it",
    "fb.me",
    "forms.gle",
    "g.co",
    "goo.gl",
    "is.gd",
    "lnkd.in",
    "m.me",
    "maps.app.goo.gl",
    "on.soundcloud.com",
    "ow.ly",
    "pin.it",
    "rb.gy",
    "redd.it",
    "shorturl.at",
    "spoti.fi",
    "t.co",
    "t.ly",
    "tiny.cc",
    "tinyurl.com",
    "trib.al",
    "vm.tiktok.com",
    "vt.tiktok.com",
    "wa.me",
    "youtu.be",
]);

/**
 * A code minted for one share: a single path segment, short, opaque.
 *
 * Deliberately narrow. `/@someone` names an account and `/video/7645…` names a
 * video — both say what they point at, and neither is a stand-in for anything.
 * What is left is a run of letters and digits that means nothing to a reader,
 * which is exactly what a share code is.
 */
function looksLikeShareCode(path: string): boolean {
    const parts = path.split("/").filter(Boolean);
    if (parts.length !== 1) return false;
    const code = parts[0];
    if (code.length < 4 || code.length > 24) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(code)) return false;
    // A number on its own is an item id, not a code — some sites address their
    // own content that way.
    return !/^\d+$/.test(code);
}

/** Is this address standing in for another one? */
export function isShareLink(target: string): boolean {
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (SHORTENERS.has(host)) return true;

    // A site's own share subdomain — `vm.`, `vt.`, `s.`, `share.` — handing out
    // a code. The list above cannot name them all, and the shape is plain.
    const shareSubdomain = /^(vm|vt|v|s|share|link|go)\./.test(host);
    return shareSubdomain && looksLikeShareCode(url.pathname);
}

/**
 * Words a landing page uses when it did not let you through.
 *
 * A share that has expired, been throttled, or asks to be opened in an app
 * lands on one of these, and storing it would trade a code that still means
 * something for an address that means nothing at all.
 */
const WALL_SEGMENTS = new Set([
    "404",
    "accounts",
    "auth",
    "captcha",
    "challenge",
    "consent",
    "error",
    "home",
    "index",
    "login",
    "logout",
    "notfound",
    "privacy",
    "robots",
    "signin",
    "signup",
    "sorry",
    "terms",
    "verify",
]);

/** Did following this link end at a wall rather than at what was shared? */
export function looksLikeWall(target: string): boolean {
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return true;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return true;
    return parts.some((part) =>
        WALL_SEGMENTS.has(part.toLowerCase().replace(/[-_]/g, ""))
    );
}

/**
 * Has this link been looked through already?
 *
 * The answer is the address itself: once a share has been resolved, the note
 * holds where it went, and there is nothing left behind it. Nothing is stored
 * to remember having asked.
 */
export function needsResolving(target: string, kind: string): boolean {
    return kind === "web" && isShareLink(target);
}
