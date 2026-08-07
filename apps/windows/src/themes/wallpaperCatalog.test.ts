import { getWallpapersForRuntime, getWallpaper } from "./wallpapers";

describe("the wallpaper catalogue offered to a device", () => {
    // A landscape photo cropped to a phone screen shows a strip of its middle,
    // and a portrait one on a desktop shows two bars. Neither belongs in the
    // other's list.
    it("hides desktop wallpapers from a phone", () => {
        const offered = getWallpapersForRuntime("android").map(
            (wallpaper) => wallpaper.target
        );

        expect(offered).not.toContain("pc");
    });

    it("hides phone wallpapers from a desktop", () => {
        const offered = getWallpapersForRuntime("pc").map(
            (wallpaper) => wallpaper.target
        );

        expect(offered).not.toContain("android");
    });

    it("offers the choices that suit any screen to both", () => {
        for (const runtime of ["android", "pc"] as const) {
            const ids = getWallpapersForRuntime(runtime).map(
                (wallpaper) => wallpaper.id
            );

            expect(ids).toContain("theme-default");
            expect(ids).toContain("none");
        }
    });

    it("offers the phone its own wallpapers", () => {
        const ids = getWallpapersForRuntime("android").map(
            (wallpaper) => wallpaper.id
        );

        expect(ids).toContain("android-alpenglow");
        expect(ids).toContain("starlit-alpine-refuge");
    });

    it("carries the starlit refuge as a portrait photo for phones", () => {
        const wallpaper = getWallpaper("starlit-alpine-refuge");

        expect(wallpaper.target).toBe("android");
        expect(wallpaper.aspect).toBe("portrait");
        expect(wallpaper.imageUrl).toBe(
            "/themes/neo-wallpapers/starlit-alpine-refuge.jpg"
        );
    });

    // Selecting a wallpaper the device cannot show would leave it stuck on a
    // background it never offered.
    it("keeps every offered wallpaper resolvable", () => {
        for (const runtime of ["android", "pc"] as const) {
            for (const offered of getWallpapersForRuntime(runtime)) {
                expect(getWallpaper(offered.id).id).toBe(offered.id);
            }
        }
    });
});
