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
     * A to-do list that cannot be lost, rather than credits quietly absent for
     * years. The photographs were dropped into a folder and nothing recorded
     * where they came from — no metadata in the files, nothing in the commits
     * that added them — so the answer has to come from whoever chose them.
     *
     * This number goes DOWN as sources are supplied, and a new wallpaper added
     * without one pushes it up, which is the point: the test says so instead of
     * the omission going unnoticed.
     */
    it("still owes a source for most of its photographs", () => {
        expect(needsCredit(WALLPAPERS).length).toBe(24);
    });

    // The one that says where it comes from does so from inside the file: a
    // C2PA signature, not a guess.
    it("credits the one image that carries its own provenance", () => {
        const generated = WALLPAPERS.find(
            (wallpaper) => wallpaper.id === "starlit-alpine-refuge"
        );
        expect(generated?.credit?.source).toBe("Image générée (OpenAI)");
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
