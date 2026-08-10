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
