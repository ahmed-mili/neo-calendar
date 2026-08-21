import { creditLine, needsCredit } from "./wallpaperCredit";
import { WALLPAPERS } from "./wallpapers";

describe("what a wallpaper says about where it comes from", () => {
    it("names the person and the place", () => {
        expect(creditLine({ author: "Kevin Dupont", source: "Unsplash" })).toBe(
            "Kevin Dupont · Unsplash"
        );
    });

    /*
     * The source alone when the author is not known. Inventing a name would be
     * worse than saying nothing: a credit exists to point at whoever made the
     * picture, and a wrong one points away from them.
     */
    it("names the place alone when nobody is named", () => {
        expect(creditLine({ source: "Unsplash" })).toBe("Unsplash");
    });

    it("says nothing at all for a wallpaper that has no credit", () => {
        expect(creditLine(undefined)).toBe(null);
    });
});

describe("which wallpapers still need somebody to say where they came from", () => {
    /*
     * The catalogue was built by dropping files into a folder, and nothing ever
     * recorded where they came from. This is what tells us the list is not
     * finished — rather than the credits quietly being absent for years.
     */
    it("is every photograph carrying no credit", () => {
        expect(
            needsCredit([
                { id: "a", imageUrl: "a.jpg" },
                { id: "b", imageUrl: "b.jpg", credit: { source: "Unsplash" } },
                { id: "theme", imageUrl: null },
            ])
        ).toEqual(["a"]);
    });

    // A colour and the theme's own background are nobody's photograph.
    it("leaves out what is not an image", () => {
        expect(needsCredit([{ id: "none", imageUrl: null }])).toEqual([]);
    });
});

describe("the catalogue as it stands", () => {
    /*
     * Nothing recorded where the photographs came from — no metadata in the
     * files, nothing in the commits that added them — so the answer came from
     * Ahmed, who chose them: Unsplash, all of them.
     *
     * The test stays because a wallpaper added later without a source would
     * push this off zero, and an omission that shows is one that gets fixed.
     */
    it("owes nobody a source any more", () => {
        expect(needsCredit(WALLPAPERS)).toEqual([]);
    });

    /*
     * One file says something about itself that the others do not: a C2PA
     * signature from an OpenAI media service. A generated image can perfectly
     * well be published on Unsplash, so both facts are kept — the source it
     * was taken from, and what the file proves about how it was made.
     */
    it("keeps what one file proves about itself, beside its source", () => {
        const generated = WALLPAPERS.find(
            (wallpaper) => wallpaper.id === "starlit-alpine-refuge"
        );
        expect(generated?.credit?.source).toBe("Unsplash · image générée");
    });

    // The link is to Unsplash and not to each photograph: which page each one
    // came from was never written down, and twenty-five invented addresses
    // would point at twenty-five photographs at random.
    it("links to the source it can name", () => {
        for (const wallpaper of WALLPAPERS) {
            if (!wallpaper.credit) continue;
            expect(wallpaper.credit.url).toBe("https://unsplash.com");
        }
    });

    // Whatever is credited says at least where it comes from; an author on its
    // own names somebody without saying where to find them.
    it("never credits a wallpaper without naming a source", () => {
        for (const wallpaper of WALLPAPERS) {
            if (!wallpaper.credit) continue;
            expect(wallpaper.credit.source.trim().length).toBeGreaterThan(0);
        }
    });
});
