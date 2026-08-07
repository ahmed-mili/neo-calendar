import {
    DataAdapter,
    DataWriteOptions,
    EventRef,
    TAbstractFile,
    TFile,
    TFolder,
    Vault,
} from "obsidian";

/**
 * An in-memory `Vault`: a folder tree plus a path→contents map.
 *
 * Only the operations the calendars actually perform are implemented; the rest
 * of the (large) Vault interface throws, so an untested code path that starts
 * using one fails loudly instead of silently doing nothing.
 *
 * Forward slashes throughout — Node's `path` would emit backslashes on Windows.
 */

const posix = {
    join: (...segments: string[]) =>
        segments.join("/").replace(/\/+/g, "/").replace(/\/$/, ""),
    dirname: (p: string) => {
        const slash = p.lastIndexOf("/");
        return slash === -1 ? "." : p.slice(0, slash) || "/";
    },
    basename: (p: string) => p.slice(p.lastIndexOf("/") + 1),
    normalize: (p: string) => p.replace(/\/+/g, "/").replace(/\/$/, "") || "/",
};

/** Every file and folder under `folder`, recursively. */
const descendants = (folder: TFolder): TAbstractFile[] =>
    folder.children.flatMap((child) =>
        child instanceof TFolder ? [child, ...descendants(child)] : child
    );

export class MockVault implements Vault {
    root: TFolder;
    contents: Map<string, string>;

    constructor(root: TFolder, contents: Map<string, string>) {
        this.root = root;
        this.contents = contents;
    }

    adapter: DataAdapter = {} as DataAdapter;
    configDir: string = "";

    getName(): string {
        return "Mock Vault";
    }

    getRoot(): TFolder {
        return this.root;
    }

    getAllLoadedFiles(): TAbstractFile[] {
        return [this.root, ...descendants(this.root)];
    }

    private absolute(path: string): string {
        return posix.normalize(posix.join("/", path));
    }

    getAbstractFileByPath(path: string): TAbstractFile | null {
        const wanted = this.absolute(path);
        return (
            this.getAllLoadedFiles().find(
                (f) => this.absolute(f.path) === wanted
            ) || null
        );
    }

    getFiles(): TFile[] {
        return this.getAllLoadedFiles().flatMap((f) =>
            f instanceof TFile ? f : []
        );
    }

    getMarkdownFiles(): TFile[] {
        return this.getFiles().filter(
            (f) => f.extension.toLowerCase() === "md"
        );
    }

    async read(file: TFile): Promise<string> {
        const path = posix.join("/", file.path);
        const contents = this.contents.get(path);
        if (contents === undefined) {
            throw new Error(`File at path ${path} does not have contents`);
        }
        return contents;
    }

    cachedRead(file: TFile): Promise<string> {
        return this.read(file);
    }

    /** Hang a new file or folder off the folder its path points into. */
    private attachToParent(path: string, child: TAbstractFile): void {
        const parentPath = posix.dirname(path);
        const parent = this.getAbstractFileByPath(parentPath);
        if (!(parent instanceof TFolder)) {
            throw new Error(`Parent path is not a folder: ${parentPath}`);
        }
        child.parent = parent;
        parent.children.push(child);
    }

    private detachFromParent(child: TAbstractFile): void {
        const siblings = child.parent?.children;
        if (!siblings) {
            return;
        }
        const i = siblings.indexOf(child);
        if (i !== -1) {
            siblings.splice(i, 1);
        }
    }

    async create(path: string, data: string): Promise<TFile> {
        if (this.getAbstractFileByPath(path)) {
            throw new Error("File already exists.");
        }
        const file = new TFile();
        file.name = posix.basename(path);
        this.attachToParent(path, file);
        this.contents.set(path, data);
        return file;
    }

    async createFolder(path: string): Promise<void> {
        const folder = new TFolder();
        folder.name = posix.basename(path);
        this.attachToParent(path, folder);
    }

    async delete(file: TAbstractFile): Promise<void> {
        this.detachFromParent(file);
        this.contents.delete(posix.join("/", file.path));
    }

    trash(file: TAbstractFile): Promise<void> {
        return this.delete(file);
    }

    /**
     * A rename is just a new name and parent: `TAbstractFile.path` is derived
     * from them. The contents map is keyed by path, though, so every affected
     * entry has to be re-keyed — for a folder, that's every file beneath it.
     */
    async rename(file: TAbstractFile, newPath: string): Promise<void> {
        const parentPath = posix.dirname(newPath);
        const parent = this.getAbstractFileByPath(parentPath);
        if (!(parent instanceof TFolder)) {
            throw new Error(`No such folder: ${parentPath}`);
        }

        const affected = (
            file instanceof TFolder
                ? descendants(file).flatMap((f) =>
                      f instanceof TFile ? f : []
                  )
                : file instanceof TFile
                ? [file]
                : null
        )?.map((f): [TFile, string] => {
            const contents = this.contents.get(f.path);
            if (contents === undefined) {
                throw new Error(`File did not have contents: ${f.path}`);
            }
            return [f, contents];
        });

        if (!affected) {
            throw new Error(`File is not a file or folder: ${file.path}`);
        }

        // Drop the old keys before moving, while the old paths still resolve.
        for (const [f] of affected) {
            this.contents.delete(f.path);
        }

        this.detachFromParent(file);
        file.parent = parent;
        file.name = posix.basename(newPath);
        parent.children.push(file);

        for (const [f, contents] of affected) {
            this.contents.set(f.path, contents);
        }
    }

    async modify(file: TFile, data: string): Promise<void> {
        this.contents.set(file.path, data);
    }

    async copy(file: TFile, newPath: string): Promise<TFile> {
        return this.create(newPath, await this.read(file));
    }

    ///
    // Not implemented: nothing under test reaches for these.
    ///

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
    append(
        file: TFile,
        data: string,
        options?: DataWriteOptions | undefined
    ): Promise<void> {
        throw new Error("Method not implemented.");
    }
    createBinary(
        path: string,
        data: ArrayBuffer,
        options?: DataWriteOptions | undefined
    ): Promise<TFile> {
        throw new Error("Method not implemented.");
    }
    readBinary(file: TFile): Promise<ArrayBuffer> {
        throw new Error("Method not implemented.");
    }
    modifyBinary(
        file: TFile,
        data: ArrayBuffer,
        options?: DataWriteOptions | undefined
    ): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getResourcePath(file: TFile): string {
        throw new Error("Method not implemented.");
    }
}
