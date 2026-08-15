import {
    findUrl,
    isInlineMarkdownLink,
    labelFor,
    sameDestination,
    sameTarget,
    urlMarkdown,
} from "./linkInput";

describe("urlMarkdown", () => {
    it("takes the links a phone actually hands you", () => {
        expect(urlMarkdown("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(
            "[youtu.be/dQw4w9WgXcQ?si=abc](https://youtu.be/dQw4w9WgXcQ?si=abc)"
        );
        expect(urlMarkdown("https://www.instagram.com/reel/Cxyz/?igsh=1")).toBe(
            "[instagram.com/reel/Cxyz/?igsh=1](https://www.instagram.com/reel/Cxyz/?igsh=1)"
        );
        expect(urlMarkdown("https://vm.tiktok.com/ZMabc/")).toBe(
            "[vm.tiktok.com/ZMabc](https://vm.tiktok.com/ZMabc/)"
        );
    });

    it("adds the scheme a bare address obviously meant", () => {
        // Typed by hand, or copied from an address bar that hides the scheme.
        expect(urlMarkdown("youtube.com/watch?v=abc")).toBe(
            "[youtube.com/watch?v=abc](https://youtube.com/watch?v=abc)"
        );
        expect(urlMarkdown("www.tiktok.com/@someone")).toBe(
            "[tiktok.com/@someone](https://www.tiktok.com/@someone)"
        );
    });

    it("finds the link inside the text an app shares", () => {
        expect(
            urlMarkdown("Regarde ça https://vm.tiktok.com/ZMabc/ via TikTok")
        ).toBe("[vm.tiktok.com/ZMabc](https://vm.tiktok.com/ZMabc/)");
    });

    it("leaves a link already written as markdown alone", () => {
        expect(urlMarkdown("[Ma note](https://example.com/a)")).toBe(
            "[Ma note](https://example.com/a)"
        );
        expect(urlMarkdown("![image](https://example.com/a.png)")).toBe(
            "![image](https://example.com/a.png)"
        );
    });

    it("keeps schemes that address something", () => {
        expect(urlMarkdown("mailto:someone@example.com")).toBe(
            "[someone@example.com](mailto:someone@example.com)"
        );
        expect(urlMarkdown("obsidian://open?vault=notes")).toBe(
            "[obsidian://open?vault=notes](obsidian://open?vault=notes)"
        );
        expect(urlMarkdown("tel:+33123456789")).toBe(
            "[+33123456789](tel:+33123456789)"
        );
    });

    it("does not turn a word with a colon in it into a link", () => {
        // The looser the rule, the more ordinary text it swallows. A scheme
        // needs its slashes, or to be one of the two that never had any.
        expect(urlMarkdown("note:important")).toBeNull();
        expect(urlMarkdown("Réunion: demain")).toBeNull();
    });

    it("refuses the schemes that run instead of address", () => {
        // A note is opened by a click; nothing shared from an app is one of
        // these, and one written into a note would be waiting to be tapped.
        expect(urlMarkdown("javascript:alert(1)")).toBeNull();
        expect(urlMarkdown("JavaScript:alert(1)")).toBeNull();
        expect(
            urlMarkdown("data:text/html,<script>alert(1)</script>")
        ).toBeNull();
        expect(urlMarkdown("vbscript:msgbox(1)")).toBeNull();
    });

    it("has nothing to offer for text that holds no link", () => {
        expect(urlMarkdown("")).toBeNull();
        expect(urlMarkdown("   ")).toBeNull();
        expect(urlMarkdown("réunion avec Marie")).toBeNull();
    });
});

describe("findUrl", () => {
    it("drops the punctuation that ended the sentence, not the link", () => {
        expect(findUrl("va voir https://example.com/a.")).toBe(
            "https://example.com/a"
        );
        expect(findUrl("« https://example.com/a »")).toBe(
            "https://example.com/a"
        );
    });

    it("keeps a bracket the link itself opened", () => {
        expect(findUrl("https://fr.wikipedia.org/wiki/Vague_(film)")).toBe(
            "https://fr.wikipedia.org/wiki/Vague_(film)"
        );
    });

    it("drops a bracket that was closing the sentence", () => {
        expect(findUrl("(voir https://example.com/a)")).toBe(
            "https://example.com/a"
        );
    });

    it("does not mistake ordinary words for an address", () => {
        expect(findUrl("réunion demain")).toBeNull();
        expect(findUrl("3.5 heures")).toBeNull();
    });
});

describe("labelFor", () => {
    // L'hôte seul suffit quand on garde un lien par site ; il ne suffit plus
    // dès qu'on en garde trois du même, et c'est la fin de l'adresse qui les
    // sépare.
    it("montre l'adresse entière, sans le schéma ni le www", () => {
        expect(labelFor("https://www.youtube.com/watch?v=abc")).toBe(
            "youtube.com/watch?v=abc"
        );
    });

    it("distingue deux partages d'un même site", () => {
        expect(labelFor("https://vm.tiktok.com/ZN88SfmSj/")).toBe(
            "vm.tiktok.com/ZN88SfmSj"
        );
        expect(labelFor("https://vm.tiktok.com/ZN88unp8a/")).toBe(
            "vm.tiktok.com/ZN88unp8a"
        );
    });

    it("garde l'hôte seul quand il n'y a rien après", () => {
        expect(labelFor("https://exemple.fr/")).toBe("exemple.fr");
        expect(labelFor("https://exemple.fr")).toBe("exemple.fr");
    });

    it("shows the address itself when there is no host to show", () => {
        expect(labelFor("mailto:a@b.com")).toBe("a@b.com");
        expect(labelFor("spotify:track:1")).toBe("spotify:track:1");
    });
});

describe("isInlineMarkdownLink", () => {
    it("recognises a link and an embed", () => {
        expect(isInlineMarkdownLink("[a](b)")).toBe(true);
        expect(isInlineMarkdownLink("![a](b)")).toBe(true);
    });

    it("is not fooled by half of one", () => {
        expect(isInlineMarkdownLink("[a]")).toBe(false);
        expect(isInlineMarkdownLink("(b)")).toBe(false);
        expect(isInlineMarkdownLink("[a]()")).toBe(false);
    });
});

describe("sameTarget", () => {
    it("sees one link written twice", () => {
        expect(
            sameTarget(
                "https://vm.tiktok.com/ZN8RmLXNp/",
                "https://vm.tiktok.com/ZN8RmLXNp"
            )
        ).toBe(true);
        // The scheme and host do not care about case; a trailing slash is not
        // a different place.
        expect(
            sameTarget(
                "https://TikTok.com/@a/video/1",
                "https://tiktok.com/@a/video/1"
            )
        ).toBe(true);
    });

    it("keeps the case of the part that carries meaning", () => {
        // Most servers treat a path as case-sensitive, so these are two pages.
        expect(
            sameTarget("https://example.com/Photo", "https://example.com/photo")
        ).toBe(false);
    });

    it("tells two different links apart", () => {
        expect(
            sameTarget(
                "https://vm.tiktok.com/ZN8RmLXNp/",
                "https://vm.tiktok.com/ZMother12/"
            )
        ).toBe(false);
        expect(
            sameTarget("https://example.com/a?v=1", "https://example.com/a?v=2")
        ).toBe(false);
    });

    it("compares a vault path as the path it is", () => {
        expect(sameTarget("Notes/Réunion.md", " Notes/Réunion.md ")).toBe(true);
        expect(sameTarget("Notes/A.md", "Notes/B.md")).toBe(false);
    });
});

describe("sameDestination", () => {
    const video = (id: string, who = "qoranioff") =>
        `https://www.tiktok.com/@${who}/video/${id}`;

    it("sees two shares of one video as one link", () => {
        // This is what the whole thing was about: a site mints a new short
        // code per share, so two rows nobody could tell apart pointed at the
        // same video.
        expect(
            sameDestination(
                video("7671974074775784707"),
                `${video("7671974074775784707")}?_t=ZS-R1dmcg`
            )
        ).toBe(true);
    });

    it("does not mind which account's page it was reached through", () => {
        expect(
            sameDestination(
                video("7671974074775784707"),
                video("7671974074775784707", "someone-else")
            )
        ).toBe(true);
    });

    it("still tells two different videos apart", () => {
        expect(
            sameDestination(
                video("7671974074775784707"),
                video("7000000000000000000")
            )
        ).toBe(false);
    });

    it("never joins two sites that happen to number things alike", () => {
        expect(
            sameDestination(
                video("7671974074775784707"),
                "https://example.com/7671974074775784707"
            )
        ).toBe(false);
    });

    it("falls back to the address when there is no item to compare", () => {
        // Unresolved short codes say nothing about where they lead, so they
        // are only equal to themselves.
        expect(
            sameDestination(
                "https://vm.tiktok.com/ZN8RmLXNp/",
                "https://vm.tiktok.com/ZN8Rmue8u/"
            )
        ).toBe(false);
        expect(
            sameDestination(
                "https://vm.tiktok.com/ZN8RmLXNp/",
                "https://vm.tiktok.com/ZN8RmLXNp"
            )
        ).toBe(true);
        expect(sameDestination("Notes/A.md", "Notes/A.md")).toBe(true);
    });
});
