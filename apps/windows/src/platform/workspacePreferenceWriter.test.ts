import { createWorkspacePreferenceWriter } from "./workspacePreferenceWriter";

interface Preferences {
    colors: Record<string, string>;
    sidebarVisible: boolean;
}

const defaults: Preferences = { colors: {}, sidebarVisible: true };
const stored: Preferences = {
    colors: { Work: "#ff0000" },
    sidebarVisible: false,
};

function writerSpy() {
    const writes: Preferences[] = [];
    return {
        writes,
        write: async (value: Preferences) => {
            writes.push(value);
        },
    };
}

describe("workspace preference writer", () => {
    it("never writes before the stored preferences have been read", async () => {
        const spy = writerSpy();
        const writer = createWorkspacePreferenceWriter(defaults, spy.write);

        const optimistic = await writer.mutate((current) => ({
            ...current,
            sidebarVisible: !current.sidebarVisible,
        }));

        expect(spy.writes).toHaveLength(0);
        expect(optimistic.sidebarVisible).toBe(false);
        expect(writer.isLoaded()).toBe(false);
    });

    it("replays pending changes on top of the stored preferences", async () => {
        const spy = writerSpy();
        const writer = createWorkspacePreferenceWriter(defaults, spy.write);

        await writer.mutate((current) => ({
            ...current,
            sidebarVisible: true,
        }));
        const adopted = await writer.adopt(stored);

        expect(adopted).toEqual({
            colors: { Work: "#ff0000" },
            sidebarVisible: true,
        });
        expect(spy.writes).toEqual([adopted]);
        expect(writer.current()).toEqual(adopted);
    });

    it("keeps the file untouched when nothing was changed while loading", async () => {
        const spy = writerSpy();
        const writer = createWorkspacePreferenceWriter(defaults, spy.write);

        const adopted = await writer.adopt(stored);

        expect(adopted).toEqual(stored);
        expect(spy.writes).toHaveLength(0);
    });

    it("writes later changes on top of the loaded preferences", async () => {
        const spy = writerSpy();
        const writer = createWorkspacePreferenceWriter(defaults, spy.write);
        await writer.adopt(stored);

        const next = await writer.mutate((current) => ({
            ...current,
            sidebarVisible: true,
        }));

        expect(next).toEqual({
            colors: { Work: "#ff0000" },
            sidebarVisible: true,
        });
        expect(spy.writes).toEqual([next]);
    });

    it("chains changes from the latest value instead of a stale snapshot", async () => {
        const spy = writerSpy();
        const writer = createWorkspacePreferenceWriter(defaults, spy.write);
        await writer.adopt(stored);

        await writer.mutate((current) => ({
            ...current,
            colors: { ...current.colors, Home: "#00ff00" },
        }));
        const next = await writer.mutate((current) => ({
            ...current,
            colors: { ...current.colors, Trips: "#0000ff" },
        }));

        expect(next.colors).toEqual({
            Work: "#ff0000",
            Home: "#00ff00",
            Trips: "#0000ff",
        });
    });

    it("blocks writes again after the data folder changed", async () => {
        const spy = writerSpy();
        const writer = createWorkspacePreferenceWriter(defaults, spy.write);
        await writer.adopt(stored);

        writer.reset();
        await writer.mutate((current) => ({
            ...current,
            sidebarVisible: true,
        }));

        expect(writer.isLoaded()).toBe(false);
        expect(spy.writes).toHaveLength(0);
    });

    it("reports write failures instead of swallowing them", async () => {
        const writer = createWorkspacePreferenceWriter(defaults, async () => {
            throw new Error("disk full");
        });
        await writer.adopt(stored);

        await expect(
            writer.mutate((current) => ({ ...current, sidebarVisible: true }))
        ).rejects.toThrow("disk full");
        expect(writer.current().sidebarVisible).toBe(true);
    });
});
