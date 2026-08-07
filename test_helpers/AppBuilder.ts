import {
    App,
    CachedMetadata,
    EventRef,
    FileManager,
    Keymap,
    MetadataCache,
    Scope,
    TAbstractFile,
    TFile,
    TFolder,
    UserEvent,
    Workspace,
} from "obsidian";
import { FileBuilder } from "./FileBuilder";
import { MockVault } from "./MockVault";

/**
 * Assembling a fake `App` for tests: a vault tree, the file contents that go
 * with it, and the metadata Obsidian would have parsed out of them.
 *
 * Pair with {@link FileBuilder}, which produces a file's contents and its
 * metadata together, so the two can never drift apart.
 */

const joinPath = (...segments: string[]): string =>
    segments.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";

/** A `MetadataCache` that just looks entries up in a path→metadata map. */
export class MockCache implements MetadataCache {
    private cache: Map<string, CachedMetadata>;

    constructor(cache: Map<string, CachedMetadata>) {
        this.cache = cache;
    }

    getCache(path: string): CachedMetadata | null {
        return this.cache.get(joinPath("/", path)) || null;
    }

    getFileCache(file: TFile): CachedMetadata | null {
        return this.getCache(file.path);
    }

    resolvedLinks: Record<string, Record<string, number>> = {};
    unresolvedLinks: Record<string, Record<string, number>> = {};

    ///
    // Not implemented: nothing under test reaches for these.
    ///

    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
        throw new Error("Method not implemented.");
    }
    fileToLinktext(
        file: TFile,
        sourcePath: string,
        omitMdExtension?: boolean | undefined
    ): string {
        throw new Error("Method not implemented.");
    }
    on(name: unknown, callback: unknown, ctx?: unknown): EventRef {
        throw new Error("Method not implemented.");
    }
    off(name: string, callback: (...data: any) => any): void {
        throw new Error("Method not implemented.");
    }
    offref(ref: EventRef): void {
        throw new Error("Method not implemented.");
    }
    trigger(name: string, ...data: any[]): void {
        throw new Error("Method not implemented.");
    }
    tryTrigger(evt: EventRef, args: any[]): void {
        throw new Error("Method not implemented.");
    }
}

/** The only two members of `App` the model layer ever touches. */
export class MockApp implements App {
    vault: MockVault;
    metadataCache: MetadataCache;

    keymap: Keymap = {} as Keymap;
    scope: Scope = {} as Scope;
    workspace: Workspace = {} as Workspace;
    fileManager: FileManager = {} as FileManager;
    lastEvent: UserEvent | null = null;

    constructor(vault: MockVault, cache: MockCache) {
        this.vault = vault;
        this.metadataCache = cache;
    }
}

/** A nested tree of values, mirroring the folder structure being built. */
interface FileTree<T> {
    [key: string]: { t: "file"; v: T } | { t: "folder"; v: FileTree<T> };
}

/** Flatten a tree into the path→value map the mocks are backed by. */
function toPathMap<T>(tree: FileTree<T>): Map<string, T> {
    const walk = (subtree: FileTree<T>, path: string): [string, T][] =>
        Object.entries(subtree).flatMap(([name, node]) =>
            node.t === "file"
                ? [[joinPath(path, name), node.v]]
                : walk(node.v, joinPath(path, name))
        );
    return new Map(walk(tree, "/"));
}

/**
 * Builds one folder's worth of an app. Immutable: every call returns a new
 * builder, so a partially-built tree can be reused across cases.
 */
export class MockAppBuilder {
    path: string;
    children: TAbstractFile[];
    contents: FileTree<string>;
    metadata: FileTree<CachedMetadata>;

    /** Start from an empty vault root. */
    static make() {
        return new MockAppBuilder("/", [], {}, {});
    }

    constructor(
        path: string,
        children: TAbstractFile[] = [],
        contents: FileTree<string> = {},
        metadata: FileTree<CachedMetadata> = {}
    ) {
        this.path = joinPath("/", path);
        this.children = children;
        this.contents = contents;
        this.metadata = metadata;
    }

    /** Add a file, along with the contents and metadata the builder produced. */
    file(filename: string, builder: FileBuilder): MockAppBuilder {
        const file = new TFile();
        file.name = filename;

        const [contents, metadata] = builder.done();

        return new MockAppBuilder(
            this.path,
            [...this.children, file],
            { ...this.contents, [filename]: { t: "file", v: contents } },
            { ...this.metadata, [filename]: { t: "file", v: metadata } }
        );
    }

    /** Nest another builder's folder inside this one. */
    folder(child: MockAppBuilder): MockAppBuilder {
        return new MockAppBuilder(
            this.path,
            [...this.children, child.makeFolder()],
            {
                ...this.contents,
                [child.path]: { t: "folder", v: child.contents },
            },
            {
                ...this.metadata,
                [child.path]: { t: "folder", v: child.metadata },
            }
        );
    }

    private makeFolder(): TFolder {
        const folder = new TFolder();
        // Only the last segment is the name — `TAbstractFile.path` derives the
        // rest from the parent chain. The root keeps its "/" name.
        const segments = this.path.split("/").filter(Boolean);
        folder.name = segments.length > 0 ? segments[segments.length - 1] : "/";

        folder.children = [...this.children];
        for (const child of folder.children) {
            child.parent = folder;
        }
        return folder;
    }

    done(): MockApp {
        return new MockApp(
            new MockVault(this.makeFolder(), toPathMap(this.contents)),
            new MockCache(toPathMap(this.metadata))
        );
    }
}
