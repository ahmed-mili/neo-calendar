import { linkKind } from "./linkKind";

describe("linkKind", () => {
    it("recognises an app whatever subdomain it was shared from", () => {
        expect(linkKind("https://www.youtube.com/watch?v=a")).toBe("youtube");
        expect(linkKind("https://m.youtube.com/watch?v=a")).toBe("youtube");
        expect(linkKind("https://youtu.be/a")).toBe("youtube");
        expect(linkKind("https://vm.tiktok.com/ZMabc/")).toBe("tiktok");
        expect(linkKind("https://open.spotify.com/track/1")).toBe("spotify");
    });

    it("follows a brand that changed its name", () => {
        expect(linkKind("https://twitter.com/someone")).toBe("x");
        expect(linkKind("https://x.com/someone")).toBe("x");
    });

    it("is not fooled by a host that merely ends the same way", () => {
        // endsWith would have called both of these by the wrong name.
        expect(linkKind("https://nottiktok.com/a")).toBe("web");
        expect(linkKind("https://evil-x.com/a")).toBe("web");
        expect(linkKind("https://youtube.com.phish.example/a")).toBe("web");
    });

    it("knows the vault from what the row already stored", () => {
        // A vault path is not a URL; there is nothing in it to match on.
        expect(linkKind("Notes/Réunion.md", "note")).toBe("vault");
        expect(linkKind("Fichiers/plan.pdf", "attachment")).toBe("vault");
        expect(linkKind("obsidian://open?vault=notes&file=a")).toBe("vault");
    });

    it("reads a bare path as something in the vault", () => {
        expect(linkKind("Notes/Réunion.md")).toBe("vault");
    });

    it("keeps the two schemes that are neither web nor vault", () => {
        expect(linkKind("mailto:a@b.com")).toBe("mail");
        expect(linkKind("tel:+33123456789")).toBe("phone");
    });

    it("calls anything else a website", () => {
        expect(linkKind("https://example.com/a")).toBe("web");
        expect(linkKind("http://192.168.1.1/")).toBe("web");
    });

    it("has an answer for nothing at all", () => {
        expect(linkKind("")).toBe("web");
        expect(linkKind("   ")).toBe("web");
    });
});

describe("linkKind, the marks that were added with them", () => {
    it("knows Reddit by either of its hosts", () => {
        expect(linkKind("https://www.reddit.com/r/a/comments/b")).toBe(
            "reddit"
        );
        expect(linkKind("https://redd.it/abc")).toBe("reddit");
    });
});

describe("linkKind, Google's services", () => {
    it("tells them apart by their subdomain", () => {
        expect(linkKind("https://docs.google.com/document/d/a")).toBe(
            "googledocs"
        );
        expect(linkKind("https://drive.google.com/file/d/a")).toBe(
            "googledrive"
        );
        expect(linkKind("https://calendar.google.com/r/day")).toBe(
            "googlecalendar"
        );
        expect(linkKind("https://mail.google.com/mail/u/0")).toBe("gmail");
    });

    it("leaves the rest of Google as an ordinary web page", () => {
        // A search result is a page like any other; there is no entry for
        // google.com itself, on purpose.
        expect(linkKind("https://www.google.com/search?q=a")).toBe("web");
        expect(linkKind("https://google.com")).toBe("web");
    });
});

describe("linkKind, the apps a link on an event tends to point at", () => {
    it("knows each by its own hosts", () => {
        expect(linkKind("https://www.notion.so/a-page")).toBe("notion");
        expect(linkKind("https://discord.gg/abc")).toBe("discord");
        expect(linkKind("https://t.me/someone")).toBe("telegram");
        expect(linkKind("https://www.twitch.tv/someone")).toBe("twitch");
        expect(linkKind("https://www.figma.com/file/abc")).toBe("figma");
        expect(linkKind("https://store.steampowered.com/app/1")).toBe("steam");
        expect(linkKind("https://signal.me/#p/+33")).toBe("signal");
    });
});
