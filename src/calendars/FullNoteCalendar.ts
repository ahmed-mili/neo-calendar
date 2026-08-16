import { TFile, TFolder, parseYaml } from "obsidian";
import { rrulestr } from "rrule";
import { EventPathLocation } from "../core/EventStore";
import { ObsidianInterface } from "../ObsidianAdapter";
import {
    NeoEvent,
    EventLocation,
    validateEvent,
    KEYS_DROPPED_WHEN_ABSENT,
} from "../types";
import { EditableCalendar, EditableEventResponse } from "./EditableCalendar";

/**
 * A calendar where each event is its own note, with the event data living in
 * the note's YAML frontmatter (see docs/event-format-spec.md §3). The note body
 * is never touched — only the frontmatter block is read and rewritten.
 */

///
// Filenames
///

/**
 * The human-readable stem for an event's note. Purely cosmetic: the real title
 * always lives in frontmatter and is read back from there.
 */
function baseNameForEvent(event: NeoEvent): string {
    switch (event.type) {
        case undefined:
        case "single":
            return `${event.date} ${event.title}`;
        case "recurring":
            return `(Every ${event.daysOfWeek.join(",")}) ${event.title}`;
        case "rrule":
            return `(${rrulestr(event.rrule).toText()}) ${event.title}`;
        case "someday":
            return `(Someday) ${event.title}`;
    }
}

/**
 * Strip everything a file name may not contain. A title is free-form, so a "\"
 * or "/" in it must not become a path separator: that used to produce a phantom
 * path, the on-disk rename threw, the frontmatter rewrite never ran, and the
 * event silently desynced from its file.
 */
function sanitizeForFilename(name: string): string {
    const cleaned = name
        // Illegal on Windows: \ / : * ? " < > |
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        // Windows also forbids a trailing dot or space.
        .replace(/[. ]+$/, "");
    return cleaned || "Untitled";
}

const filenameForEvent = (event: NeoEvent): string =>
    `${sanitizeForFilename(baseNameForEvent(event))}.md`;

/**
 * The title an untitled event's file name is worth.
 *
 * A file name is not a title: it is a title with something we generated in
 * front of it — a date, a recurrence, "(Someday)". For an event that never had
 * a title, that prefix is the whole name, and using it as a fallback showed
 * the event's own type back at it. A calendar of undated tasks read
 * "(Someday)", "(Someday)", "(Someday)".
 *
 * So the prefix comes off first, and what is left is the title. Nothing left
 * means there never was one, and the interface says so in its own words rather
 * than in ours.
 */
export function titleFromBaseName(baseName: string, event: NeoEvent): string {
    const prefix = sanitizeForFilename(
        baseNameForEvent({ ...event, title: "" })
    );
    return prefix && baseName.startsWith(prefix)
        ? baseName.slice(prefix.length).trim()
        : baseName;
}

/** The given name if free, otherwise the first "name (n).md" that is. */
function findAvailablePath(
    app: ObsidianInterface,
    directory: string,
    filename: string
): string {
    const preferred = `${directory}/${filename}`;
    if (!app.getAbstractFileByPath(preferred)) {
        return preferred;
    }
    const stem = filename.replace(/\.md$/, "");
    let suffix = 1;
    while (app.getAbstractFileByPath(`${directory}/${stem} (${suffix}).md`)) {
        suffix++;
    }
    return `${directory}/${stem} (${suffix}).md`;
}

///
// Frontmatter block handling
///

const FENCE = "---";

/** Does the page open with a frontmatter block? */
function hasFrontmatter(page: string): boolean {
    return page.indexOf(FENCE) === 0 && page.slice(3).indexOf(FENCE) !== -1;
}

/** The raw frontmatter block (between the first two fences), if any. */
function extractFrontmatter(page: string): string | null {
    return hasFrontmatter(page) ? page.split(FENCE)[1] : null;
}

/** Everything after the frontmatter block — the note body, kept verbatim. */
function extractBody(page: string): string {
    return hasFrontmatter(page) ? page.split(FENCE).slice(2).join(FENCE) : page;
}

function withFrontmatter(page: string, frontmatter: string): string {
    return `${FENCE}\n${frontmatter}${FENCE}${extractBody(page)}`;
}

///
// YAML emission
//
// Deliberately hand-rolled rather than delegated to a YAML library: the exact
// byte output is part of the compatibility contract (arrays are comma-joined
// with no spaces, `null` is spelled out, and only whitespace-significant
// strings get quoted).
///

type PrintableAtom = Array<number | string> | number | string | boolean | null;

/**
 * Characters that end a value early INSIDE a list.
 *
 * A list is written inline — `[a,b]` — so an item carrying a bracket, a comma
 * or a colon closes the list where it stands and the line stops being YAML at
 * all. Nothing wrote such a value until tasks got their steps, each of which
 * begins with its own `[x]`; unquoted, the first one would take the whole note
 * down with it, because a note whose frontmatter will not parse is a note the
 * calendar cannot show.
 *
 * Only items are measured against this. A value on a line of its own has none
 * of that trouble, and quoting one would change bytes that other tools read.
 */
const UNSAFE_IN_LIST = /[[\]{},:#"'\n]/;

function stringifyYamlAtom(v: PrintableAtom, inList = false): string {
    if (v === null) {
        return "null";
    }
    if (Array.isArray(v)) {
        return `[${v.map((item) => stringifyYamlAtom(item, true)).join(",")}]`;
    }
    // Quote only when YAML would otherwise lose information: empty strings,
    // strings whose leading/trailing whitespace must survive a round-trip, and
    // list items that would otherwise break the list open.
    if (
        typeof v === "string" &&
        (v === "" || v !== v.trim() || (inList && UNSAFE_IN_LIST.test(v)))
    ) {
        // The line break is escaped, not carried: a quoted item holding a real
        // newline splits the inline list across two lines of frontmatter, which
        // is no more readable than the bracket this quoting exists to contain.
        // Free text reaches a list now that an occurrence can write its own
        // description, and free text has line breaks in it.
        return `"${v
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")}"`;
    }
    return `${v}`;
}

const stringifyYamlLine = (
    key: string | number | symbol,
    value: PrintableAtom
): string => `${String(key)}: ${stringifyYamlAtom(value)}`;

/** A complete frontmatter block for a brand-new note. */
function newFrontmatter(fields: Partial<NeoEvent>): string {
    const lines = Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => stringifyYamlLine(k, v));
    return `${FENCE}\n${lines.join("\n")}\n${FENCE}\n`;
}

/**
 * Keys the model takes away rather than leaves behind. Chiefly the ones owned
 * by exactly one event `type`: on a type change the new event does not carry
 * the previous type's keys, and leaving them would produce self-contradictory
 * frontmatter (e.g. `date:` sitting next to `type: rrule`). `subtasks` is there
 * for the same reason on its own scale — the last step deleted must take the
 * line with it. Sourced from the schema so model and UI cannot drift.
 */
const DROPPED_WHEN_ABSENT = new Set<string>(KEYS_DROPPED_WHEN_ABSENT);

/**
 * Rewrite a note's frontmatter to match `event`, preserving the order of the
 * lines already there, any keys the plugin does not own, and the note body.
 */
export function modifyFrontmatterString(
    page: string,
    event: Partial<NeoEvent>
): string {
    const existing = extractFrontmatter(page)?.split("\n");

    // No frontmatter yet: emit every field and push the old page down.
    if (!existing) {
        const lines = Object.entries(event)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => stringifyYamlLine(k, v));
        return withFrontmatter("\n" + page, lines.join("\n") + "\n");
    }

    const lines: string[] = [];
    const handled = new Set<string | number | symbol>();

    for (const line of existing) {
        const parsed: Record<string, any> | null = parseYaml(line);
        if (!parsed) {
            continue;
        }
        const keys = Object.keys(parsed) as [keyof NeoEvent];
        if (keys.length !== 1) {
            throw new Error("One YAML line parsed to multiple keys.");
        }
        const key = keys[0];
        const keyName = key as string;
        handled.add(key);

        // An all-day event has no times: drop any startTime/endTime a previously
        // timed version left behind. Without this the merge would keep the stale
        // line (undefined means "leave alone"), yielding `allDay: true` next to
        // times that no longer apply.
        if (
            event.allDay === true &&
            (keyName === "startTime" || keyName === "endTime")
        ) {
            continue;
        }

        const value: PrintableAtom | undefined = event[key];
        if (value !== undefined) {
            lines.push(stringifyYamlLine(key, value));
        } else if (DROPPED_WHEN_ABSENT.has(keyName)) {
            // The event no longer carries this key — the type changed, or the
            // list it held was emptied. Either way the line goes with it.
            continue;
        } else {
            // A key we don't own — leave it exactly as it was.
            lines.push(line);
        }
    }

    // Anything on the event that wasn't already a line gets appended, in the
    // event's own key order.
    for (const key of Object.keys(event) as (keyof NeoEvent)[]) {
        if (handled.has(key) || event[key] === undefined) {
            continue;
        }
        lines.push(stringifyYamlLine(key, event[key] as PrintableAtom));
    }

    return withFrontmatter(page, lines.join("\n") + "\n");
}

///
// The calendar
///

export default class FullNoteCalendar extends EditableCalendar {
    app: ObsidianInterface;
    private _directory: string;

    constructor(app: ObsidianInterface, color: string, directory: string) {
        super(color);
        this.app = app;
        this._directory = directory;
    }

    get directory(): string {
        return this._directory;
    }

    get type(): "local" {
        return "local";
    }

    get identifier(): string {
        return this.directory;
    }

    get name(): string {
        const lastSlash = this.directory.lastIndexOf("/");
        return lastSlash === -1
            ? this.directory
            : this.directory.slice(lastSlash + 1);
    }

    async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
        const event = validateEvent(this.app.getMetadata(file)?.frontmatter);
        if (!event) {
            return [];
        }
        // An untitled event falls back to its file name — minus the part of
        // that name we generated ourselves.
        if (!event.title) {
            event.title = titleFromBaseName(file.basename, event);
        }
        return [[event, { file, lineNumber: undefined }]];
    }

    async getEvents(): Promise<EditableEventResponse[]> {
        const folder = this.app.getAbstractFileByPath(this.directory);
        if (!folder) {
            throw new Error(`Cannot get folder ${this.directory}`);
        }
        if (!(folder instanceof TFolder)) {
            throw new Error(`${folder} is not a directory.`);
        }
        const events: EditableEventResponse[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile) {
                events.push(...(await this.getEventsInFile(child)));
            }
        }
        return events;
    }

    async createEvent(event: NeoEvent): Promise<EventLocation> {
        const path = findAvailablePath(
            this.app,
            this.directory,
            filenameForEvent(event)
        );
        const file = await this.app.create(path, newFrontmatter(event));
        return { file, lineNumber: undefined };
    }

    /**
     * Where the note for `event` should live, given where it currently is. The
     * file name encodes the date and title, so editing either implies a rename.
     */
    getNewLocation(
        location: EventPathLocation,
        event: NeoEvent
    ): EventLocation {
        const { path, lineNumber } = location;
        if (lineNumber !== undefined) {
            throw new Error("Note calendar cannot handle inline events.");
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(
                `File ${path} either doesn't exist or is a folder.`
            );
        }

        const desiredPath = `${file.parent.path}/${filenameForEvent(event)}`;
        if (desiredPath === path) {
            return { file: { path }, lineNumber: undefined };
        }
        // Another note already sits there — pick the next free name instead.
        const occupant = this.app.getAbstractFileByPath(desiredPath);
        if (occupant && occupant.path !== path) {
            return {
                file: {
                    path: findAvailablePath(
                        this.app,
                        file.parent.path,
                        filenameForEvent(event)
                    ),
                },
                lineNumber: undefined,
            };
        }
        return { file: { path: desiredPath }, lineNumber: undefined };
    }

    async modifyEvent(
        location: EventPathLocation,
        event: NeoEvent,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        let file = this.app.getFileByPath(location.path);

        // A concurrent auto-save may already have renamed the note out from
        // under us; fall back to looking it up by the name this event implies.
        if (!file) {
            file = this.app.getFileByPath(
                `${this._directory}/${filenameForEvent(event)}`
            );
        }
        if (!file) {
            throw new Error(
                `File ${location.path} either doesn't exist or is a folder.`
            );
        }

        const newLocation = this.getNewLocation(
            { path: file.path, lineNumber: location.lineNumber },
            event
        );

        // Tell the cache where the event lands before touching the disk, so the
        // view never points at a path that no longer exists.
        updateCacheWithLocation(newLocation);

        if (file.path !== newLocation.file.path) {
            await this.app.rename(file, newLocation.file.path);
        }
        await this.app.rewrite(file, (page) =>
            modifyFrontmatterString(page, event)
        );
    }

    async move(
        fromLocation: EventPathLocation,
        toCalendar: EditableCalendar,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        const { path, lineNumber } = fromLocation;
        if (lineNumber !== undefined) {
            throw new Error("Note calendar cannot handle inline events.");
        }
        if (!(toCalendar instanceof FullNoteCalendar)) {
            throw new Error(
                `Event cannot be moved to a note calendar from a calendar of type ${toCalendar.type}.`
            );
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File ${path} not found.`);
        }
        const newPath = `${toCalendar.directory}/${file.name}`;
        updateCacheWithLocation({
            file: { path: newPath },
            lineNumber: undefined,
        });
        await this.app.rename(file, newPath);
    }

    async deleteEvent({ path, lineNumber }: EventPathLocation): Promise<void> {
        if (lineNumber !== undefined) {
            throw new Error("Note calendar cannot handle inline events.");
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File ${path} not found.`);
        }
        await this.app.delete(file);
    }
}
