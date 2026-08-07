import {
    defaultDesktopWorkspacePreferences,
    reconcileWorkspacePreferences,
    type DesktopWorkspacePreferences,
} from "./desktopWorkspacePreferences";

const withColors = (
    colors: Record<string, string>,
    extra: Partial<DesktopWorkspacePreferences> = {}
): DesktopWorkspacePreferences => ({
    ...defaultDesktopWorkspacePreferences(),
    colors,
    ...extra,
});

describe("reconcileWorkspacePreferences", () => {
    // The failure Ahmed kept hitting: Syncthing swaps the preference file out
    // while it replaces it, the app reads nothing, and treats that as a fresh
    // install. The next thing he touches writes those empty defaults to disk.
    it("keeps what it already knows when the file could not be found", () => {
        const known = withColors({ "One Piece": "#58b2e8" });

        const result = reconcileWorkspacePreferences({
            previous: known,
            loaded: defaultDesktopWorkspacePreferences(),
            fileExisted: false,
        });

        expect(result.colors).toEqual({ "One Piece": "#58b2e8" });
    });

    it("takes the stored file when there is nothing in memory yet", () => {
        const stored = withColors({ Musculation: "#ff4000" });

        const result = reconcileWorkspacePreferences({
            previous: null,
            loaded: stored,
            fileExisted: true,
        });

        expect(result.colors).toEqual({ Musculation: "#ff4000" });
    });

    it("lets the stored file win on a colour both sides know", () => {
        const result = reconcileWorkspacePreferences({
            previous: withColors({ Études: "#111111" }),
            loaded: withColors({ Études: "#3264ff" }),
            fileExisted: true,
        });

        expect(result.colors["Études"]).toBe("#3264ff");
    });

    // The other half of the conflict: the two devices write the whole file, so
    // the one that syncs last erases colours the other had added. Neither copy
    // is wrong — they are both incomplete.
    it("keeps a colour the stored file has never heard of", () => {
        const result = reconcileWorkspacePreferences({
            previous: withColors({
                "One Piece": "#58b2e8",
                Valorant: "#710000",
            }),
            loaded: withColors({ Valorant: "#710000" }),
            fileExisted: true,
        });

        expect(result.colors).toEqual({
            "One Piece": "#58b2e8",
            Valorant: "#710000",
        });
    });

    it("keeps an ordering entry the stored file dropped", () => {
        const result = reconcileWorkspacePreferences({
            previous: withColors({}, { order: ["Études", "One Piece"] }),
            loaded: withColors({}, { order: ["Études"] }),
            fileExisted: true,
        });

        expect(result.order).toContain("One Piece");
    });

    it("follows the stored file's ordering for the entries it does list", () => {
        const result = reconcileWorkspacePreferences({
            previous: withColors({}, { order: ["A", "B", "C"] }),
            loaded: withColors({}, { order: ["C", "A"] }),
            fileExisted: true,
        });

        expect(result.order.slice(0, 2)).toEqual(["C", "A"]);
    });

    // Hiding a calendar is a real choice, and an unhide has to survive a reload
    // — so this list is taken from the file rather than merged.
    it("takes the hidden calendars from the stored file", () => {
        const result = reconcileWorkspacePreferences({
            previous: withColors({}, { hiddenCalendarPaths: ["Valorant"] }),
            loaded: withColors({}, { hiddenCalendarPaths: [] }),
            fileExisted: true,
        });

        expect(result.hiddenCalendarPaths).toEqual([]);
    });
});
