/**
 * Stand-in for the `obsidian` module under test.
 *
 * Jest picks this up automatically for the (external) `obsidian` package, so the
 * model layer can be exercised without an Obsidian runtime. Only what the code
 * under test actually reaches for is implemented; TypeScript still checks
 * against the real `obsidian` types, so the shapes here have to line up.
 *
 * Paths use forward slashes throughout — the vault convention — rather than
 * Node's `path`, which would emit backslashes on Windows.
 */

const joinPath = (...segments: string[]): string =>
    segments.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";

const baseName = (path: string): string =>
    path.slice(path.lastIndexOf("/") + 1);

/** The extension including its dot, or "" when there is none. */
const extName = (name: string): string => {
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot);
};

/** Anything in the vault: a file or a folder. */
export abstract class TAbstractFile {
    name: string = "";
    parent: TFolder | null = null;

    /** Derived from the parent chain, so a rename is just a name/parent swap. */
    get path(): string {
        const path = joinPath(this.parent?.path || "", this.name);
        return path.startsWith("/") && path.length > 1 ? path.slice(1) : path;
    }
}

export class TFile extends TAbstractFile {
    /** File name without its extension. */
    get basename(): string {
        const ext = extName(this.name);
        const name = baseName(this.name);
        return ext ? name.slice(0, -ext.length) : name;
    }

    /** Extension without the leading dot. */
    get extension(): string {
        const ext = extName(this.name);
        return ext.startsWith(".") ? ext.slice(1) : ext;
    }
}

export class TFolder extends TAbstractFile {
    children: TAbstractFile[] = [];

    isRoot(): boolean {
        return this.path === "/";
    }
}

/**
 * Parses a single `key: value` line — which is all the frontmatter writer ever
 * hands it, as it works line by line. A value may itself contain colons, so only
 * the first one splits.
 */
export function parseYaml(yaml: string): Record<string, string> | null {
    const [key, ...rest] = yaml.split(":");
    if (!key || !rest) {
        return null;
    }
    return { [key.trim()]: rest.join(":").trim() };
}

/** Records what would have been shown to the user, so tests can assert on it. */
export class Notice {
    static notices: string[] = [];

    constructor(message: string) {
        Notice.notices.push(message);
    }
}
