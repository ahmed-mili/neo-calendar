import { rrulestr } from "rrule";
import {
    NeoEvent,
    TYPE_DISCRIMINANT_KEYS,
    validateEvent,
} from "../../../../src/types";
import type { DesktopEventFileDto } from "./desktopCalendarStore";

export interface DesktopStoredEvent {
    id: string;
    calendarId: string;
    calendarPath: string;
    relativePath: string;
    fileName: string;
    contents: string;
    event: NeoEvent;
    readOnly?: boolean;
}

const TYPE_EXCLUSIVE_KEYS = new Set<string>(TYPE_DISCRIMINANT_KEYS);

function unquote(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        if (value.startsWith('"')) {
            try {
                return JSON.parse(value) as string;
            } catch {
                return value.slice(1, -1);
            }
        }
        return value.slice(1, -1).replace(/''/g, "'");
    }
    return value;
}

function splitYamlArray(value: string): string[] {
    const result: string[] = [];
    let current = "";
    let quote: string | null = null;
    let escaped = false;

    for (const character of value) {
        if (escaped) {
            current += character;
            escaped = false;
            continue;
        }
        if (character === "\\" && quote === '"') {
            current += character;
            escaped = true;
            continue;
        }
        if ((character === '"' || character === "'") && !quote) {
            quote = character;
            current += character;
            continue;
        }
        if (character === quote) {
            quote = null;
            current += character;
            continue;
        }
        if (character === "," && !quote) {
            result.push(current.trim());
            current = "";
            continue;
        }
        current += character;
    }
    if (current.trim()) result.push(current.trim());
    return result;
}

function parseTextScalar(value: string): string {
    const withoutSeparator = value.startsWith(" ")
        ? value.slice(1)
        : value;

    if (
        withoutSeparator.startsWith('"') &&
        withoutSeparator.endsWith('"')
    ) {
        try {
            const parsed = JSON.parse(withoutSeparator) as unknown;
            return typeof parsed === "string"
                ? parsed
                : withoutSeparator;
        } catch {
            return withoutSeparator;
        }
    }

    if (
        withoutSeparator.startsWith("'") &&
        withoutSeparator.endsWith("'")
    ) {
        return withoutSeparator
            .slice(1, -1)
            .replace(/''/g, "'");
    }

    return withoutSeparator;
}

function parseYamlValue(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed === "null" || trimmed === "~") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        const inner = trimmed.slice(1, -1).trim();
        return inner
            ? splitYamlArray(inner).map((item) => parseYamlValue(item))
            : [];
    }
    return unquote(trimmed);
}

export interface FrontmatterDocument {
    lines: string[];
    body: string;
}

export function extractFrontmatter(contents: string): FrontmatterDocument | null {
    const normalized = contents.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) return null;

    const lines = normalized.split("\n");
    let closing = -1;
    for (let index = 1; index < lines.length; index += 1) {
        if (lines[index].trim() === "---") {
            closing = index;
            break;
        }
    }
    if (closing === -1) return null;

    return {
        lines: lines.slice(1, closing),
        body: lines.slice(closing + 1).join("\n"),
    };
}

export function parseFrontmatter(
    contents: string
): Record<string, unknown> | null {
    const document = extractFrontmatter(contents);
    if (!document) return null;

    const result: Record<string, unknown> = {};
    for (const rawLine of document.lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const colon = rawLine.indexOf(":");
        if (colon <= 0) continue;
        const key = rawLine.slice(0, colon).trim();
        if (!key) continue;

        const rawValue = rawLine.slice(colon + 1);
        result[key] =
            key.toLocaleLowerCase("en-US") === "description"
                ? parseTextScalar(rawValue)
                : parseYamlValue(rawValue);
    }
    return result;
}

function markdownTitle(fileName: string): string {
    return fileName.replace(/\.md$/i, "");
}

export function calendarIdFromPath(relativePath: string): string {
    return `local::${relativePath || "."}`;
}

export function parseStoredEvent(
    file: DesktopEventFileDto,
    knownCalendarIds: ReadonlySet<string>
): DesktopStoredEvent | null {
    const raw = parseFrontmatter(file.contents);
    if (!raw) return null;

    const parsed = validateEvent(raw);
    if (!parsed) return null;

    const calendarId = calendarIdFromPath(file.calendarPath);
    if (!knownCalendarIds.has(calendarId)) return null;

    const event = {
        ...parsed,
        title: parsed.title || markdownTitle(file.fileName),
    } as NeoEvent;

    return {
        // The plugin itself mints an in-memory id when frontmatter has no id.
        // A path-based id gives the desktop build the same stable behavior
        // without writing an extra field into existing notes.
        id:
            typeof event.id === "string" && event.id.trim()
                ? event.id
                : `path:${file.relativePath}`,
        calendarId,
        calendarPath: file.calendarPath,
        relativePath: file.relativePath,
        fileName: file.fileName,
        contents: file.contents,
        event,
    };
}

type PrintableAtom = Array<number | string> | number | string | boolean | null;

function stringifyYamlAtom(value: PrintableAtom): string {
    if (value === null) return "null";

    if (Array.isArray(value)) {
        return `[${value.map(stringifyYamlAtom).join(",")}]`;
    }

    // JSON string syntax is valid YAML. Always quoting strings guarantees
    // that descriptions and every other text field safely support values
    // such as @, #, :, brackets, quotes, emojis and encoded new lines.
    if (typeof value === "string") {
        return JSON.stringify(value);
    }

    return String(value);
}

function stringifyYamlLine(key: string, value: PrintableAtom): string {
    return `${key}: ${stringifyYamlAtom(value)}`;
}

function lineKey(line: string): string | null {
    const colon = line.indexOf(":");
    if (colon <= 0) return null;
    const key = line.slice(0, colon).trim();
    return key || null;
}

/**
 * Rewrites only the event-owned frontmatter while preserving unknown keys and
 * the Markdown body, mirroring FullNoteCalendar.modifyFrontmatterString.
 */
export function serializeEventMarkdown(
    event: NeoEvent,
    previousContents = ""
): string {
    const normalized = validateEvent(event);
    if (!normalized) {
        throw new Error("The event is invalid and cannot be written.");
    }

    const source = normalized as unknown as Record<string, unknown>;
    const existing = extractFrontmatter(previousContents);

    if (!existing) {
        const lines = Object.entries(source)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) =>
                stringifyYamlLine(key, value as PrintableAtom)
            );
        const body = previousContents ? `\n${previousContents}` : "";
        return `---\n${lines.join("\n")}\n---\n${body}`;
    }

    const output: string[] = [];
    const handled = new Set<string>();

    for (const line of existing.lines) {
        const key = lineKey(line);
        if (!key) {
            if (line.trim()) output.push(line);
            continue;
        }

        if (!(key in source)) {
            if (
                (normalized.allDay &&
                    (key === "startTime" || key === "endTime")) ||
                TYPE_EXCLUSIVE_KEYS.has(key)
            ) {
                continue;
            }
            // A key the event model does not own is preserved byte-for-byte.
            output.push(line);
            continue;
        }

        handled.add(key);
        const value = source[key];
        if (value !== undefined) {
            output.push(stringifyYamlLine(key, value as PrintableAtom));
        }
    }

    for (const [key, value] of Object.entries(source)) {
        if (handled.has(key) || value === undefined) continue;
        output.push(stringifyYamlLine(key, value as PrintableAtom));
    }

    return `---\n${output.join("\n")}\n---\n${existing.body}`;
}

function sanitizeForFilename(name: string): string {
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "");
    return cleaned || "Untitled";
}

function baseNameForEvent(event: NeoEvent): string {
    switch (event.type) {
        case "single":
            return `${event.date} ${event.title}`;
        case "recurring":
            return `(Every ${event.daysOfWeek.join(",")}) ${event.title}`;
        case "rrule": {
            let summary = "Recurring";
            try {
                summary = rrulestr(event.rrule).toText();
            } catch {
                // Keep a readable, compatible fallback for malformed legacy rules.
            }
            return `(${summary}) ${event.title}`;
        }
        case "someday":
            return `(Someday) ${event.title}`;
    }

    const exhaustiveCheck: never = event;
    return exhaustiveCheck;
}

export function filenameForEvent(event: NeoEvent): string {
    return `${sanitizeForFilename(baseNameForEvent(event))}.md`;
}

export function resolveStoredEventId(
    records: DesktopStoredEvent[],
    displayId: string
): string | null {
    if (records.some((record) => record.id === displayId)) return displayId;
    const occurrence = displayId.match(/^(.+)_\d{4}-\d{2}-\d{2}$/);
    if (!occurrence) return null;
    return records.some((record) => record.id === occurrence[1])
        ? occurrence[1]
        : null;
}

export function findStoredEvent(
    records: DesktopStoredEvent[],
    displayId: string
): DesktopStoredEvent | undefined {
    const resolved = resolveStoredEventId(records, displayId);
    return resolved
        ? records.find((record) => record.id === resolved)
        : undefined;
}

/** Adds a Markdown line to the note body without touching frontmatter. */
export function appendMarkdownToEventBody(
    contents: string,
    markdown: string
): string {
    const value = markdown.trim();
    if (!value) return contents;

    const document = extractFrontmatter(contents);
    if (!document) {
        const body = contents.trimEnd();
        if (body.split(/\r?\n/).some((line) => line.trim() === value)) {
            return contents;
        }
        return `${body}${body ? "\n" : ""}${value}\n`;
    }

    const body = document.body.replace(/^\n+/, "").trimEnd();
    if (body.split(/\r?\n/).some((line) => line.trim() === value)) {
        return contents;
    }
    const frontmatter = `---\n${document.lines.join("\n")}\n---`;
    return `${frontmatter}\n${body ? `${body}\n` : ""}${value}\n`;
}


interface ParsedMarkdownLink {
    label: string;
    target: string;
}

/**
 * Parse inline Markdown links while supporting balanced parentheses in the
 * destination. A simple `[^)]` regular expression truncates valid paths such
 * as `B1 (2025-2026)/Lesson.md` at the first closing parenthesis.
 */
function parseMarkdownLinks(source: string): ParsedMarkdownLink[] {
    const links: ParsedMarkdownLink[] = [];
    let index = 0;

    while (index < source.length) {
        const image = source[index] === "!" && source[index + 1] === "[";
        const labelStart = image
            ? index + 2
            : source[index] === "["
              ? index + 1
              : -1;

        if (labelStart < 0) {
            index += 1;
            continue;
        }

        let labelEnd = labelStart;
        let escaped = false;
        while (labelEnd < source.length) {
            const character = source[labelEnd];
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "]") {
                break;
            }
            labelEnd += 1;
        }

        if (
            labelEnd >= source.length ||
            source[labelEnd + 1] !== "("
        ) {
            index = labelStart;
            continue;
        }

        const targetStart = labelEnd + 2;
        let cursor = targetStart;
        let depth = 1;
        escaped = false;

        while (cursor < source.length && depth > 0) {
            const character = source[cursor];
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "(") {
                depth += 1;
            } else if (character === ")") {
                depth -= 1;
                if (depth === 0) break;
            }
            cursor += 1;
        }

        if (depth !== 0) {
            index = targetStart;
            continue;
        }

        links.push({
            label: source.slice(labelStart, labelEnd),
            target: source.slice(targetStart, cursor),
        });
        index = cursor + 1;
    }

    return links;
}

/** Removes one generated Markdown link from the note body without touching frontmatter. */
export function removeMarkdownTargetFromEventBody(
    contents: string,
    target: string
): string {
    const normalizedTarget = target.trim().replace(/^<|>$/g, "");
    if (!normalizedTarget) return contents;

    const document = extractFrontmatter(contents);
    const body = document?.body ?? contents;
    let changed = false;

    const nextLines = body.split(/\r?\n/).filter((line) => {
        const removesLine = parseMarkdownLinks(line).some((link) => {
            const found = link.target.trim().replace(/^<|>$/g, "");
            return found === normalizedTarget;
        });
        if (removesLine) changed = true;
        return !removesLine;
    });

    if (!changed) return contents;

    const nextBody = nextLines.join("\n").replace(/^\n+/, "").trimEnd();
    if (!document) return nextBody ? `${nextBody}\n` : "";

    const frontmatter = `---\n${document.lines.join("\n")}\n---`;
    return `${frontmatter}\n${nextBody ? `${nextBody}\n` : ""}`;
}

export interface DesktopEventBodyLink {
    id: string;
    label: string;
    target: string;
    kind: "note" | "attachment" | "web";
}

function decodeLinkPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function linkedFileName(path: string): string {
    const normalized = decodeLinkPart(path)
        .replace(/\\/g, "/")
        .split(/[?#]/, 1)[0]
        .replace(/\/+$/, "");
    const name = normalized.slice(normalized.lastIndexOf("/") + 1);
    return name || normalized;
}

/**
 * Extracts the Markdown links added to the note body and turns them into the
 * compact filename rows shown by the desktop event editor. The visible name is
 * resolved from the link target, not the Markdown label, so an Obsidian note is
 * shown as `File name.md` even when its note title differs.
 */
export function extractEventBodyLinks(
    contents: string
): DesktopEventBodyLink[] {
    const document = extractFrontmatter(contents);
    const body = document?.body ?? contents;
    const links: DesktopEventBodyLink[] = [];
    const seen = new Set<string>();

    for (const match of parseMarkdownLinks(body)) {
        const markdownLabel = match.label.trim();
        const target = match.target.trim().replace(/^<|>$/g, "");
        if (!target || seen.has(target)) continue;

        let kind: DesktopEventBodyLink["kind"] = "attachment";
        let label = "";

        if (/^obsidian:\/\//i.test(target)) {
            kind = "note";
            try {
                const url = new URL(target);
                label = linkedFileName(url.searchParams.get("file") ?? "");
            } catch {
                label = linkedFileName(target);
            }
        } else if (/^https?:\/\//i.test(target)) {
            kind = "web";
            try {
                label = markdownLabel || new URL(target).hostname;
            } catch {
                label = markdownLabel || target;
            }
        } else {
            label = linkedFileName(target);
        }

        if (!label) label = markdownLabel || "Linked file";
        seen.add(target);
        links.push({
            id: `${kind}:${target}`,
            label,
            target,
            kind,
        });
    }

    return links;
}

function strictEncodeURIComponent(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

export function markdownLinkForVaultNote(note: {
    vaultName: string;
    relativePath: string;
    title: string;
    fileName: string;
}): string {
    const vault = strictEncodeURIComponent(note.vaultName);
    const file = strictEncodeURIComponent(
        note.relativePath.replace(/\\/g, "/")
    );
    // Use the real filename as the Markdown label. This keeps newly created
    // links correct even when an older renderer falls back to the label.
    const label = note.fileName.replace(/[\[\]]/g, "").trim() || note.title;
    return `[${label}](obsidian://open?vault=${vault}&file=${file})`;
}

export function markdownLinkForAttachment(attachment: {
    fileName: string;
    markdownPath: string;
}): string {
    const path = attachment.markdownPath.replace(/\\/g, "/");
    const escapedPath = path
        .split("/")
        .map((segment) => strictEncodeURIComponent(segment))
        .join("/");
    const extension = attachment.fileName.split(".").pop()?.toLowerCase();
    const imageExtensions = new Set([
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "svg",
        "bmp",
        "avif",
    ]);
    return imageExtensions.has(extension ?? "")
        ? `![${attachment.fileName}](${escapedPath})`
        : `[${attachment.fileName}](${escapedPath})`;
}
