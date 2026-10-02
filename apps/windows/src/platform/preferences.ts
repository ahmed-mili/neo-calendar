import { DEFAULT_THEME_ID, getTheme } from "../themes/registry";
import { ThemeId } from "../themes/types";

export interface DesktopPreferences {
    dataFolder: string | null;
    themeId: ThemeId;
    /** L'identifiant lu quand le thème enregistré n'existe plus (`themeId` est alors Catppuccin). Il ne sert qu'à retrouver
     *  le fond que cette personne avait ; les sauvegardes le gardent, choisir un thème l'efface. */
    legacyThemeId?: string;
    vaultFolders: string[];
    disabledVaults: string[];
    /** Le démarrage automatique a déjà été posé une première fois. Sans ce
     *  drapeau, le « activé au repos » se réappliquerait à chaque lancement et
     *  annulerait la décision de l'avoir coupé. */
    startupDefaultApplied: boolean;
    /** La bulle « Neo Calendar continue de veiller ici » a été montrée. Elle
     *  répond à une question qu'on ne se pose qu'une fois. */
    trayHintSeen: boolean;
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
    // Le thème lu n'existe plus : on garde son identifiant (ou celui déjà gardé par une sauvegarde précédente).
    const rawThemeId =
        typeof input.themeId === "string" && input.themeId.trim()
            ? input.themeId
            : undefined;
    const keptLegacy =
        rawThemeId === themeId &&
        typeof input.legacyThemeId === "string" &&
        input.legacyThemeId.trim()
            ? input.legacyThemeId
            : undefined;
    const legacyThemeId =
        rawThemeId && rawThemeId !== themeId ? rawThemeId : keptLegacy;

    return {
        dataFolder,
        themeId,
        ...(legacyThemeId ? { legacyThemeId } : {}),
        vaultFolders: migrateLegacyVaultFolders(input),
        disabledVaults: normalizePathList(input.disabledVaults),
        startupDefaultApplied: input.startupDefaultApplied === true,
        trayHintSeen: input.trayHintSeen === true,
    };
}

/** Les préférences avec un thème choisi : l'identifiant d'origine d'un thème retiré n'a plus lieu d'être. */
export function withChosenTheme(
    preferences: DesktopPreferences,
    themeId: ThemeId
): DesktopPreferences {
    const { legacyThemeId: _dropped, ...rest } = preferences;
    return { ...rest, themeId };
}

export function isSameDesktopPath(left: string, right: string): boolean {
    return pathKey(left) === pathKey(right);
}
