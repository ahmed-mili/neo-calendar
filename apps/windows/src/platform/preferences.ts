import { DEFAULT_THEME_ID, getTheme } from "../themes/registry";
import { ThemeId } from "../themes/types";

export interface DesktopPreferences {
    dataFolder: string | null;
    themeId: ThemeId;
    vaultFolders: string[];
    disabledVaults: string[];
}

function pathKey(value: string): string {
    return value
        .replace(/[\\/]+$/, "")
        .replace(/\\/g, "/")
        .toLowerCase();
}

function normalizePathList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const output: string[] = [];
    for (const entry of value) {
        if (typeof entry !== "string") continue;
        const path = entry.trim().replace(/[\\/]+$/, "");
        if (!path) continue;
        const key = pathKey(path);
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(path);
    }
    return output;
}

function parentPath(value: string): string | null {
    const path = value.trim().replace(/[\\/]+$/, "");
    const separator = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
    if (separator <= 0) return null;
    return path.slice(0, separator);
}

function migrateLegacyVaultFolders(input: Record<string, unknown>): string[] {
    const explicit = normalizePathList(input.vaultFolders);
    if (explicit.length > 0) return explicit;

    const legacyVaults = normalizePathList(input.linkedVaults);
    const parents = legacyVaults
        .map(parentPath)
        .filter((path): path is string => Boolean(path));
    return normalizePathList(parents);
}

export function normalizeDesktopPreferences(
    value: unknown
): DesktopPreferences {
    const input =
        value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};
    const dataFolder =
        typeof input.dataFolder === "string" && input.dataFolder.trim()
            ? input.dataFolder
            : null;
    const themeId = getTheme(
        typeof input.themeId === "string" ? input.themeId : DEFAULT_THEME_ID
    ).id;

    return {
        dataFolder,
        themeId,
        vaultFolders: migrateLegacyVaultFolders(input),
        disabledVaults: normalizePathList(input.disabledVaults),
    };
}

export function isSameDesktopPath(left: string, right: string): boolean {
    return pathKey(left) === pathKey(right);
}
