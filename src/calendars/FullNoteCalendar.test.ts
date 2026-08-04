import { TFile } from "obsidian";

import { ObsidianInterface } from "src/ObsidianAdapter";
import { MockApp, MockAppBuilder } from "../../test_helpers/AppBuilder";
import { FileBuilder } from "../../test_helpers/FileBuilder";
import { NeoEvent } from "src/types";
import { parseEvent } from "../types/schema";
import FullNoteCalendar from "./FullNoteCalendar";

/**
 * One note per event, the event in its frontmatter.
 *
 * The exact bytes of that frontmatter are pinned in
 * src/compat/fullCalendarFormat.test.ts; here we exercise the calendar itself —
 * how it finds, names, renames and rewrites the notes.
 */

const DIRECTORY = "events";
const COLOR = "#BADA55";

/** Reads come from the mock vault; writes are spies we can inspect. */
const makeObsidian = (app: MockApp): ObsidianInterface => ({
    getAbstractFileByPath: (path) => app.vault.getAbstractFileByPath(path),
    getFileByPath: (path) => {
        const file = app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    },
    getMetadata: (file) => app.metadataCache.getFileCache(file),
    waitForMetadata: async (file) => app.metadataCache.getFileCache(file)!,
    read: (file) => app.vault.read(file),
    create: jest.fn(),
    rewrite: jest.fn(),
    rename: jest.fn(),
    delete: jest.fn(),
    process: jest.fn(),
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
});

/** A calendar over a folder holding the given notes. */
const withNotes = (notes: { filename: string; event: Partial<NeoEvent> }[]) => {
    const folder = notes.reduce(
        (builder, { filename, event }) =>
            builder.file(filename, new FileBuilder().frontmatter(event)),
        new MockAppBuilder(DIRECTORY)
    );
    const obsidian = makeObsidian(MockAppBuilder.make().folder(folder).done());
    return {
        obsidian,
        calendar: new FullNoteCalendar(obsidian, COLOR, DIRECTORY),
    };
};

const createdBy = (obsidian: ObsidianInterface): [string, string] =>
    (obsidian.create as jest.Mock).mock.calls[0];

const rewrittenBy = (obsidian: ObsidianInterface) =>
    (obsidian.rewrite as jest.Mock).mock.calls[0];

const assertRejects = (fn: () => Promise<any>, message: RegExp) =>
    expect(fn()).rejects.toThrow(message);

describe("identity", () => {
    it("names itself after the last segment of its folder", () => {
        const { calendar } = withNotes([]);
        expect(calendar.type).toBe("local");
        expect(calendar.identifier).toBe(DIRECTORY);
        expect(calendar.name).toBe(DIRECTORY);

        const obsidian = makeObsidian(MockAppBuilder.make().done());
        expect(
            new FullNoteCalendar(obsidian, COLOR, "a/b/Deadlines").name
        ).toBe("Deadlines");
    });
});

describe("reading events", () => {
    const notes = [
        {
            filename: "2022-01-01 Test Event.md",
            event: {
                title: "Test Event",
                allDay: true,
                date: "2022-01-01",
            } as Partial<NeoEvent>,
        },
        {
            filename: "2022-01-01 Another Test Event.md",
            event: {
                title: "Another Test Event",
                date: "2022-01-01",
                startTime: "11:00",
                endTime: "12:00",
            } as Partial<NeoEvent>,
        },
    ];

    it("reads one event per note in the folder", async () => {
        const { calendar } = withNotes(notes);

        const found = await calendar.getEvents();

        expect(found).toHaveLength(2);
        // A whole-note event is never inline, so it carries no line number.
        expect(found.every(([, loc]) => loc.lineNumber === undefined)).toBe(
            true
        );
        expect(found.map(([, loc]) => loc.file.path).sort()).toEqual(
            notes.map((n) => `${DIRECTORY}/${n.filename}`).sort()
        );
        // Events come back normalized, defaults filled in.
        for (const note of notes) {
            expect(found.map(([event]) => event)).toContainEqual(
                parseEvent(note.event)
            );
        }
    });

    it("reads the same event whether asked for the folder or the file", async () => {
        const { obsidian, calendar } = withNotes(notes);

        const [[event, { file }]] = await calendar.getEvents();
        const fromFile = await calendar.getEventsInFile(
            obsidian.getFileByPath(file.path)!
        );

        expect(fromFile).toHaveLength(1);
        expect(fromFile[0][0]).toEqual(event);
    });

    it("falls back to the file name for an untitled event", async () => {
        const { obsidian, calendar } = withNotes([
            {
                filename: "2022-01-01 Fallback.md",
                event: { title: "", allDay: true, date: "2022-01-01" },
            },
        ]);

        const file = obsidian.getFileByPath(
            `${DIRECTORY}/2022-01-01 Fallback.md`
        )!;
        const [[event]] = await calendar.getEventsInFile(file);

        expect(event.title).toBe("2022-01-01 Fallback");
    });
});

describe("creating events", () => {
    it("names the note after the event's date and title", async () => {
        const obsidian = makeObsidian(MockAppBuilder.make().done());
        const calendar = new FullNoteCalendar(obsidian, COLOR, DIRECTORY);

        (obsidian.create as jest.Mock).mockResolvedValue({
            path: `${DIRECTORY}/2022-01-01 Test Event.md`,
        });
        const { lineNumber } = await calendar.createEvent(
            parseEvent({
                title: "Test Event",
                date: "2022-01-01",
                startTime: "11:00",
                endTime: "12:30",
            })
        );

        expect(lineNumber).toBeUndefined();
        const [path, contents] = createdBy(obsidian);
        expect(path).toBe(`${DIRECTORY}/2022-01-01 Test Event.md`);
        expect(contents).toBe(
            [
                "---",
                "title: Test Event",
                "allDay: false",
                "startTime: 11:00",
                "endTime: 12:30",
                "type: single",
                "date: 2022-01-01",
                "endDate: null",
                "---",
                "",
            ].join("\n")
        );
    });

    it("keeps path characters out of the file name, and the title in frontmatter", async () => {
        // A "\" or "/" in a title must not become a path separator: that used to
        // produce a phantom path, and the event silently lost its file.
        const obsidian = makeObsidian(MockAppBuilder.make().done());
        const calendar = new FullNoteCalendar(obsidian, COLOR, DIRECTORY);

        (obsidian.create as jest.Mock).mockResolvedValue({ path: "whatever" });
        await calendar.createEvent(
            parseEvent({
                title: "dev\\obsidian/neo:calendar",
                date: "2022-01-01",
                startTime: "11:00",
                endTime: "12:30",
            })
        );

        const [path, contents] = createdBy(obsidian);
        expect(path).toBe(
            `${DIRECTORY}/2022-01-01 dev-obsidian-neo-calendar.md`
        );
        expect(path.slice(DIRECTORY.length + 1)).not.toMatch(/[\\/:*?"<>|]/);
        expect(contents).toContain("dev\\obsidian/neo:calendar");
    });

    it("picks the next free name when one is taken", async () => {
        const event = {
            title: "Test Event",
            allDay: true,
            date: "2022-01-01",
        };
        const { obsidian, calendar } = withNotes([
            { filename: "2022-01-01 Test Event.md", event },
        ]);

        (obsidian.create as jest.Mock).mockResolvedValue({
            path: `${DIRECTORY}/2022-01-01 Test Event (1).md`,
        });
        const location = await calendar.createEvent(parseEvent(event));

        expect(location.file.path).toBe(
            `${DIRECTORY}/2022-01-01 Test Event (1).md`
        );
        expect(createdBy(obsidian)[0]).toBe(
            `${DIRECTORY}/2022-01-01 Test Event (1).md`
        );
    });
});

describe("modifying events", () => {
    const filename = "2022-01-01 Test Event.md";
    const path = `${DIRECTORY}/${filename}`;
    const event = parseEvent({
        title: "Test Event",
        allDay: false,
        date: "2022-01-01",
        startTime: "11:00",
        endTime: "12:30",
    });

    const openCalendar = () => withNotes([{ filename, event }]);

    it("rewrites the note in place when its name doesn't change", async () => {
        const { obsidian, calendar } = openCalendar();
        const before = await obsidian.read(obsidian.getFileByPath(path)!);
        const relocate = jest.fn();

        await calendar.modifyEvent(
            { path, lineNumber: undefined },
            parseEvent({
                title: "Test Event",
                allDay: false,
                date: "2022-01-01",
                startTime: "11:00",
                endTime: "13:30",
            }),
            relocate
        );

        // The cache learns where the event lands before the disk is touched.
        expect(relocate.mock.calls[0][0]).toEqual({
            file: { path },
            lineNumber: undefined,
        });
        expect(obsidian.rename).not.toHaveBeenCalled();

        const [file, rewrite] = rewrittenBy(obsidian);
        expect(file.path).toBe(path);
        expect(rewrite(before)).toContain("endTime: 13:30");
        expect(rewrite(before)).toContain("startTime: 11:00");
    });

    it("drops the times when the event becomes all-day", async () => {
        const { obsidian, calendar } = openCalendar();
        const before = await obsidian.read(obsidian.getFileByPath(path)!);

        await calendar.modifyEvent(
            { path, lineNumber: undefined },
            parseEvent({
                title: "Test Event",
                allDay: true,
                date: "2022-01-01",
            }),
            jest.fn()
        );

        const rewritten = rewrittenBy(obsidian)[1](before);
        expect(rewritten).toContain("allDay: true");
        expect(rewritten).not.toContain("startTime");
        expect(rewritten).not.toContain("endTime");
    });

    it("refuses an inline location", async () => {
        const { calendar } = openCalendar();
        await assertRejects(
            () =>
                calendar.modifyEvent({ path, lineNumber: 3 }, event, jest.fn()),
            /cannot handle inline events/i
        );
    });
});

describe("deleting events", () => {
    it("deletes the note the event lives in", async () => {
        const filename = "2022-01-01 Test Event.md";
        const path = `${DIRECTORY}/${filename}`;
        const { obsidian, calendar } = withNotes([
            {
                filename,
                event: {
                    title: "Test Event",
                    allDay: true,
                    date: "2022-01-01",
                },
            },
        ]);

        await calendar.deleteEvent({ path, lineNumber: undefined });

        expect((obsidian.delete as jest.Mock).mock.calls[0][0].path).toBe(path);
    });

    it("refuses an inline location", async () => {
        const { calendar } = withNotes([]);
        await assertRejects(
            () => calendar.deleteEvent({ path: "x.md", lineNumber: 0 }),
            /cannot handle inline events/i
        );
    });
});
