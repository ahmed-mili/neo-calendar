import {
    addressesToAsk,
    authorFromOembed,
    MAX_TITLE_LENGTH,
    TITLE_SCAN_BYTES,
    canonicalUrlFrom,
    confirmedTarget,
    decodeEntities,
    isFrontDoorTitle,
    oembedAnswersFor,
    oembedUrlFor,
    pageTitleFrom,
    resolvedTarget,
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
        const buried =
            "x".repeat(TITLE_SCAN_BYTES) + "<title>Trop loin</title>";
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

describe("canonicalUrlFrom", () => {
    it("takes the address the page says it lives at", () => {
        // The short link is a note saying where to go; oEmbed answers about
        // the place, not about the note.
        expect(
            canonicalUrlFrom(
                '<meta property="og:url" content="https://www.tiktok.com/@a/video/123">'
            )
        ).toBe("https://www.tiktok.com/@a/video/123");
    });

    it("falls back to the canonical link tag", () => {
        expect(
            canonicalUrlFrom(
                '<link rel="canonical" href="https://a.example/b">'
            )
        ).toBe("https://a.example/b");
    });

    it("has nothing to give when the page does not say", () => {
        expect(canonicalUrlFrom("<html><head></head></html>")).toBeNull();
        expect(
            canonicalUrlFrom('<meta property="og:url" content="  ">')
        ).toBeNull();
    });
});

describe("isFrontDoorTitle", () => {
    it("recognises the words a site uses when it tells you nothing", () => {
        // Two different videos both called this is what the bug looked like.
        expect(
            isFrontDoorTitle(
                "TikTok - Make Your Day",
                "https://vm.tiktok.com/a/"
            )
        ).toBe(true);
        expect(
            isFrontDoorTitle("tiktok", "https://www.tiktok.com/@a/video/1")
        ).toBe(true);
        expect(
            isFrontDoorTitle("Instagram", "https://instagram.com/reel/a")
        ).toBe(true);
    });

    it("leaves a real title alone, even one naming the site", () => {
        expect(
            isFrontDoorTitle(
                "ma recette de pain — TikTok",
                "https://vm.tiktok.com/a/"
            )
        ).toBe(false);
    });

    it("only applies the words to the site they belong to", () => {
        // A page elsewhere genuinely called "TikTok" is a real title.
        expect(isFrontDoorTitle("TikTok", "https://example.com/a")).toBe(false);
    });

    it("says nothing about something that is not an address", () => {
        expect(isFrontDoorTitle("TikTok", "not a url")).toBe(false);
    });
});

describe("oembedAnswersFor", () => {
    const about = (id: string) =>
        JSON.stringify({
            title: "une vidéo",
            author_url: "https://www.tiktok.com/@someone",
            html: `<blockquote data-video-id="${id}"></blockquote>`,
        });

    it("accepts an answer that names the video it was asked about", () => {
        expect(
            oembedAnswersFor(
                about("7123456789012345678"),
                "https://www.tiktok.com/@someone/video/7123456789012345678"
            )
        ).toBe(true);
    });

    it("refuses an answer about a different video", () => {
        // This is the shape of the bug: a real title, for something else.
        expect(
            oembedAnswersFor(
                about("7000000000000000000"),
                "https://www.tiktok.com/@someone/video/7123456789012345678"
            )
        ).toBe(false);
    });

    it("accepts an answer about a shared link, which never repeats its code", () => {
        // The short link is a note saying where to go; the answer describes
        // the place. Requiring the code shipped once and left every shared
        // link with no title at all.
        expect(
            oembedAnswersFor(
                about("7123456789012345678"),
                "https://vm.tiktok.com/ZN8RmLXNp/"
            )
        ).toBe(true);
    });

    it("trusts an address with nothing distinctive to check", () => {
        // The guard is against a wrong answer, not against every answer.
        expect(oembedAnswersFor('{"title":"a"}', "https://example.com/")).toBe(
            true
        );
        expect(oembedAnswersFor('{"title":"a"}', "not a url")).toBe(true);
    });
});

describe("confirmedTarget", () => {
    const shared = "https://vm.tiktok.com/ZN8RmLXNp/";
    const real = "https://www.tiktok.com/@qoranioff/video/7671974074775784707";
    const answer = JSON.stringify({
        title: "une vidéo",
        html: '<blockquote data-video-id="7671974074775784707"></blockquote>',
    });

    it("keeps the address the link really goes to", () => {
        // Two short codes for one video is what a share does; stored by where
        // they lead, they are visibly the same link.
        expect(confirmedTarget(shared, real, answer)).toBe(real);
    });

    it("drops the tracking the share was carrying", () => {
        expect(
            confirmedTarget(shared, `${real}?_t=ZS-R1dmcg&_r=1`, answer)
        ).toBe(real);
    });

    it("refuses a front door offering itself as the address", () => {
        // The interstitial a plain client is shown says og:url is the
        // homepage. Believing it would move the link to the homepage.
        expect(confirmedTarget(shared, "https://www.tiktok.com/", answer)).toBe(
            shared
        );
    });

    it("never lets a page send the link to another site", () => {
        expect(
            confirmedTarget(
                shared,
                "https://evil.example/7671974074775784707",
                answer
            )
        ).toBe(shared);
        expect(confirmedTarget(shared, "javascript:alert(1)", answer)).toBe(
            shared
        );
    });

    it("wants the site's own answer to confirm the address", () => {
        expect(confirmedTarget(shared, real, '{"title":"autre chose"}')).toBe(
            shared
        );
        expect(confirmedTarget(shared, real, null)).toBe(shared);
        expect(confirmedTarget(shared, null, answer)).toBe(shared);
    });

    it("leaves an address it cannot read alone", () => {
        expect(confirmedTarget("not a url", real, answer)).toBe("not a url");
    });
});

describe("les adresses à interroger pour un lien partagé", () => {
    const SHORT = "https://vm.tiktok.com/ZN88SfmSj/";
    const REAL = "https://www.tiktok.com/@quelquun/video/7412345678901234567";

    // Le lien court ne dit rien de sa destination : celle-ci vient soit de la
    // page, soit de la redirection. Les deux sont tentées, le lien en dernier.
    it("garde l'ordre et écarte les doublons", () => {
        expect(addressesToAsk(REAL, REAL, SHORT)).toEqual([REAL, SHORT]);
    });

    it("ignore ce qui n'est pas une adresse web", () => {
        expect(addressesToAsk(null, "", "obsidian://note", SHORT)).toEqual([
            SHORT,
        ]);
    });

    // Une porte d'entrée offre sa page d'accueil comme adresse canonique ; la
    // redirection, elle, mène à la vidéo. Les deux sont posées à la suite.
    it("garde la page d'accueil et la vraie adresse comme deux pistes", () => {
        expect(addressesToAsk("https://www.tiktok.com/", REAL, SHORT)).toEqual([
            "https://www.tiktok.com/",
            REAL,
            SHORT,
        ]);
    });
});

describe("l'auteur, quand la chose n'a pas de nom", () => {
    // Une vidéo sans légende répond avec un titre vide : le lien retombait sur
    // son hôte alors que la réponse portait le nom de qui l'a publiée.
    it("prend le pseudonyme de préférence", () => {
        expect(
            authorFromOembed(
                JSON.stringify({
                    title: "",
                    author_name: "Camille Dupont",
                    author_unique_id: "camille",
                })
            )
        ).toBe("@camille");
    });

    it("n'ajoute pas un second arobase", () => {
        expect(
            authorFromOembed(JSON.stringify({ author_unique_id: "@camille" }))
        ).toBe("@camille");
    });

    it("se rabat sur le nom affiché", () => {
        expect(
            authorFromOembed(JSON.stringify({ author_name: "Camille Dupont" }))
        ).toBe("Camille Dupont");
    });

    it("ne rend rien quand la réponse ne nomme personne", () => {
        expect(authorFromOembed(JSON.stringify({ title: "" }))).toBeNull();
        expect(authorFromOembed("pas du json")).toBeNull();
    });
});

describe("resolvedTarget", () => {
    const share = "https://vm.tiktok.com/ZN88G1NAU/";
    const landed =
        "https://www.tiktok.com/@fatwasfr/video/7645383659813391648?_r=1&_t=ZS-98w1uo1SlOL";

    // Following the share is not a claim made by a page: it is where the link
    // goes. The account and the publication time are read off that address and
    // nowhere else, so it is worth keeping even when the site says nothing.
    it("keeps the address a share leads to, without its share query", () => {
        expect(resolvedTarget(share, landed)).toBe(
            "https://www.tiktok.com/@fatwasfr/video/7645383659813391648"
        );
    });

    it("refuses a landing that names no item", () => {
        expect(resolvedTarget(share, "https://www.tiktok.com/login")).toBe(
            share
        );
    });

    // A shortener leading to another site is what a shortener IS: refusing
    // those would look through none of the links that most need it.
    it("follows a shortener wherever it goes", () => {
        expect(
            resolvedTarget(
                "https://bit.ly/3xYzAbc",
                "https://example.com/post/1"
            )
        ).toBe("https://example.com/post/1");
        expect(
            resolvedTarget(
                "https://youtu.be/dQw4w9WgXcQ",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            )
        ).toBe("https://www.youtube.com/watch");
    });

    // A dead, throttled or app-only share lands on a bare host or on a wall,
    // both of which say less than the code did.
    it("keeps the share when it lands nowhere in particular", () => {
        expect(
            resolvedTarget("https://bit.ly/3xYzAbc", "https://bit.ly/")
        ).toBe("https://bit.ly/3xYzAbc");
        expect(
            resolvedTarget(
                "https://bit.ly/3xYzAbc",
                "https://example.com/login"
            )
        ).toBe("https://bit.ly/3xYzAbc");
    });

    // An ordinary address is never rewritten to wherever it redirects today.
    it("refuses to move an ordinary link to another site", () => {
        expect(
            resolvedTarget(
                "https://www.tiktok.com/@someone/video/7645383659813391648",
                "https://login.example.com/oauth?next=%2F"
            )
        ).toBe("https://www.tiktok.com/@someone/video/7645383659813391648");
    });

    it("keeps the link itself when nothing was resolved", () => {
        expect(resolvedTarget(share, null)).toBe(share);
        expect(resolvedTarget(share, "not a url")).toBe(share);
    });
});
