import { App, CachedMetadata, EventRef, TAbstractFile, TFile } from "obsidian";

/**
 * What a `rewrite` callback may hand back:
 *  - a bare string: the file's new contents (nothing to return to the caller);
 *  - a `[newContents, value]` tuple: write `newContents`, and resolve the
 *    `rewrite` call with `value` (e.g. the line number a new item landed on).
 */
type RewriteResult<T> = string | [string, T];

/**
 * The single, narrow seam through which the rest of the plugin touches the
 * Obsidian vault. Everything a `Calendar` needs to read or mutate a note is
 * expressed here and nowhere else, which keeps the model layer free of any
 * `App` reference and makes it trivially mockable in tests.
 */
export interface ObsidianInterface {
    /** Resolve a vault path to a file or folder, or `null` if nothing is there. */
    getAbstractFileByPath(path: string): TAbstractFile | null;

    /** Resolve a vault path to a file, or `null` if it is missing or a folder. */
    getFileByPath(path: string): TFile | null;

    /** The currently-cached metadata for a file, or `null` if not yet parsed. */
    getMetadata(file: TFile): CachedMetadata | null;

    /** Resolve once the metadata cache has parsed the file at least once. */
    waitForMetadata(file: TFile): Promise<CachedMetadata>;

    /** Read a file's current contents from disk. */
    read(file: TFile): Promise<string>;

    /** Create a new file with the given contents. */
    create(path: string, data: string): Promise<TFile>;

    /**
     * Atomically read a file, transform its contents, and write the result
     * back. The transform may be async, and may return either the new contents
     * or a `[newContents, value]` tuple to also surface a value to the caller.
     */
    rewrite<T = void>(
        file: TFile,
        rewriteFn: (
            contents: string
        ) => RewriteResult<T> | Promise<RewriteResult<T>>
    ): Promise<T>;

    /** Read a file and derive a value from its contents, without writing. */
    process<T>(file: TFile, processFn: (contents: string) => T): Promise<T>;

    /** Rename/move a file, updating links that point to it. */
    rename(file: TFile, newPath: string): Promise<void>;

    /** Delete a file from the vault. */
    delete(file: TFile): Promise<void>;

    /** Create a folder at the given path. */
    createFolder(path: string): Promise<void>;

    /** Rename/move a folder. */
    renameFolder(folder: TAbstractFile, newPath: string): Promise<void>;
}

/**
 * The production `ObsidianInterface`, backed by a live Obsidian `App`. This is
 * the plugin's I/O boundary: it holds no logic of its own beyond delegating to
 * the vault, metadata cache, and file manager, so it is exercised through the
 * real app rather than unit tests (calendars are tested against a mock of the
 * interface above).
 */
export class ObsidianIO implements ObsidianInterface {
    constructor(private readonly app: App) {}

    getAbstractFileByPath(path: string): TAbstractFile | null {
        return this.app.vault.getAbstractFileByPath(path);
    }

    getFileByPath(path: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }

    getMetadata(file: TFile): CachedMetadata | null {
        return this.app.metadataCache.getFileCache(file);
    }

    waitForMetadata(file: TFile): Promise<CachedMetadata> {
        return new Promise((resolve) => {
            const cached = this.app.metadataCache.getFileCache(file);
            if (cached) {
                resolve(cached);
                return;
            }
            const ref: EventRef = this.app.metadataCache.on(
                "changed",
                (changed, _data, cache) => {
                    if (changed.path === file.path) {
                        this.app.metadataCache.offref(ref);
                        resolve(cache);
                    }
                }
            );
        });
    }

    read(file: TFile): Promise<string> {
        return this.app.vault.read(file);
    }

    create(path: string, data: string): Promise<TFile> {
        return this.app.vault.create(path, data);
    }

    async rewrite<T = void>(
        file: TFile,
        rewriteFn: (
            contents: string
        ) => RewriteResult<T> | Promise<RewriteResult<T>>
    ): Promise<T> {
        const contents = await this.app.vault.read(file);
        const result = await rewriteFn(contents);

        let newContents: string;
        let value: T;
        if (Array.isArray(result)) {
            [newContents, value] = result;
        } else {
            newContents = result;
            value = undefined as T;
        }

        await this.app.vault.modify(file, newContents);
        return value;
    }

    async process<T>(
        file: TFile,
        processFn: (contents: string) => T
    ): Promise<T> {
        const contents = await this.app.vault.cachedRead(file);
        return processFn(contents);
    }

    rename(file: TFile, newPath: string): Promise<void> {
        return this.app.fileManager.renameFile(file, newPath);
    }

    delete(file: TFile): Promise<void> {
        return this.app.vault.delete(file);
    }

    async createFolder(path: string): Promise<void> {
        await this.app.vault.createFolder(path);
    }

    renameFolder(folder: TAbstractFile, newPath: string): Promise<void> {
        return this.app.fileManager.renameFile(folder, newPath);
    }
}
