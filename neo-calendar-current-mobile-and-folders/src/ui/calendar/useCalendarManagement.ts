import * as React from "react";
import { useCallback } from "react";
import {
    App,
    FileSystemAdapter,
    Modal,
    Notice,
    Setting,
    TFolder,
} from "obsidian";
import { CalendarInfo, makeDefaultPartialCalendarSource } from "../../types";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import ReactModal from "../ReactModal";
import { AddLocalCalendar } from "../components/AddLocalCalendar";

/**
 * Force the File Explorer window showing `fullPath` to the foreground (Windows).
 *
 * `shell.openPath` opens the folder inside the already-running `explorer.exe`,
 * which does NOT inherit foreground rights from Obsidian — so the window usually
 * appears BEHIND the current one. We locate that specific window by its folder
 * path (via Shell.Application) and raise it with Win32: `AttachThreadInput` to
 * the current foreground thread defeats the foreground lock, then
 * `SetForegroundWindow`/`BringWindowToTop`. Runs hidden and polls briefly, since
 * the window takes a moment to appear. Best-effort: any failure is swallowed
 * (the folder has already opened regardless).
 */
function foregroundExplorerWindow(fullPath: string): void {
    let cp: any;
    try {
        // Windows-only (uses powershell.exe + Shell.Application); no-op elsewhere.
        if ((window as any).require?.("os")?.platform() !== "win32") return;
        cp = (window as any).require?.("child_process");
    } catch {
        cp = undefined;
    }
    if (!cp || typeof cp.execFile !== "function") return;

    // Single-quoted PS literal — escape embedded quotes; separators normalised
    // to backslash on both sides so the compare is robust to either style.
    const target = fullPath.replace(/'/g, "''");
    const script = [
        `$ErrorActionPreference='SilentlyContinue'`,
        `$target='${target}'.Replace('/','\\').TrimEnd('\\')`,
        `Add-Type -Namespace Fg -Name Win -MemberDefinition @'`,
        `[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);`,
        `[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);`,
        `[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();`,
        `[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);`,
        `[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);`,
        `[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);`,
        `[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();`,
        `'@`,
        `function Bring($hwnd){$ptr=[IntPtr]$hwnd;[Fg.Win]::ShowWindow($ptr,9)|Out-Null;$fg=[Fg.Win]::GetForegroundWindow();$t=[Fg.Win]::GetWindowThreadProcessId($fg,[IntPtr]::Zero);$c=[Fg.Win]::GetCurrentThreadId();[Fg.Win]::AttachThreadInput($c,$t,$true)|Out-Null;[Fg.Win]::BringWindowToTop($ptr)|Out-Null;[Fg.Win]::SetForegroundWindow($ptr)|Out-Null;[Fg.Win]::AttachThreadInput($c,$t,$false)|Out-Null}`,
        // Document.Folder.Self.Path is the real decoded path; LocationURL leaves
        // accented chars percent-encoded (é -> %E9) and would never match.
        `for($i=0;$i -lt 15;$i++){$sh=New-Object -ComObject Shell.Application;foreach($w in $sh.Windows()){try{$p=$null;try{$p=$w.Document.Folder.Self.Path}catch{};if(-not $p){try{$p=([Uri]$w.LocationURL).LocalPath}catch{}};if($p){$p=$p.Replace('/','\\').TrimEnd('\\');if($p -ieq $target){Bring $w.HWND;exit}}}catch{}}Start-Sleep -Milliseconds 200}`,
    ].join("\n");

    try {
        // -EncodedCommand (UTF-16LE base64) sidesteps all shell-quoting issues.
        const NodeBuffer = (window as any).require("buffer").Buffer;
        const encoded = NodeBuffer.from(script, "utf16le").toString("base64");
        cp.execFile(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-EncodedCommand",
                encoded,
            ],
            { windowsHide: true },
            () => {
                /* best-effort — ignore result */
            }
        );
    } catch {
        /* spawning failed — the folder still opened, so nothing to recover */
    }
}

/**
 * Reveal a vault folder in the OS file explorer. Desktop-only (needs the real
 * filesystem adapter + Electron's shell); shows a Notice otherwise.
 */
function openFolderInSystem(app: App, relPath: string | undefined) {
    if (!relPath) {
        new Notice("No folder is set for this calendar.");
        return;
    }
    const adapter = app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
        new Notice("Opening folders is only available on desktop.");
        return;
    }
    const fullPath =
        typeof (adapter as any).getFullPath === "function"
            ? (adapter as any).getFullPath(relPath)
            : `${adapter.getBasePath()}/${relPath}`;
    const shell = (window as any).require?.("electron")?.shell;
    if (!shell || typeof shell.openPath !== "function") {
        new Notice("Could not open the file explorer.");
        return;
    }
    Promise.resolve(shell.openPath(fullPath))
        .then((err: string) => {
            if (err) new Notice(`Could not open folder: ${err}`);
        })
        .catch(() => {
            /* openPath rejected — nothing more to do */
        });
    // openPath opens the folder inside the long-running explorer.exe, which
    // doesn't get foreground rights, so on Windows the window would otherwise
    // appear behind Obsidian. Raise the specific folder window ourselves.
    foregroundExplorerWindow(fullPath);
}

/**
 * Small modal with a text field to edit a remote calendar's feed URL (the
 * "Edit link" menu action for ical calendars). Calls `onSubmit` with the
 * trimmed value; an empty submit is ignored by the caller.
 */
function openEditIcsLink(
    app: App,
    currentUrl: string,
    onSubmit: (url: string) => void
): void {
    class EditLinkModal extends Modal {
        private value = currentUrl;

        onOpen(): void {
            const { contentEl } = this;
            contentEl.createEl("h3", { text: "Edit calendar link" });
            const commit = () => {
                onSubmit(this.value.trim());
                this.close();
            };
            new Setting(contentEl).setName("Feed URL").addText((text) => {
                text.setValue(currentUrl)
                    .setPlaceholder("https://example.com/feed.ics")
                    .onChange((v) => (this.value = v));
                text.inputEl.style.width = "100%";
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") commit();
                });
                window.setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                }, 0);
            });
            new Setting(contentEl).addButton((btn) =>
                btn.setButtonText("Save").setCta().onClick(commit)
            );
        }

        onClose(): void {
            this.contentEl.empty();
        }
    }
    new EditLinkModal(app).open();
}

const WEBCAL_SCHEME = "webcal";
/** ICSCalendar normalises `webcal://` → `https://` for its identifier, so a
    settings `url` must be normalised the same way before matching a cache id. */
function normalizeIcsUrl(url: string): string {
    return url.startsWith(WEBCAL_SCHEME)
        ? "https" + url.slice(WEBCAL_SCHEME.length)
        : url;
}

/**
 * Map a cache calendar id back to its settings source index.
 *
 * The cache id is `${type}::${identifier}` (see `Calendar.id`): the identifier
 * is the directory (local), the heading (dailynote) or the URL (ical/caldav).
 * Matching the raw id against `directory`/`url` fails — the id carries the
 * `local::`/`ical::` prefix, and an ical id uses the https-normalised URL while
 * settings may store the original `webcal://`. Reconstruct the identifier and
 * compare per type.
 */
function findSourceIndexById(sources: any[], calendarId: string): number {
    const sep = calendarId.indexOf("::");
    const type = sep >= 0 ? calendarId.slice(0, sep) : "";
    const ident = sep >= 0 ? calendarId.slice(sep + 2) : calendarId;
    return sources.findIndex((s: any) => {
        if (s.type !== type) return false;
        if (s.type === "local") return s.directory === ident;
        if (s.type === "dailynote") return s.heading === ident;
        if (s.type === "ical") return normalizeIcsUrl(s.url) === ident;
        if (s.type === "caldav") return s.url === ident;
        return false;
    });
}

interface UseCalendarManagementParams {
    settings: any;
    plugin: any;
    cache: any;
    setHiddenCalendars: (hidden: Set<string>) => void;
    invalidateCache: () => void;
}

export function useCalendarManagement({
    settings,
    plugin,
    cache,
    setHiddenCalendars,
    invalidateCache,
}: UseCalendarManagementParams) {
    const handleAddCalendar = useCallback(() => {
        const app = plugin.app;
        const calendarRootFolder = settings.calendarRootFolder;

        let directories = app.vault
            .getAllLoadedFiles()
            .filter((f: any) => f instanceof TFolder)
            .map((f: any) => f.path);

        if (calendarRootFolder) {
            directories = directories.filter(
                (dir: string) =>
                    dir.startsWith(calendarRootFolder + "/") &&
                    !dir.slice(calendarRootFolder.length + 1).includes("/")
            );
        }

        const usedDirectories = settings.calendarSources
            .map((s: any) => s.type === "local" && s.directory)
            .filter((s: string | false): s is string => !!s);

        const availableDirectories = directories.filter(
            (dir: string) => usedDirectories.indexOf(dir) === -1
        );

        const modal = new ReactModal(app, async () => {
            const defaultColor =
                makeDefaultPartialCalendarSource("local").color || "#7c5cff";

            return React.createElement(AddLocalCalendar, {
                directories: availableDirectories,
                calendarRootFolder: calendarRootFolder || undefined,
                defaultColor,
                createFolder: async (path: string) => {
                    const folder = app.vault.getAbstractFileByPath(path);
                    if (folder instanceof TFolder) return folder;
                    try {
                        await app.vault.createFolder(path);
                        return app.vault.getAbstractFileByPath(
                            path
                        ) as TFolder | null;
                    } catch (e) {
                        new Notice(
                            `Could not create folder "${path}": ${
                                e instanceof Error ? e.message : String(e)
                            }`
                        );
                        return null;
                    }
                },
                onCreate: async (source: CalendarInfo) => {
                    settings.calendarSources.push(source);
                    await plugin.saveSettings();
                    await plugin.activateView();
                    modal.close();
                },
            });
        });
        modal.open();
    }, [settings, plugin]);

    const handleRenameCalendar = useCallback(
        async (calendarId: string, newName: string) => {
            const idx = findSourceIndexById(
                settings.calendarSources,
                calendarId
            );
            if (idx === -1) return;
            const source = settings.calendarSources[idx];

            // Remote calendars (ical/caldav) have no folder — renaming just sets
            // a friendly display name stored alongside the source.
            if (source.type !== "local") {
                settings.calendarSources[idx] = { ...source, name: newName };
                await plugin.saveSettings();
                await plugin.activateView();
                return;
            }

            const oldDirectory = source.directory;
            const lastSlash = oldDirectory.lastIndexOf("/");
            const parentPath =
                lastSlash === -1 ? "" : oldDirectory.slice(0, lastSlash);
            const newDirectory = parentPath
                ? `${parentPath}/${newName}`
                : newName;

            const folder = plugin.app.vault.getAbstractFileByPath(oldDirectory);
            if (folder) {
                try {
                    await plugin.app.fileManager.renameFile(
                        folder,
                        newDirectory
                    );
                } catch (e) {
                    new Notice(
                        `Could not rename folder: ${
                            e instanceof Error ? e.message : String(e)
                        }`
                    );
                    return;
                }
            }

            settings.calendarSources[idx] = {
                ...source,
                directory: newDirectory,
            };
            await plugin.saveSettings();
            await plugin.activateView();
        },
        [settings, plugin]
    );

    // Change a remote (ical) calendar's feed URL. Opens a prompt prefilled with
    // the current URL; on submit, rebuilds the calendar (its id changes) and
    // refetches via saveSettings.
    const handleEditCalendarLink = useCallback(
        (calendarId: string) => {
            const idx = findSourceIndexById(
                settings.calendarSources,
                calendarId
            );
            if (idx === -1) return;
            const current = settings.calendarSources[idx].url || "";
            openEditIcsLink(plugin.app, current, async (newUrl) => {
                if (!newUrl || newUrl === current) return;
                try {
                    // Validate; accept webcal:// (the calendar normalises it).
                    new URL(newUrl.replace(/^webcal:/i, "https:"));
                } catch {
                    new Notice("That doesn't look like a valid URL.");
                    return;
                }
                // Re-resolve the index: settings may have changed while open.
                const i = findSourceIndexById(
                    settings.calendarSources,
                    calendarId
                );
                if (i === -1) return;
                settings.calendarSources[i] = {
                    ...settings.calendarSources[i],
                    url: newUrl,
                };
                await plugin.saveSettings();
                await plugin.activateView();
            });
        },
        [settings, plugin]
    );

    const handleDeleteCalendar = useCallback(
        async (calendarId: string) => {
            const idx = findSourceIndexById(
                settings.calendarSources,
                calendarId
            );
            if (idx === -1) return;
            settings.calendarSources.splice(idx, 1);

            const newHidden = settings.hiddenCalendars.filter(
                (id: string) => id !== calendarId
            );
            settings.hiddenCalendars = newHidden;
            setHiddenCalendars(new Set(newHidden));

            // saveSettings() — not a bare saveData() — because removing a source
            // has to empty the store of its events too. Writing the settings
            // alone left every event of the deleted calendar in the cache, and
            // therefore on screen, until the plugin was reloaded. Every other
            // handler here already goes through saveSettings.
            await plugin.saveSettings();
            await plugin.activateView();
        },
        [settings, plugin, setHiddenCalendars]
    );

    // Persisting the colour writes data.json; during a colour-picker drag that
    // fires many times a second. Update the live colour every call (instant
    // preview) but debounce the disk write.
    const colorSaveTimer = React.useRef<number | null>(null);
    const handleColorChange = useCallback(
        (calendarId: string, color: string) => {
            const idx = findSourceIndexById(
                settings.calendarSources,
                calendarId
            );
            if (idx === -1) return;

            settings.calendarSources[idx] = {
                ...settings.calendarSources[idx],
                color,
            };
            const cal = cache.getCalendarById(calendarId);
            if (cal) cal.color = color;
            invalidateCache();

            if (colorSaveTimer.current !== null)
                window.clearTimeout(colorSaveTimer.current);
            colorSaveTimer.current = window.setTimeout(() => {
                plugin.saveData(plugin.settings);
                colorSaveTimer.current = null;
            }, 250);
        },
        [settings, plugin, cache, invalidateCache]
    );

    // Persist a new calendar order. `orderedIds` are cache ids in their new
    // order; we rebuild `settings.calendarSources` to match (keeping any source
    // the list doesn't cover, e.g. test-only, at the end), reorder the cache's
    // calendars in place (no re-parse/refetch) and re-render.
    const handleReorderCalendars = useCallback(
        (orderedIds: string[]) => {
            const sources = settings.calendarSources;
            const indices = orderedIds
                .map((id: string) => findSourceIndexById(sources, id))
                .filter((i: number) => i >= 0);
            const seen = new Set<number>(indices);
            const reordered = indices.map((i: number) => sources[i]);
            sources.forEach((s: any, i: number) => {
                if (!seen.has(i)) reordered.push(s);
            });
            settings.calendarSources = reordered;
            plugin.saveData(plugin.settings);
            cache.reorderCalendars(orderedIds);
            invalidateCache();
        },
        [settings, plugin, cache, invalidateCache]
    );

    const handleOpenCalendarFolder = useCallback(
        (calendarId: string) => {
            // calendarId is the cache id (e.g. "local::Calendars/Études"), not
            // the raw folder path — resolve the calendar to read its directory.
            const cal = cache.getCalendarById(calendarId);
            openFolderInSystem(plugin.app, cal?.directory);
        },
        [cache, plugin]
    );

    const handleOpenRootFolder = useCallback(() => {
        openFolderInSystem(plugin.app, settings.calendarRootFolder);
    }, [settings, plugin]);

    return {
        handleAddCalendar,
        handleRenameCalendar,
        handleEditCalendarLink,
        handleDeleteCalendar,
        handleColorChange,
        handleReorderCalendars,
        handleOpenCalendarFolder,
        handleOpenRootFolder,
    };
}
