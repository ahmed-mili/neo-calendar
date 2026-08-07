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

export async function fetchDesktopIcs(url: string): Promise<string> {
    return invoke<string>("fetch_desktop_ics", { url });
}
