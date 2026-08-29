export type DescriptionFormatCommand =
    | "bold"
    | "italic"
    | "underline"
    | "inline-code"
    | "ordered-list"
    | "bullet-list"
    | "checklist"
    | "subtask"
    | "heading-1"
    | "heading-2"
    | "heading-3"
    | "quote"
    | "horizontal-rule";

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
    "inline-code": ["`", "`"],
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
        /^(\s*)(?:(?:#{1,3} )|(?:> )|(?:- \[[ xX]\] )|(?:[-*+] )|(?:\d+[.)] ))?(.*)$/.exec(
            line
        );
    return {
        indent: match?.[1] ?? "",
        content: match?.[2] ?? line,
    };
}

function linePrefix(
    command: Exclude<
        DescriptionFormatCommand,
        "bold" | "italic" | "underline" | "inline-code" | "horizontal-rule"
    >,
    index: number
): string {
    switch (command) {
        case "heading-1":
            return "# ";
        case "heading-2":
            return "## ";
        case "heading-3":
            return "### ";
        case "quote":
            return "> ";
        case "ordered-list":
            return `${index + 1}. `;
        case "checklist":
            return "- [ ] ";
        case "subtask":
            return "    - [ ] ";
        case "bullet-list":
            return "- ";
    }
}

function insertHorizontalRule(
    text: string,
    start: number,
    end: number
): DescriptionFormatResult {
    const before = text.slice(0, start);
    const after = text.slice(end);
    const leadingBreak = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const trailingBreak = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
    const inserted = `${leadingBreak}---${trailingBreak}`;
    const caret = start + inserted.length;
    return {
        text: before + inserted + after,
        selectionStart: caret,
        selectionEnd: caret,
    };
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

    if (command === "horizontal-rule") {
        return insertHorizontalRule(text, start, end);
    }

    const [from, to] = lineRange(text, start, end);
    const lines = text.slice(from, to).split("\n");
    const formatted = lines
        .map((line, index) => {
            const { indent, content } = splitLinePrefix(line);
            const prefix = linePrefix(command, index);
            const nextIndent = command === "subtask" ? "" : indent;
            return nextIndent + prefix + content;
        })
        .join("\n");

    return {
        text: text.slice(0, from) + formatted + text.slice(to),
        selectionStart: from,
        selectionEnd: from + formatted.length,
    };
}
