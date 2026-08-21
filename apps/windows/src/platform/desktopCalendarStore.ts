import { invoke } from "@tauri-apps/api/core";

export interface DesktopCalendarFolderDto {
    relativePath: string;
    name: string;
}

export interface DesktopEventFileDto {
    relativePath: string;
    calendarPath: string;
    fileName: string;
    contents: string;
}

export interface DesktopWorkspaceSnapshotDto {
    calendars: DesktopCalendarFolderDto[];
    eventFiles: DesktopEventFileDto[];
    preferences: unknown;
    /** False when there was no preference file to read — which, in a synced
        folder, means "not at this instant" as often as "never had one". */
    preferencesFound: boolean;
}

export interface WriteEventFileRequest {
    dataFolder: string;
    calendarPath: string;
    previousRelativePath?: string;
    fileName: string;
    contents: string;
}

export async function loadDesktopWorkspace(
    dataFolder: string
): Promise<DesktopWorkspaceSnapshotDto> {
    return invoke<DesktopWorkspaceSnapshotDto>("load_desktop_workspace", {
        dataFolder,
    });
}

export async function saveDesktopPreferences(
    dataFolder: string,
    preferences: unknown
): Promise<void> {
    await invoke("save_desktop_preferences", {
        dataFolder,
        preferences,
    });
}

export async function writeDesktopEventFile(
    request: WriteEventFileRequest
): Promise<string> {
    return invoke<string>("write_desktop_event_file", {
        dataFolder: request.dataFolder,
        calendarPath: request.calendarPath,
        previousRelativePath: request.previousRelativePath,
        fileName: request.fileName,
        contents: request.contents,
    });
}

export async function deleteDesktopEventFile(
    dataFolder: string,
    relativePath: string
): Promise<void> {
    await invoke("delete_desktop_event_file", {
        dataFolder,
        relativePath,
    });
}

export async function createDesktopCalendarFolder(
    dataFolder: string,
    name: string
): Promise<string> {
    return invoke<string>("create_desktop_calendar_folder", {
        dataFolder,
        name,
    });
}

export async function renameDesktopCalendarFolder(
    dataFolder: string,
    relativePath: string,
    newName: string
): Promise<string> {
    return invoke<string>("rename_desktop_calendar_folder", {
        dataFolder,
        relativePath,
        newName,
    });
}

export async function deleteDesktopCalendarFolder(
    dataFolder: string,
    relativePath: string
): Promise<void> {
    await invoke("delete_desktop_calendar_folder", {
        dataFolder,
        relativePath,
    });
}

export async function openDesktopPath(
    dataFolder: string,
    relativePath = ""
): Promise<void> {
    await invoke("open_desktop_path", {
        dataFolder,
        relativePath,
    });
}

export async function openDesktopExternalTarget(target: string): Promise<void> {
    await invoke("open_desktop_external_target", { target });
}

export async function openDesktopLinkedPath(
    dataFolder: string,
    eventRelativePath: string,
    target: string
): Promise<void> {
    let decodedTarget = target;
    try {
        decodedTarget = decodeURIComponent(target);
    } catch {
        // Keep the original path if it is not valid percent-encoded text.
    }

    await invoke("open_desktop_linked_path", {
        dataFolder,
        eventRelativePath,
        target: decodedTarget,
    });
}

export interface DesktopDetectedVaultDto {
    path: string;
    name: string;
}

export async function discoverDesktopObsidianVaults(
    rootPaths: string[]
): Promise<DesktopDetectedVaultDto[]> {
    return invoke<DesktopDetectedVaultDto[]>(
        "discover_desktop_obsidian_vaults",
        { rootPaths }
    );
}

export interface DesktopVaultNoteDto {
    vaultPath: string;
    vaultName: string;
    relativePath: string;
    fileName: string;
    title: string;
}

export interface DesktopAttachmentDto {
    fileName: string;
    relativePath: string;
    markdownPath: string;
}

export async function searchDesktopVaultNotes(
    vaultPaths: string[],
    query: string,
    limit = 40
): Promise<DesktopVaultNoteDto[]> {
    return invoke<DesktopVaultNoteDto[]>("search_desktop_vault_notes", {
        vaultPaths,
        query,
        limit,
    });
}

export async function copyDesktopAttachment(
    dataFolder: string,
    eventRelativePath: string,
    sourcePath: string
): Promise<DesktopAttachmentDto> {
    return invoke<DesktopAttachmentDto>("copy_desktop_attachment", {
        dataFolder,
        eventRelativePath,
        sourcePath,
    });
}

/**
 * Écrit une pièce jointe à partir de son contenu, et non d'un fichier existant.
 *
 * C'est le cas du presse-papiers : une capture d'écran n'est nulle part sur le
 * disque, elle n'a que des octets. Le natif s'occupe du reste, exactement comme
 * pour un fichier choisi dans une boîte de dialogue.
 */
export async function writeDesktopAttachment(
    dataFolder: string,
    eventRelativePath: string,
    fileName: string,
    contents: Uint8Array
): Promise<DesktopAttachmentDto> {
    return invoke<DesktopAttachmentDto>("write_desktop_attachment", {
        dataFolder,
        eventRelativePath,
        fileName,
        contents: Array.from(contents),
    });
}

/**
 * Le contenu d'une pièce jointe, en base64.
 *
 * La WebView ne peut pas ouvrir un `file://` — c'est tout l'intérêt de son
 * isolement — donc une vignette se demande fichier par fichier plutôt qu'en
 * ouvrant l'accès au disque pour toute l'application. Le natif refuse ce qui
 * sort du dossier de données et ce qui est trop gros pour tenir en mémoire.
 */
export async function readDesktopAttachment(
    dataFolder: string,
    relativePath: string
): Promise<string> {
    return invoke<string>("read_desktop_attachment", {
        dataFolder,
        relativePath,
    });
}

export async function fetchDesktopIcs(url: string): Promise<string> {
    return invoke<string>("fetch_desktop_ics", { url });
}

/**
 * Fetches a page's source, for naming a link after what it points at.
 *
 * Goes through the same native command the calendar subscriptions use: it is a
 * plain HTTP GET made outside the WebView, which is the point — a request made
 * inside it is refused by every site that has not chosen to allow this one.
 * The command's name is about the first thing it was asked to fetch, not about
 * what it does.
 *
 * It reads the whole response, so this is worth doing once per link and never
 * on a loop. The caller stops waiting long before the request itself gives up.
 */
export async function fetchDesktopPage(url: string): Promise<string> {
    return invoke<string>("fetch_desktop_ics", { url });
}

/**
 * Où mène vraiment un lien de partage.
 *
 * `vm.tiktok.com/ZN88…` est un billet indiquant une adresse. On la cherchait
 * dans la page — `og:url` —, ce qui suppose que le site serve une vraie page à
 * un client HTTP ordinaire ; il sert sa porte d'entrée, dont l'adresse
 * canonique est sa page d'accueil. La redirection, elle, mène à la vidéo.
 *
 * La coque plus ancienne, et le bureau, ne connaissent pas la commande : on
 * rend alors l'adresse inchangée plutôt que d'échouer — c'est exactement ce
 * qu'on savait d'elle avant.
 */
export async function resolveDesktopUrl(url: string): Promise<string> {
    try {
        return await invoke<string>("fetch_desktop_final_url", { url });
    } catch {
        return url;
    }
}
