/**
 * YAML block scalars (`|`, `>`) for a note's frontmatter, the way Obsidian
 * writes them. Shared by the plugin (FullNoteCalendar) and the desktop and
 * Android web format (desktopEventFormat); Frontmatter.kt / Serialize.kt are
 * the exact Kotlin port, held to the same cases by conformance/notes.
 *
 * Pure strings in, pure strings out. Lines are frontmatter lines without their
 * line terminator.
 */

/** What may follow `key:` for the value to be a block scalar: an indicator
 *  (indentation digit and/or chomping sign, either order) and a comment. */
const BLOCK_HEADER = /^[ \t]*([|>])([1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#.*)?$/;

export interface BlockHeader {
    style: "|" | ">";
    /** Explicit indentation indicator, relative to the key; 0 when absent. */
    indent: number;
    chomp: "strip" | "clip" | "keep";
}

/** The header of a block scalar, from the text after the key's colon. */
export function parseBlockHeader(rawValue: string): BlockHeader | null {
    const match = BLOCK_HEADER.exec(rawValue);
    if (!match) return null;
    const flags = match[2] ?? "";
    const digit = /[1-9]/.exec(flags);
    return {
        style: match[1] as "|" | ">",
        indent: digit ? Number(digit[0]) : 0,
        chomp: flags.includes("-")
            ? "strip"
            : flags.includes("+")
            ? "keep"
            : "clip",
    };
}

function leadingBlanks(line: string): number {
    let count = 0;
    while (count < line.length && (line[count] === " " || line[count] === "\t")) {
        count += 1;
    }
    return count;
}

function leadingSpaces(line: string): number {
    let count = 0;
    while (count < line.length && line[count] === " ") count += 1;
    return count;
}

function isBlank(line: string): boolean {
    return line.trim() === "";
}

/** The key line's own indentation, which a block's lines must exceed. */
export function keyIndentOf(line: string): number {
    return leadingBlanks(line);
}

/**
 * The index just past the continuation of the block scalar whose key line is
 * `lines[keyIndex]`: every following line indented deeper than the key, and
 * the blank lines between them. Blank lines after the last such line belong to
 * the block only when it keeps them (`+`); otherwise they are left to the
 * caller, which drops them as it always did.
 */
export function blockGroupEnd(
    lines: readonly string[],
    keyIndex: number,
    keep: boolean
): number {
    const keyIndent = leadingBlanks(lines[keyIndex]);
    let cursor = keyIndex + 1;
    let last = keyIndex;
    while (cursor < lines.length) {
        const line = lines[cursor];
        if (isBlank(line)) {
            cursor += 1;
        } else if (leadingBlanks(line) > keyIndent) {
            last = cursor;
            cursor += 1;
        } else {
            break;
        }
    }
    return keep ? cursor : last + 1;
}

/** The string a block scalar stands for. `keyIndent` is the key line's own
 *  indentation; `content` the lines `blockGroupEnd` found after it. */
export function decodeBlockScalar(
    header: BlockHeader,
    keyIndent: number,
    content: readonly string[]
): string {
    let indent = keyIndent + header.indent;
    if (header.indent === 0) {
        const first = content.find((line) => !isBlank(line));
        indent = first === undefined ? 0 : leadingSpaces(first);
    }
    const stripped = content.map((line) =>
        line.slice(Math.min(indent, leadingSpaces(line)))
    );
    let end = stripped.length;
    while (end > 0 && stripped[end - 1] === "") end -= 1;
    const text = stripped.slice(0, end);
    const trailing = stripped.length - end;

    let value = "";
    if (header.style === "|") {
        value = text.join("\n");
    } else {
        let previous: string | null = null;
        let blanks = 0;
        for (const line of text) {
            if (line === "") {
                blanks += 1;
                continue;
            }
            if (previous === null) {
                value += "\n".repeat(blanks);
            } else {
                const more = /^[ \t]/.test(line) || /^[ \t]/.test(previous);
                value +=
                    blanks === 0
                        ? more
                            ? "\n"
                            : " "
                        : "\n".repeat(blanks + (more ? 1 : 0));
            }
            value += line;
            previous = line;
            blanks = 0;
        }
    }

    if (header.chomp === "strip") return value;
    if (header.chomp === "clip") return text.length > 0 ? `${value}\n` : "";
    return text.length > 0
        ? `${value}\n${"\n".repeat(trailing)}`
        : "\n".repeat(trailing);
}

/** Characters a literal block cannot carry safely: control characters other
 *  than the tab and the line break, the Unicode line separators, the byte-order
 *  mark and lone surrogates. */
function hasUnsafeCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (
            (code < 0x20 && code !== 0x09 && code !== 0x0a) ||
            (code >= 0x7f && code <= 0x9f) ||
            code === 0x2028 ||
            code === 0x2029 ||
            code === 0xfeff
        ) {
            return true;
        }
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
            index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return true;
        }
    }
    return false;
}
/**
 * A multi-line string as Obsidian writes it: the header, then the lines
 * indented by two spaces. Null when the value is better written quoted (the
 * caller then keeps JSON.stringify): no line break, a carriage return or
 * control character, nothing but line breaks, a last line of blanks only, or a
 * line that the frontmatter's closing fence would be read from.
 */
export function blockScalarLines(value: string): string[] | null {
    if (!value.includes("\n") || hasUnsafeCharacter(value)) return null;

    const body = value.replace(/\n+$/, "");
    const trailing = value.length - body.length;
    if (body === "") return null;

    const lines = body.split("\n");
    if (isBlank(lines[lines.length - 1])) return null;
    if (lines.some((line) => line.trim() === "---")) return null;

    const first = lines.find((line) => !isBlank(line)) ?? "";
    const indicator = first.startsWith(" ") ? "2" : "";
    const chomp = trailing === 0 ? "-" : trailing === 1 ? "" : "+";

    const out = [`|${indicator}${chomp}`];
    lines.forEach((line, index) => {
        out.push(line === "" ? (index === 0 ? "  " : "") : `  ${line}`);
    });
    for (let extra = 1; extra < trailing; extra += 1) out.push("");
    return out;
}
