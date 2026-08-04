import { CachedMetadata, ListItemCache, Loc, Pos } from "obsidian";
import { NeoEvent, validateEvent } from "../types";

/**
 * Reading events out of a daily note. Events are markdown list items sitting
 * under a heading, carrying their data as Dataview-style inline attributes
 * (see docs/event-format-spec.md §4).
 */

/** `[key:: value]` — the space after `::` is optional. */
export const fieldRegex = /\[([^\]]+):: ?([^\]]+)\]/g;

/**
 * A list item, capturing its indentation and optional checkbox.
 * e.g. "  - [x] task" -> ["  ", "[x] ", "x"]
 */
export const listRegex = /^(\s*)\-\s+(\[(.)\]\s+)?/;

/** A checkbox list item, capturing the single character between the brackets. */
const checkboxRegex = /^\s*\-\s+\[(.)\]\s+/;

/** Inline attribute values are strings, except for the two boolean literals. */
const parseAttributeValue = (raw: string): boolean | string =>
    raw === "true" ? true : raw === "false" ? false : raw;

/** Every `[key:: value]` pair on a line, as an object. */
export function getInlineAttributes(
    line: string
): Record<string, string | boolean> {
    return Object.fromEntries(
        Array.from(line.matchAll(fieldRegex)).map((match) => [
            match[1],
            parseAttributeValue(match[2]),
        ])
    );
}

/**
 * The `completed` value a line's checkbox implies:
 *   - no checkbox at all -> `null`
 *   - `[ ]`, or the in-progress markers `[/]` / `[~]` -> `false`
 *   - any other character (`[x]`, …) -> that character, meaning done
 */
export const checkboxTodo = (line: string): boolean | string | null => {
    const match = line.match(checkboxRegex);
    if (!match || !match[1]) {
        return null;
    }
    const mark = match[1];
    if (mark === " " || mark === "/" || mark === "~") {
        return false;
    }
    return mark;
};

/**
 * The span of a heading's section: from the end of the heading line to the
 * start of the next heading at the same level or above (or the end of the doc).
 */
export const getHeadingPosition = (
    headingText: string,
    metadata: CachedMetadata,
    endOfDoc: Loc
): Pos | null => {
    if (!metadata.headings) {
        return null;
    }

    let level: number | null = null;
    let start: Pos | null = null;
    let end: Pos | null = null;

    for (const heading of metadata.headings) {
        if (!level && heading.heading === headingText) {
            level = heading.level;
            start = heading.position;
        } else if (level && heading.level <= level) {
            end = heading.position;
            break;
        }
    }

    if (!level || !start) {
        return null;
    }
    return { start: start.end, end: end?.start || endOfDoc };
};

/** Every list item nested under the given heading. */
export const getListsUnderHeading = (
    headingText: string,
    metadata: CachedMetadata
): ListItemCache[] => {
    if (!metadata.listItems) {
        return [];
    }
    const endOfDoc = metadata.sections?.last()?.position.end;
    if (!endOfDoc) {
        return [];
    }
    const section = getHeadingPosition(headingText, metadata, endOfDoc);
    if (!section) {
        return [];
    }
    return metadata.listItems.filter(
        (item) =>
            section.start.offset < item.position.start.offset &&
            item.position.end.offset <= section.end.offset
    );
};

/**
 * Parse one bullet into an event. The line's inline attributes win over the
 * file-level defaults (the note's date, chiefly); the title is whatever text
 * remains once the list marker and the attributes are stripped. A line with no
 * inline attributes is not an event.
 */
export const getInlineEventFromLine = (
    line: string,
    globalAttrs: Partial<NeoEvent>
): NeoEvent | null => {
    const attrs = getInlineAttributes(line);
    if (Object.keys(attrs).length === 0) {
        return null;
    }
    return validateEvent({
        title: line.replace(listRegex, "").replace(fieldRegex, "").trim(),
        completed: checkboxTodo(line),
        ...globalAttrs,
        ...attrs,
    });
};

/** Parse every list item of a daily note into events, with their line numbers. */
export function getAllInlineEventsFromFile(
    fileText: string,
    listItems: ListItemCache[],
    fileGlobalAttrs: Partial<NeoEvent>
): { lineNumber: number; event: NeoEvent }[] {
    const lines = fileText.split("\n");
    return listItems.flatMap((item) => {
        const lineNumber = item.position.start.line;
        const event = getInlineEventFromLine(lines[lineNumber], {
            ...fileGlobalAttrs,
            type: "single",
        });
        return event ? [{ event, lineNumber }] : [];
    });
}
