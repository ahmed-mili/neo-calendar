import { TFile, TFolder, parseYaml } from "obsidian";
import { rrulestr } from "rrule";
import { EventPathLocation } from "../core/EventStore";
import { ObsidianInterface } from "../ObsidianAdapter";
import {
    NeoEvent,
    EventLocation,
    validateEvent,
    TYPE_DISCRIMINANT_KEYS,
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

function stringifyYamlAtom(v: PrintableAtom): string {
    if (v === null) {
        return "null";
    }
    if (Array.isArray(v)) {
        return `[${v.map(stringifyYamlAtom).join(",")}]`;
    }
    // Quote only when YAML would otherwise lose information: empty strings and
    // strings whose leading/trailing whitespace must survive a round-trip.
    if (typeof v === "string" && (v === "" || v !== v.trim())) {
        return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
 * Keys owned by exactly one event `type`. On a type change the new event does
 * not carry the previous type's keys, so their lines must be DROPPED — leaving
 * them would produce self-contradictory frontmatter (e.g. `date:` sitting next
 * to `type: rrule`). Sourced from the schema so model and UI cannot drift.
 */
const TYPE_EXCLUSIVE_KEYS = new Set<string>(TYPE_DISCRIMINANT_KEYS);

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
        } else if (TYPE_EXCLUSIVE_KEYS.has(keyName)) {
            // The type changed and this key is no longer part of the event.
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
        // An untitled event falls back to its file name.
        if (!event.title) {
            event.title = file.basename;
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
