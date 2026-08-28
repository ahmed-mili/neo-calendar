export type DescriptionFormatCommand =
    | "bold"
    | "italic"
    | "underline"
    | "ordered-list"
    | "bullet-list"
    | "checklist"
    | "clear";

export interface DescriptionFormatResult {
    text: string;
    selectionStart: number;
    selectionEnd: number;
}

const INLINE_MARKS: Partial<
    Record<DescriptionFormatCommand, [string, string]>
> = {
    bold: ["**", "**"],
    italic: ["_", "_"],
    underline: ["<u>", "</u>"],
};

function normalizedSelection(
    text: string,
    selectionStart: number,
    selectionEnd: number
): [number, number] {
    const start = Math.max(0, Math.min(selectionStart, text.length));
    const end = Math.max(start, Math.min(selectionEnd, text.length));
    return [start, end];
}

function lineRange(text: string, start: number, end: number): [number, number] {
    const from = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lastSelected = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const nextBreak = text.indexOf("\n", lastSelected);
    return [from, nextBreak === -1 ? text.length : nextBreak];
}

function splitLinePrefix(line: string): { indent: string; content: string } {
    const match =
        /^(\s*)(?:(?:- \[[ xX]\] )|(?:[-*+] )|(?:\d+[.)] ))?(.*)$/.exec(line);
    return {
        indent: match?.[1] ?? "",
        content: match?.[2] ?? line,
    };
}

function clearInlineFormatting(text: string): string {
    let next = text;
    let previous = "";
    while (next !== previous) {
        previous = next;
        next = next
            .replace(/<u>([\s\S]*?)<\/u>/g, "$1")
            .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
            .replace(/_([^_\n]+)_/g, "$1");
    }
    return next;
}

export function applyDescriptionFormat(
    text: string,
    selectionStart: number,
    selectionEnd: number,
    command: DescriptionFormatCommand
): DescriptionFormatResult {
    const [start, end] = normalizedSelection(
        text,
        selectionStart,
        selectionEnd
    );
    const marks = INLINE_MARKS[command];
    if (marks) {
        const [before, after] = marks;
        const selected = text.slice(start, end);
        return {
            text:
                text.slice(0, start) +
                before +
                selected +
                after +
                text.slice(end),
            selectionStart: start + before.length,
            selectionEnd: end + before.length,
        };
    }

    const [from, to] = lineRange(text, start, end);
    const lines = text.slice(from, to).split("\n");
    const formatted = lines
        .map((line, index) => {
            const { indent, content } = splitLinePrefix(line);
            if (command === "clear") {
                return indent + clearInlineFormatting(content);
            }
            const prefix =
                command === "ordered-list"
                    ? `${index + 1}. `
                    : command === "checklist"
                    ? "- [ ] "
                    : "- ";
            return indent + prefix + content;
        })
        .join("\n");

    return {
        text: text.slice(0, from) + formatted + text.slice(to),
        selectionStart: from,
        selectionEnd: from + formatted.length,
    };
}
