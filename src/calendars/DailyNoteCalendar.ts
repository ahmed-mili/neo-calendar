import moment from "moment";
import { TFile } from "obsidian";
import {
    appHasDailyNotesPluginLoaded,
    createDailyNote,
    getAllDailyNotes,
    getDailyNote,
    getDailyNoteSettings,
    getDateFromFile,
} from "obsidian-daily-notes-interface";
import { EventPathLocation } from "../core/EventStore";
import { ObsidianInterface } from "../ObsidianAdapter";
import { NeoEvent, EventLocation, CalendarInfo } from "../types";
import { EventResponse } from "./Calendar";
import { EditableCalendar, EditableEventResponse } from "./EditableCalendar";
import {
    getAllInlineEventsFromFile,
    getListsUnderHeading,
} from "./dailyNoteParsing";
import { addToHeading, modifyListItem } from "./dailyNoteSerialization";

// Re-exported for tests and external consumers.
export { getInlineAttributes } from "./dailyNoteParsing";

const DATE_FORMAT = "YYYY-MM-DD";

/**
 * A calendar whose events are list items under a heading in the vault's daily
 * notes. The note's own date supplies the event's date, so only same-day,
 * non-recurring events can live here.
 */
export default class DailyNoteCalendar extends EditableCalendar {
    app: ObsidianInterface;
    heading: string;

    constructor(app: ObsidianInterface, color: string, heading: string) {
        super(color);
        appHasDailyNotesPluginLoaded();
        this.app = app;
        this.heading = heading;
    }

    get type(): CalendarInfo["type"] {
        return "dailynote";
    }

    get identifier(): string {
        return this.heading;
    }

    get name(): string {
        return `Daily note under "${this.heading}"`;
    }

    get directory(): string {
        const { folder } = getDailyNoteSettings();
        if (!folder) {
            throw new Error("Could not load daily note settings.");
        }
        return folder;
    }

    async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
        // @ts-ignore
        const date = getDateFromFile(file, "day")?.format(DATE_FORMAT);
        if (!date) {
            return [];
        }
        const metadata = this.app.getMetadata(file);
        if (!metadata) {
            return [];
        }

        const listItems = getListsUnderHeading(this.heading, metadata);
        const inlineEvents = await this.app.process(file, (contents) =>
            getAllInlineEventsFromFile(contents, listItems, { date })
        );
        return inlineEvents.map(({ event, lineNumber }) => [
            event,
            { file, lineNumber },
        ]);
    }

    async getEvents(): Promise<EventResponse[]> {
        const files = Object.values(getAllDailyNotes()) as TFile[];
        return (
            await Promise.all(files.map((file) => this.getEventsInFile(file)))
        ).flat();
    }

    async createEvent(event: NeoEvent): Promise<EventLocation> {
        if (event.type !== "single" && event.type !== undefined) {
            console.debug(
                "tried creating a recurring event in a daily note",
                event
            );
            throw new Error("Cannot create a recurring event in a daily note.");
        }

        const file = await this.ensureDailyNote(event.date);
        const metadata = await this.app.waitForMetadata(file);
        const heading = metadata.headings?.find(
            (h) => h.heading === this.heading
        );
        if (!heading) {
            throw new Error(
                `Could not find heading ${this.heading} in daily note ${file.path}.`
            );
        }

        const lineNumber = await this.app.rewrite(file, (contents) => {
            const { page, lineNumber } = addToHeading(contents, {
                heading,
                item: event,
                headingText: this.heading,
            });
            return [page, lineNumber] as [string, number];
        });
        return { file, lineNumber };
    }

    /** The daily note for a date, creating it if the vault doesn't have one yet. */
    private async ensureDailyNote(date: string): Promise<TFile> {
        const day = moment(date);
        const existing = getDailyNote(day, getAllDailyNotes()) as TFile;
        return existing ?? ((await createDailyNote(day)) as TFile);
    }

    /** Resolve a stored location to a live file and the line its bullet is on. */
    private getConcreteLocation({ path, lineNumber }: EventPathLocation): {
        file: TFile;
        lineNumber: number;
    } {
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File not found at path: ${path}`);
        }
        if (lineNumber === undefined) {
            throw new Error(`Daily note events must have a line number.`);
        }
        return { file, lineNumber };
    }

    async deleteEvent(location: EventPathLocation): Promise<void> {
        const { file, lineNumber } = this.getConcreteLocation(location);
        await this.app.rewrite(file, (contents) => {
            const lines = contents.split("\n");
            lines.splice(lineNumber, 1);
            return lines.join("\n");
        });
    }

    async modifyEvent(
        location: EventPathLocation,
        event: NeoEvent,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        if (event.type !== "single" && event.type !== undefined) {
            throw new Error(
                "Recurring events in daily notes are not supported."
            );
        }
        if (event.endDate) {
            throw new Error(
                "Multi-day events are not supported in daily notes."
            );
        }

        const { file, lineNumber } = this.getConcreteLocation(location);
        const oldDate = getDateFromFile(file as any, "day")?.format(
            DATE_FORMAT
        );
        if (!oldDate) {
            throw new Error(
                `Could not get date from file at path ${file.path}`
            );
        }

        // The note IS the date: changing an event's date means moving its bullet
        // to another note entirely.
        if (event.date !== oldDate) {
            await this.moveEventToNewDate(
                file,
                lineNumber,
                event,
                updateCacheWithLocation
            );
            return;
        }

        updateCacheWithLocation({ file, lineNumber });
        await this.app.rewrite(file, (contents) => {
            const lines = contents.split("\n");
            const newLine = modifyListItem(lines[lineNumber], event);
            if (!newLine) {
                throw new Error("Did not successfully update line.");
            }
            lines[lineNumber] = newLine;
            return lines.join("\n");
        });
    }

    /** Cut the bullet from its old daily note and add it to the new date's. */
    private async moveEventToNewDate(
        oldFile: TFile,
        oldLineNumber: number,
        event: NeoEvent & { type: "single" | undefined; date: string },
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        const newFile = await this.ensureDailyNote(event.date);
        await this.app.read(newFile);

        const metadata = this.app.getMetadata(newFile);
        if (!metadata) {
            throw new Error("No metadata for file " + oldFile.path);
        }
        const heading = metadata.headings?.find(
            (h) => h.heading === this.heading
        );
        if (!heading) {
            throw new Error(
                `Could not find heading ${this.heading} in daily note ${oldFile.path}.`
            );
        }

        await this.app.rewrite(oldFile, async (oldContents) => {
            const lines = oldContents.split("\n");
            lines.splice(oldLineNumber, 1);

            // Insert into the destination note before committing the removal, so
            // a failure there can't lose the event.
            await this.app.rewrite(newFile, (newContents) => {
                const { page, lineNumber } = addToHeading(newContents, {
                    heading,
                    item: event,
                    headingText: this.heading,
                });
                updateCacheWithLocation({ file: newFile, lineNumber });
                return page;
            });

            return lines.join("\n");
        });
    }

    move(
        _from: EventPathLocation,
        _to: EditableCalendar
    ): Promise<EventLocation> {
        throw new Error("Method not implemented.");
    }
}
