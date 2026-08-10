/*
 * What a link points at, so a row can show it rather than spell it out.
 *
 * Every linked row wore the same document icon — a note in the vault, a
 * YouTube video and an email address were indistinguishable until you read the
 * text beside them. The destination is the first thing you want to know and
 * the easiest to show, so it goes in the slot that was already there.
 *
 * Matching is on the host, and on the registrable part of it: `youtu.be` and
 * `m.youtube.com` and `www.youtube.com` are all YouTube. Adding another app is
 * one line in HOSTS below and one glyph beside it.
 */

export type LinkKind =
    | "vault"
    | "youtube"
    | "instagram"
    | "tiktok"
    | "x"
    | "github"
    | "spotify"
    | "whatsapp"
    | "reddit"
    | "notion"
    | "discord"
    | "telegram"
    | "twitch"
    | "figma"
    | "gmail"
    | "googledocs"
    | "googlecalendar"
    | "googledrive"
    | "steam"
    | "signal"
    | "mail"
    | "phone"
    | "web";

/** Hosts, longest first so `open.spotify.com` is read before `spotify.com`. */
const HOSTS: ReadonlyArray<readonly [string, LinkKind]> = [
    ["youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["instagram.com", "instagram"],
    ["instagr.am", "instagram"],
    ["tiktok.com", "tiktok"],
    ["twitter.com", "x"],
    ["x.com", "x"],
    ["github.com", "github"],
    ["spotify.com", "spotify"],
    ["whatsapp.com", "whatsapp"],
    ["wa.me", "whatsapp"],
    ["reddit.com", "reddit"],
    ["redd.it", "reddit"],
    ["notion.so", "notion"],
    ["notion.site", "notion"],
    ["discord.com", "discord"],
    ["discord.gg", "discord"],
    ["t.me", "telegram"],
    ["telegram.org", "telegram"],
    ["twitch.tv", "twitch"],
    ["figma.com", "figma"],
    // Google's services are told apart by their subdomain, so each is listed
    // in full. There is deliberately no entry for google.com itself: a search
    // result is a web page like any other.
    ["mail.google.com", "gmail"],
    ["docs.google.com", "googledocs"],
    ["calendar.google.com", "googlecalendar"],
    ["drive.google.com", "googledrive"],
    ["store.steampowered.com", "steam"],
    ["steamcommunity.com", "steam"],
    ["signal.me", "signal"],
    ["signal.group", "signal"],
];

const hostOf = (target: string): string | null => {
    try {
        return new URL(target).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return null;
    }
};

/**
 * Whether `host` is `domain` or something under it.
 *
 * Written out rather than done with `endsWith`, which would read
 * `nottiktok.com` as TikTok and `evil-x.com` as X.
 */
function isUnder(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`);
}

/**
 * What kind of thing a link target is.
 *
 * `storedKind` is what the row already knew — a note or a file inside the
 * vault, as opposed to something on the web. It wins for those two, because a
 * vault path is not a URL and there is nothing in it to match on.
 */
export function linkKind(
    target: string,
    storedKind?: "note" | "attachment" | "web"
): LinkKind {
    const trimmed = target.trim();
    if (!trimmed) return "web";

    if (storedKind === "note" || storedKind === "attachment") return "vault";
    if (/^obsidian:\/\//i.test(trimmed)) return "vault";
    if (/^mailto:/i.test(trimmed)) return "mail";
    if (/^tel:/i.test(trimmed)) return "phone";

    const host = hostOf(trimmed);
    // No host and no scheme we know: a path inside the vault.
    if (!host) return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? "web" : "vault";

    for (const [domain, kind] of HOSTS) {
        if (isUnder(host, domain)) return kind;
    }
    return "web";
}
