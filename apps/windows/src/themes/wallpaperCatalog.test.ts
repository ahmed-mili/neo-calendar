import fs from "node:fs";
import path from "node:path";

import {
    getWallpapersForRuntime,
    getWallpaper,
    WALLPAPERS,
} from "./wallpapers";

const PUBLIC_DIR = path.join(__dirname, "../../public");

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

    /*
     * A phone and a desktop are offered the same twenty photographs, each in
     * the shape its screen wants. Before, a photograph belonged to one device
     * or the other, so choosing the pretty one on a phone meant it was simply
     * absent — half a catalogue per device for no reason but the crop.
     */
    it("offers both devices the same photographs", () => {
        const photographs = (runtime: "android" | "pc") =>
            getWallpapersForRuntime(runtime)
                .filter((wallpaper) => wallpaper.imageUrl)
                .map((wallpaper) => wallpaper.id.replace(/-portrait$/, ""))
                .sort();

        expect(photographs("android")).toEqual(photographs("pc"));
        expect(photographs("pc")).toHaveLength(20);
    });

    it("gives the phone the upright crop and the desktop the wide one", () => {
        const upright = getWallpaper("starlit-snow-peak-portrait");
        const wide = getWallpaper("starlit-snow-peak");

        expect([upright.target, upright.aspect, upright.imageUrl]).toEqual([
            "android",
            "portrait",
            "/themes/neo-wallpapers/starlit-snow-peak-portrait.jpg",
        ]);
        expect([wide.target, wide.aspect, wide.imageUrl]).toEqual([
            "pc",
            "landscape",
            "/themes/neo-wallpapers/starlit-snow-peak.jpg",
        ]);
    });

    // A catalogue entry whose photo never shipped shows the user an empty
    // thumbnail and then a blank background once they pick it.
    it("ships the photo behind every entry that claims one", () => {
        for (const wallpaper of WALLPAPERS) {
            if (wallpaper.imageUrl === null) {
                continue;
            }

            const onDisk = path.join(PUBLIC_DIR, wallpaper.imageUrl);

            expect([wallpaper.id, fs.existsSync(onDisk)]).toEqual([
                wallpaper.id,
                true,
            ]);
        }
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

    /*
     * An entry saying "portrait" whose file is a landscape photograph is the
     * bug this whole catalogue exists to avoid: the phone would stretch a wide
     * picture across a tall screen. The shipped file is measured rather than
     * trusted — the manifest records what `npm run wallpapers` read off each
     * JPEG, so this compares the promise to the pixels.
     */
    it("ships each photo in the shape its entry promises", () => {
        const manifest = JSON.parse(
            fs.readFileSync(
                path.join(PUBLIC_DIR, "themes/neo-wallpapers/wallpapers.json"),
                "utf8"
            )
        ) as { wallpapers: { id: string; width: number; height: number }[] };

        for (const wallpaper of WALLPAPERS) {
            if (!wallpaper.imageUrl) continue;

            const shipped = manifest.wallpapers.find(
                (entry) => entry.id === wallpaper.id
            );
            const upright = !!shipped && shipped.height > shipped.width;

            expect([wallpaper.id, upright]).toEqual([
                wallpaper.id,
                wallpaper.aspect === "portrait",
            ]);
        }
    });
});
