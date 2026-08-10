import {
    MAX_TITLE_LENGTH,
    TITLE_SCAN_BYTES,
    decodeEntities,
    oembedUrlFor,
    pageTitleFrom,
    titleFromOembed,
    safeLabel,
    withDeadline,
} from "./linkTitle";

describe("pageTitleFrom", () => {
    it("prefers what a page says when it is being shared", () => {
        // og:title is written for exactly this; <title> is written for a tab
        // and usually carries the site's name after the real one.
        const html = `
            <head>
              <title>Une vidéo — TikTok</title>
              <meta property="og:title" content="Une vidéo">
            </head>`;
        expect(pageTitleFrom(html)).toBe("Une vidéo");
    });

    it("falls back through twitter:title to the tab's own", () => {
        expect(
            pageTitleFrom('<meta name="twitter:title" content="Deuxième">')
        ).toBe("Deuxième");
        expect(pageTitleFrom("<title>Troisième</title>")).toBe("Troisième");
    });

    it("reads the tag whatever order and quotes it was written in", () => {
        expect(
            pageTitleFrom(`<meta content='Ordre inverse' property="og:title">`)
        ).toBe("Ordre inverse");
    });

    it("puts a title spread over several lines back on one", () => {
        expect(pageTitleFrom("<title>\n  Un\n  titre\n</title>")).toBe(
            "Un titre"
        );
    });

    it("turns the entities a title actually contains back into text", () => {
        expect(pageTitleFrom("<title>Fish &amp; Chips</title>")).toBe(
            "Fish & Chips"
        );
        expect(pageTitleFrom("<title>L&#39;été</title>")).toBe("L'été");
        expect(pageTitleFrom("<title>caf&#xe9;</title>")).toBe("café");
    });

    it("shortens a title that is really a paragraph", () => {
        const long = "a".repeat(MAX_TITLE_LENGTH + 40);
        const title = pageTitleFrom(`<title>${long}</title>`)!;
        expect(title).toHaveLength(MAX_TITLE_LENGTH);
        expect(title.endsWith("…")).toBe(true);
    });

    it("stops looking after the head-sized part of the page", () => {
        // A title this far down is not a title; it is the page's content, and
        // scanning a whole document for it costs more than it is worth.
        const buried = "x".repeat(TITLE_SCAN_BYTES) + "<title>Trop loin</title>";
        expect(pageTitleFrom(buried)).toBeNull();
    });

    it("has nothing to say about a page that gives no title", () => {
        expect(pageTitleFrom("")).toBeNull();
        expect(pageTitleFrom("<html><body>rien</body></html>")).toBeNull();
        expect(pageTitleFrom("<title>   </title>")).toBeNull();
    });
});

describe("decodeEntities", () => {
    it("leaves something it does not know exactly as it found it", () => {
        expect(decodeEntities("&unknownthing;")).toBe("&unknownthing;");
        expect(decodeEntities("100% &amp; more")).toBe("100% & more");
    });
});

describe("safeLabel", () => {
    it("removes the brackets that would end the link early", () => {
        // "[a [b] c](url)" closes at the first "]", leaving " c](url)" as loose
        // text in the note.
        expect(safeLabel("Une [reprise] live")).toBe("Une reprise live");
    });
});

describe("withDeadline", () => {
    const immediately = (fn: () => void) => {
        fn();
        return 0 as unknown as number;
    };
    const never = () => 0 as unknown as number;

    it("gives back what the work returned, when it is in time", async () => {
        await expect(
            withDeadline(Promise.resolve("titre"), 100, never, () => {})
        ).resolves.toBe("titre");
    });

    it("gives up rather than hold the link back", async () => {
        await expect(
            withDeadline(new Promise(() => {}), 1, immediately, () => {})
        ).resolves.toBeNull();
    });

    it("treats a refusal as no title, not as an error", async () => {
        // A site that says no is the ordinary case, not an exception to report.
        await expect(
            withDeadline(Promise.reject(new Error("403")), 100, never, () => {})
        ).resolves.toBeNull();
    });

    it("ignores an answer that arrives after the deadline", async () => {
        let release: (value: string) => void = () => {};
        const late = new Promise<string>((resolve) => {
            release = resolve;
        });
        const result = withDeadline(late, 1, immediately, () => {});
        release("trop tard");
        await expect(result).resolves.toBeNull();
    });
});

describe("oembedUrlFor", () => {
    it("asks the sites that publish an answer", () => {
        expect(oembedUrlFor("https://vm.tiktok.com/ZMabc/")).toBe(
            "https://www.tiktok.com/oembed?url=https%3A%2F%2Fvm.tiktok.com%2FZMabc%2F"
        );
        expect(oembedUrlFor("https://youtu.be/abc")).toBe(
            "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2Fabc"
        );
    });

    it("covers a site's subdomains and its short form", () => {
        expect(oembedUrlFor("https://m.youtube.com/watch?v=a")).toContain(
            "youtube.com/oembed"
        );
        expect(oembedUrlFor("https://open.spotify.com/track/1")).toContain(
            "spotify.com/oembed"
        );
    });

    it("has nothing to ask for a site that publishes nothing", () => {
        expect(oembedUrlFor("https://example.com/a")).toBeNull();
        expect(oembedUrlFor("https://nottiktok.com/a")).toBeNull();
        expect(oembedUrlFor("mailto:a@b.com")).toBeNull();
        expect(oembedUrlFor("not a url")).toBeNull();
    });
});

describe("titleFromOembed", () => {
    it("takes the title of the thing, not of the site", () => {
        // The whole point: TikTok's page says "TikTok - Make Your Day"; its
        // oEmbed says what the video is.
        expect(
            titleFromOembed('{"title":"une recette de pain","author_name":"x"}')
        ).toBe("une recette de pain");
    });

    it("treats anything that is not the answer as no answer", () => {
        expect(titleFromOembed("<html>error</html>")).toBeNull();
        expect(titleFromOembed("null")).toBeNull();
        expect(titleFromOembed("[]")).toBeNull();
        expect(titleFromOembed('{"title":42}')).toBeNull();
        expect(titleFromOembed('{"title":"   "}')).toBeNull();
    });

    it("shortens an answer that is really a caption", () => {
        const long = "b".repeat(MAX_TITLE_LENGTH + 30);
        const title = titleFromOembed(JSON.stringify({ title: long }))!;
        expect(title).toHaveLength(MAX_TITLE_LENGTH);
    });
});
