import { batchNote, missingWallpapers } from "./wallpaperBatch";

const shelf = [
    { id: "a", imageUrl: "https://x/one.jpg" },
    { id: "b", imageUrl: "https://x/two.jpg" },
    { id: "c", imageUrl: null },
    { id: "d", imageUrl: "https://x/two.jpg" },
];

describe("what is left to fetch", () => {
    /*
     * Downloading them one at a time, from the list, meant opening the picker,
     * choosing one, waiting, opening it again. Nine wallpapers is nine round
     * trips through a menu to end up where one gesture should have left you.
     */
    it("is every wallpaper whose file is not there yet", () => {
        expect(
            missingWallpapers(
                shelf,
                new Set(["one.jpg"]),
                (url) => url.split("/").pop()!
            ).map((w) => w.id)
        ).toEqual(["b"]);
    });

    // A solid colour has no file to fetch, and asking for one would fail.
    it("leaves out what is not a photograph", () => {
        expect(
            missingWallpapers(
                shelf,
                new Set(["one.jpg", "two.jpg"]),
                (url) => url.split("/").pop()!
            )
        ).toEqual([]);
    });

    /*
     * Two entries can share one file — the same photograph cropped for a phone
     * and for a desktop. Fetching it twice is one wasted transfer on a mobile
     * connection.
     */
    it("asks for a shared file once", () => {
        expect(
            missingWallpapers(shelf, new Set(), (url) => url.split("/").pop()!)
                .length
        ).toBe(2);
    });

    it("has nothing to do where the files are already in the app", () => {
        expect(missingWallpapers([], new Set(), () => "")).toEqual([]);
    });
});

describe("what the button says while it works", () => {
    it("counts what is left before it starts", () => {
        expect(batchNote(null, 7)).toBe("Tout télécharger (7)");
    });

    it("counts as it goes", () => {
        expect(batchNote({ done: 3, total: 7, failed: 0 }, 4)).toBe(
            "Téléchargement… 3/7"
        );
    });

    /*
     * A failure in the middle stops nothing — one photograph out of nine is not
     * a reason to abandon the other eight — but it is said at the end rather
     * than passed over in silence.
     */
    it("says what did not arrive, once it is over", () => {
        expect(batchNote({ done: 7, total: 7, failed: 2 }, 2)).toBe(
            "2 fonds n'ont pas pu être téléchargés — appuyez pour réessayer"
        );
        expect(batchNote({ done: 7, total: 7, failed: 1 }, 1)).toBe(
            "1 fond n'a pas pu être téléchargé — appuyez pour réessayer"
        );
    });

    it("says nothing more once everything is there", () => {
        expect(batchNote({ done: 7, total: 7, failed: 0 }, 0)).toBe(null);
        expect(batchNote(null, 0)).toBe(null);
    });
});
