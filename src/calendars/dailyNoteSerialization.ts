import { HeadingCache } from "obsidian";
import { NeoEvent } from "../types";
import { listRegex } from "./dailyNoteParsing";

/**
 * Writing events back into a daily note as markdown list items (the mirror of
 * dailyNoteParsing; see docs/event-format-spec.md §4).
 */

/** `[key:: value]` pairs, joined by two spaces — part of the on-disk contract. */
const generateInlineAttributes = (attrs: Record<string, any>): string =>
    Object.entries(attrs)
        .map(([key, value]) => `[${key}:: ${value}]`)
        .join("  ");

/**
 * Render an event as a bullet.
 *
 * The title is the bullet's text and the date comes from the note itself, so
 * neither is emitted as an inline attribute — nor is `type`, which is always
 * "single" here. Empty values are omitted, and `allDay` only ever appears when
 * true.
 */
export const makeListItem = (
    event: NeoEvent,
    whitespacePrefix: string = ""
): string => {
    if (event.type !== "single") {
        throw new Error("Can only pass in single event.");
    }

    const { completed, title } = event;
    const checkbox =
        completed !== null && completed !== undefined
            ? `[${completed ? "x" : " "}]`
            : null;

    const attrs: Partial<NeoEvent> = { ...event };
    delete attrs.completed;
    delete attrs.title;
    delete attrs.type;
    delete attrs.date;
    // A bullet carries its data as `[key:: value]` pairs, which is a line of
    // text: it has room for a value, not for a list of steps each with a box of
    // its own — and a `]` inside one would end the pair early and corrupt the
    // line. So the steps of a task stay in the note-per-event format, where the
    // frontmatter can hold a list, and a daily note simply writes the event
    // without them rather than writing something it cannot read back.
    delete attrs.subtasks;

    for (const key of Object.keys(attrs) as (keyof NeoEvent)[]) {
        if (attrs[key] === undefined || attrs[key] === null) {
            delete attrs[key];
        }
    }
    if (!attrs.allDay) {
        delete attrs.allDay;
    }

    return `${whitespacePrefix}- ${
        checkbox || ""
    } ${title} ${generateInlineAttributes(attrs)}`;
};

/** Rewrite an existing bullet in place, preserving its indentation. */
export const modifyListItem = (
    line: string,
    event: NeoEvent
): string | null => {
    const match = line.match(listRegex);
    if (!match) {
        console.warn(
            "Tried modifying a list item with a position that wasn't a list item",
            { line }
        );
        return null;
    }
    return makeListItem(event, match[1]);
};

interface AddToHeadingArgs {
    heading: HeadingCache | undefined;
    item: NeoEvent;
    headingText: string;
}

/**
 * Insert a bullet directly under the given heading. If the heading isn't in the
 * note yet, append a new `## <headingText>` section at the end and put it there.
 */
export const addToHeading = (
    page: string,
    { heading, item, headingText }: AddToHeadingArgs
): { page: string; lineNumber: number } => {
    const lines = page.split("\n");
    const listItem = makeListItem(item);

    if (heading) {
        const lineNumber = heading.position.start.line + 1;
        lines.splice(lineNumber, 0, listItem);
        return { page: lines.join("\n"), lineNumber };
    }

    lines.push(`## ${headingText}`);
    lines.push(listItem);
    return { page: lines.join("\n"), lineNumber: lines.length - 1 };
};
