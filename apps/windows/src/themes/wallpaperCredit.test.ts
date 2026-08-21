import {
    creditByline,
    creditLine,
    isUnsplash,
    needsCredit,
} from "./wallpaperCredit";
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

describe("the credit shown beside the source's own mark", () => {
    /*
     * Unsplash writes it this way under its own photographs, and the picker
     * draws the logo next to it: the name is what the line has left to say.
     */
    it("gives the photographer's name the whole line", () => {
        expect(creditByline({ author: "Uran Wang", source: "Unsplash" })).toBe(
            "Photo de Uran Wang"
        );
    });

    // With nobody named, the source is all there is to show.
    it("falls back to the source when nobody is named", () => {
        expect(creditByline({ source: "Unsplash" })).toBe("Unsplash");
    });

    it("says nothing for a wallpaper that has no credit", () => {
        expect(creditByline(undefined)).toBe(null);
    });

    // The mark is only drawn for the source it actually belongs to.
    it("recognises which source has a mark to draw", () => {
        expect(isUnsplash({ source: "Unsplash" })).toBe(true);
        expect(isUnsplash({ source: "Pexels" })).toBe(false);
        expect(isUnsplash(undefined)).toBe(false);
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
     * Every photograph in the catalogue was picked from Ahmed's Unsplash
     * favourites, and its author and page were read off Unsplash itself, one
     * by one. A wallpaper added later without a source would push this off
     * zero, and an omission that shows is one that gets fixed.
     */
    it("owes nobody a source any more", () => {
        expect(needsCredit(WALLPAPERS)).toEqual([]);
    });

    /*
     * The link goes to the photograph, not to the front page of Unsplash.
     * That is the whole difference between a credit somebody can check and a
     * gesture towards a website: from this address you reach the author, the
     * licence and the original.
     */
    it("links to the photograph itself", () => {
        for (const wallpaper of WALLPAPERS) {
            if (!wallpaper.credit) continue;

            expect([
                wallpaper.id,
                wallpaper.credit.url?.startsWith(
                    "https://unsplash.com/photos/"
                ),
            ]).toEqual([wallpaper.id, true]);
        }
    });

    // A source without a name credits a website for somebody's work.
    it("names the photographer of every photograph", () => {
        for (const wallpaper of WALLPAPERS) {
            if (!wallpaper.credit) continue;

            expect([
                wallpaper.id,
                (wallpaper.credit.author ?? "").trim().length > 0,
            ]).toEqual([wallpaper.id, true]);
        }
    });

    /*
     * The two formats of one photograph are the same photograph: same author,
     * same page. Cropping it for a phone does not make it somebody else's.
     */
    it("credits both formats of a photograph identically", () => {
        for (const wallpaper of WALLPAPERS) {
            if (!wallpaper.id.endsWith("-portrait")) continue;

            const landscape = WALLPAPERS.find(
                (other) => other.id === wallpaper.id.replace(/-portrait$/, "")
            );

            expect([wallpaper.id, wallpaper.credit]).toEqual([
                wallpaper.id,
                landscape?.credit,
            ]);
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
