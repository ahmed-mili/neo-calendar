import { CachedMetadata, ListItemCache, Loc, Pos } from "obsidian";

/**
 * A reverse-parser for Obsidian's metadata cache.
 *
 * Declare a file block by block — frontmatter, headings, lists, prose — and get
 * back both its text and the `CachedMetadata` Obsidian *would* have produced for
 * it. Writing the two by hand instead means they drift, and a test then passes
 * against metadata that could never come from the file it claims to describe.
 */

type ListItem = {
    type: "item";
    text: string;
    checkbox: "x" | " " | undefined;
};

type ListBlock = {
    type: "list";
    items: (ListItem | ListBlock)[];
};

type FileBlock =
    | { type: "heading"; text: string; level: number }
    | { type: "frontmatter"; key: string; text: any }
    | { type: "text"; text: string }
    | ListBlock;

/** A list item flattened out of the nesting, with the depth it sat at. */
type FlatListItem = {
    text: string;
    checkbox: " " | "x" | undefined;
    depth: number;
    parent: number;
};

/**
 * Flatten a (possibly nested) list, assigning each item the `parent` value
 * Obsidian's cache uses: negative-of-the-line for top-level items, the parent's
 * line for nested ones.
 */
const flattenList = (
    list: ListBlock,
    startingLine: number,
    depth: number = 0
): FlatListItem[] => {
    // Obsidian quirk: a list starting on line 0 is recorded as if on line 1, so
    // plugins can test for nesting with `parent > 0`.
    const line = startingLine === 0 ? 1 : startingLine;

    const items: FlatListItem[] = [];
    for (const item of list.items) {
        if (item.type === "item") {
            items.push({
                text: item.text,
                checkbox: item.checkbox,
                depth,
                parent: depth === 0 ? -line : line,
            });
        } else {
            items.push(
                ...flattenList(item, line + items.length - 1, depth + 1)
            );
        }
    }
    return items;
};

const makeFile = (
    blocks: FileBlock[],
    indentUnit = " ".repeat(4)
): [string, CachedMetadata] => {
    let lineNumber = 0;
    let content = "";

    /** Append a line and hand back the `Pos` the cache would record for it. */
    const appendLine = (line: string): Pos => {
        const start: Loc = { line: lineNumber, col: 0, offset: content.length };
        content += `${line}\n`;
        const end: Loc = {
            line: lineNumber++,
            col: line.length, // columns are 0-indexed
            offset: content.length - 1, // don't count the newline
        };
        return { start, end };
    };

    const meta: CachedMetadata = {};

    // Frontmatter always leads, whatever order it was declared in.
    const frontmatter = blocks.flatMap((b) =>
        b.type === "frontmatter" ? b : []
    );
    if (frontmatter.length > 0) {
        const data: Record<string, any> = {};
        const { start } = appendLine("---");
        for (const { key, text } of frontmatter) {
            appendLine(
                Array.isArray(text) ? `${key}: [${text}]` : `${key}: ${text}`
            );
            data[key] = text;
        }
        const { end } = appendLine("---");
        meta.frontmatter = { position: { start, end }, ...data };
    }

    for (const block of blocks) {
        switch (block.type) {
            case "frontmatter":
                continue; // already emitted above

            case "heading": {
                const position = appendLine(
                    "#".repeat(block.level) + " " + block.text
                );
                meta.headings = meta.headings || [];
                meta.headings.push({
                    position,
                    heading: block.text,
                    level: block.level,
                });
                continue;
            }

            case "list": {
                meta.listItems = meta.listItems || [];
                for (const item of flattenList(block, lineNumber)) {
                    const indent = indentUnit.repeat(item.depth);
                    const checkbox = item.checkbox ? `[${item.checkbox}] ` : "";
                    const position = appendLine(
                        `${indent}- ${checkbox}${item.text}`
                    );

                    // Obsidian points a nested item at its bullet, not at the
                    // first column of its indentation.
                    if (indent.length > 0) {
                        position.start.col += indent.length - 2;
                        position.start.offset += indent.length - 2;
                    }

                    const listItem: ListItemCache = {
                        position,
                        parent: item.parent,
                    };
                    if (item.checkbox) {
                        listItem.task = item.checkbox;
                    }
                    meta.listItems.push(listItem);
                }
                continue;
            }

            case "text":
                appendLine(block.text);
        }
    }

    return [content, meta];
};

/** Builds the (possibly nested) lists a {@link FileBuilder} can hold. */
export class ListBuilder {
    items: (ListItem | ListBlock)[] = [];

    constructor(items: (ListItem | ListBlock)[] = []) {
        this.items = items;
    }

    /** `checkbox` omitted means a plain bullet; `false` means an unchecked box. */
    item(text: string, checkbox?: boolean | undefined) {
        const item: ListItem = {
            type: "item",
            text,
            checkbox:
                checkbox === true ? "x" : checkbox === false ? " " : undefined,
        };
        return new ListBuilder([...this.items, item]);
    }

    /** Nest another list under the item before it. */
    list(sublist: ListBuilder) {
        return new ListBuilder([...this.items, sublist.done()]);
    }

    done(): ListBlock {
        return { type: "list", items: this.items };
    }
}

/**
 * Builds a file's contents and its metadata at the same time. Immutable: each
 * call returns a new builder.
 */
export class FileBuilder {
    private blocks: FileBlock[];

    constructor(blocks: FileBlock[] = []) {
        this.blocks = blocks;
    }

    /** YAML frontmatter. Emitted at the top of the file regardless of order. */
    frontmatter(frontmatter: Record<string, any>): FileBuilder {
        const entries = Object.entries(frontmatter).map(
            ([key, text]): FileBlock => ({ type: "frontmatter", key, text })
        );
        return new FileBuilder([...this.blocks, ...entries]);
    }

    heading(level: number, text: string): FileBuilder {
        return new FileBuilder([
            ...this.blocks,
            { type: "heading", level, text },
        ]);
    }

    text(text: string): FileBuilder {
        return new FileBuilder([...this.blocks, { type: "text", text }]);
    }

    list(list: ListBuilder): FileBuilder {
        return new FileBuilder([...this.blocks, list.done()]);
    }

    /** @returns the file's contents, and the metadata Obsidian would cache. */
    done(): [string, CachedMetadata] {
        return makeFile(this.blocks);
    }
}
