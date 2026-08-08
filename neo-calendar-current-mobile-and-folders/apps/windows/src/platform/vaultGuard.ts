export interface PathAccess {
    dirname(path: string): Promise<string>;
    hasObsidianConfig(path: string): Promise<boolean>;
}

function isFilesystemRoot(path: string): boolean {
    const windowsPath = path.replace(/\//g, "\\");
    if (windowsPath === "\\" || /^[A-Za-z]:\\?$/.test(windowsPath)) {
        return true;
    }

    const withoutTrailingSeparators = windowsPath.replace(/\\+$/, "");
    return /^\\\\[^\\]+\\[^\\]+$/.test(withoutTrailingSeparators);
}

export async function findObsidianVaultAncestor(
    selectedFolder: string,
    access: PathAccess
): Promise<string | null> {
    const visited = new Set<string>();
    let current = selectedFolder;

    while (!visited.has(current)) {
        visited.add(current);
        if (await access.hasObsidianConfig(current)) {
            return current;
        }

        if (isFilesystemRoot(current)) break;

        const parent = await access.dirname(current);
        if (parent === current) break;
        current = parent;
    }

    return null;
}
