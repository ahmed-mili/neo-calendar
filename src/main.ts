import { Notice, Plugin, TFile, TFolder } from "obsidian";
import {
    CalendarView,
    NEO_CALENDAR_SIDEBAR_VIEW_TYPE,
    NEO_CALENDAR_VIEW_TYPE,
} from "./ui/view";
import {
    DEFAULT_SETTINGS,
    NeoCalendarSettings,
    NeoCalendarSettingTab,
} from "./ui/settings";
import { PLUGIN_SLUG, NeoEvent } from "./types";
import EventCache from "./core/EventCache";
import { ObsidianIO } from "./ObsidianAdapter";
import FullNoteCalendar from "./calendars/FullNoteCalendar";
import DailyNoteCalendar from "./calendars/DailyNoteCalendar";
import ICSCalendar from "./calendars/ICSCalendar";
import AutoCalendar from "./calendars/AutoCalendar";
import { loadPresetCatalogue } from "./calendars/auto/presets";
import { migrateCalendarSources } from "./calendars/auto/migrate";
import CalDAVCalendar from "./calendars/CalDAVCalendar";
import { setPluginApp } from "./ui/suggest/pluginApp";

/** One deletion that can be undone: the event, and the calendar it came from. */
type UndoEntry = { calendarId: string; event: NeoEvent };

/** Views the user can switch to, and the command that gets them there. */
const VIEW_COMMANDS = [
    { id: "view-day", name: "Switch to Day View", view: "day" },
    { id: "view-week", name: "Switch to Week View", view: "week" },
    { id: "view-month", name: "Switch to Month View", view: "month" },
    { id: "view-3days", name: "Switch to 3-Day View", view: "3days" },
    { id: "view-list", name: "Switch to List View", view: "list" },
];

/**
 * Rapid metadata changes are batched: Obsidian's auto-save fires a rename and a
 * rewrite back to back, and reacting to each in turn makes the event flicker.
 */
const METADATA_DEBOUNCE_MS = 200;

export default class NeoCalendarPlugin extends Plugin {
    settings: NeoCalendarSettings = DEFAULT_SETTINGS;

    /**
     * A tiny command bus between Obsidian and the mounted React tree. Commands
     * are registered here but handled over there, and we hold no ref to the
     * component, so they talk by name instead.
     */
    private calendarEventHandlers: Map<string, (data: any) => void> = new Map();

    /**
     * Deleted events, newest last. Each entry is a whole BATCH restored
     * together, so deleting a multi-selection undoes as one action.
     */
    private undoStack: UndoEntry[][] = [];

    cache: EventCache = new EventCache({
        local: (info) =>
            info.type === "local"
                ? new FullNoteCalendar(
                      new ObsidianIO(this.app),
                      info.color,
                      info.directory
                  )
                : null,
        dailynote: (info) =>
            info.type === "dailynote"
                ? new DailyNoteCalendar(
                      new ObsidianIO(this.app),
                      info.color,
                      info.heading
                  )
                : null,
        ical: (info) =>
            info.type === "ical"
                ? new ICSCalendar(info.color, info.url, info.name)
                : null,
        auto: (info) =>
            info.type === "auto"
                ? new AutoCalendar(
                      info.color,
                      info.id,
                      info.name,
                      info.icon,
                      info.rules,
                      new Date().getFullYear()
                  )
                : null,
        // Superseded by `auto`; migrated on load, so nothing to build here.
        holidays: () => null,
        caldav: (info) =>
            info.type === "caldav"
                ? new CalDAVCalendar(
                      info.color,
                      info.name,
                      {
                          type: "basic",
                          username: info.username,
                          password: info.password,
                      },
                      info.url,
                      info.homeUrl
                  )
                : null,
        FOR_TEST_ONLY: () => null,
    });

    ///
    // Command bus
    ///

    emitCalendarEvent(event: string, data: any) {
        this.calendarEventHandlers.get(event)?.(data);
    }

    /** @returns an unsubscribe function. */
    onCalendarEvent(event: string, handler: (data: any) => void) {
        this.calendarEventHandlers.set(event, handler);
        return () => this.calendarEventHandlers.delete(event);
    }

    ///
    // Undo
    ///

    pushUndo(entry: UndoEntry) {
        this.undoStack.push([entry]);
    }

    /** Record several deletions as a single undoable action. */
    pushUndoBatch(entries: UndoEntry[]) {
        if (entries.length > 0) {
            this.undoStack.push(entries);
        }
    }

    /** Undo the last deletion and report the outcome. */
    async undoLastDeletion(): Promise<void> {
        new Notice(
            (await this.popUndo()) ? "Event restored." : "Nothing to undo."
        );
    }

    async popUndo(): Promise<boolean> {
        const batch = this.undoStack.pop();
        if (!batch || batch.length === 0) {
            return false;
        }
        const failed: UndoEntry[] = [];
        let restored = 0;
        for (const entry of batch) {
            try {
                await this.cache.addEvent(entry.calendarId, entry.event);
                restored++;
            } catch (e) {
                console.error("Undo failed:", e);
                failed.push(entry);
            }
        }
        // Whatever couldn't be restored stays undoable: the stack holds the
        // only remaining copy of a deleted event, so dropping the whole batch
        // on the first failure would lose the rest of it for good.
        if (failed.length > 0) {
            this.undoStack.push(failed);
        }
        // The view may now disagree with the store — rebuild it.
        this.cache.resync();
        return restored > 0;
    }

    ///
    // Views
    ///

    async activateView() {
        const open = this.app.workspace
            .getLeavesOfType(NEO_CALENDAR_VIEW_TYPE)
            .filter((leaf) => (leaf.view as CalendarView).inSidebar === false);

        if (open.length === 0) {
            await this.app.workspace.getLeaf("tab").setViewState({
                type: NEO_CALENDAR_VIEW_TYPE,
                active: true,
            });
            return;
        }
        await Promise.all(
            open.map((leaf) => (leaf.view as CalendarView).onOpen())
        );
    }

    ///
    // Lifecycle
    ///

    async onload() {
        await this.loadSettings();
        setPluginApp(this.app);
        this.cache.reset(this.settings.calendarSources);

        this.registerVaultHooks();

        this.registerView(
            NEO_CALENDAR_VIEW_TYPE,
            (leaf) => new CalendarView(leaf, this, false)
        );
        this.registerView(
            NEO_CALENDAR_SIDEBAR_VIEW_TYPE,
            (leaf) => new CalendarView(leaf, this, true)
        );

        this.addRibbonIcon("calendar-glyph", "Open Neo Calendar", async () => {
            await this.activateView();
        });
        this.addSettingTab(new NeoCalendarSettingTab(this.app, this));

        this.registerCommands();

        (this.app.workspace as any).registerHoverLinkSource(PLUGIN_SLUG, {
            display: "Neo Calendar",
            defaultMod: true,
        });
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(NEO_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(NEO_CALENDAR_SIDEBAR_VIEW_TYPE);
    }

    private registerVaultHooks() {
        // Coalesce bursts of changes to the same file into one re-read.
        const pending = new Map<string, number>();
        this.registerEvent(
            this.app.metadataCache.on("changed", (file: TFile) => {
                const queued = pending.get(file.path);
                if (queued !== undefined) {
                    clearTimeout(queued);
                }
                pending.set(
                    file.path,
                    window.setTimeout(() => {
                        pending.delete(file.path);
                        this.cache.fileUpdated(file);
                    }, METADATA_DEBOUNCE_MS)
                );
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file instanceof TFile) {
                    // Forget the old path AND re-read the note at the new one:
                    // a rename leaves the contents alone, so no "changed" ever
                    // fires and nothing else would re-index it.
                    this.cache.fileRenamed(oldPath, file);
                } else if (file instanceof TFolder) {
                    this.onFolderRenamed(oldPath, file.path);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (file instanceof TFile) {
                    this.cache.deleteEventsAtPath(file.path);
                }
            })
        );
    }

    /**
     * A local calendar is configured by folder path, so moving that folder — or
     * any folder above it — has to be followed through into the settings, or the
     * calendar silently points at a path that no longer exists.
     */
    private onFolderRenamed(oldPath: string, newPath: string) {
        const sources = this.settings.calendarSources;
        let changed = false;

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            if (source.type !== "local") {
                continue;
            }
            if (source.directory === oldPath) {
                sources[i] = { ...source, directory: newPath };
                changed = true;
            } else if (source.directory.startsWith(oldPath + "/")) {
                sources[i] = {
                    ...source,
                    directory: newPath + source.directory.slice(oldPath.length),
                };
                changed = true;
            }
        }

        if (changed) {
            this.saveSettings();
        }
    }

    private registerCommands() {
        // Aucune de ces commandes ne declare de `hotkeys`. Les touches nues du
        // calendrier (T, C, W, [, ]...) sont cablees dans
        // ui/calendar/useKeyboardShortcuts.ts, actives seulement quand une
        // feuille du calendrier a le focus. Une touche nue declaree ici serait
        // inerte dans le calendrier (le Scope du calendrier passe avant le
        // gestionnaire de raccourcis d'Obsidian) tout en avalant le caractere
        // partout ailleurs, puisque executeCommand renvoie true des que le
        // callback a ete appele et qu'Obsidian fait alors preventDefault.
        // Les commandes restent listees, invocables par la palette et
        // remappables a la main par l'utilisateur.
        this.addCommand({
            id: "neo-calendar-new-event",
            name: "New Event",
            callback: () => {
                this.app.workspace
                    .getLeavesOfType(NEO_CALENDAR_VIEW_TYPE)
                    .forEach((leaf) =>
                        this.app.workspace.setActiveLeaf(leaf, { focus: true })
                    );
            },
        });

        for (const { id, name, view } of VIEW_COMMANDS) {
            this.addCommand({
                id: `neo-calendar-${id}`,
                name,
                callback: () => {
                    this.settings.initialView.desktop = view;
                    this.emitCalendarEvent("view-change", view);
                },
            });
        }

        for (const [id, name, event] of [
            ["neo-calendar-align-today", "Align today left", "align-today"],
            ["neo-calendar-go-today", "Go to Today", "go-today"],
            ["neo-calendar-go-prev", "Go to Previous Period", "go-prev"],
            ["neo-calendar-go-next", "Go to Next Period", "go-next"],
            ["neo-calendar-toggle-sidebar", "Toggle Sidebar", "toggle-sidebar"],
        ]) {
            this.addCommand({
                id,
                name,
                callback: () => this.emitCalendarEvent(event, undefined),
            });
        }

        this.addCommand({
            id: "neo-calendar-open",
            name: "Open Calendar",
            callback: () => {
                this.activateView();
            },
        });

        this.addCommand({
            id: "neo-calendar-open-sidebar",
            name: "Open in sidebar",
            callback: () => {
                const alreadyOpen = this.app.workspace.getLeavesOfType(
                    NEO_CALENDAR_SIDEBAR_VIEW_TYPE
                ).length;
                if (alreadyOpen) {
                    return;
                }
                this.app.workspace.getRightLeaf(false).setViewState({
                    type: NEO_CALENDAR_SIDEBAR_VIEW_TYPE,
                });
            },
        });

        this.addCommand({
            id: "neo-calendar-revalidate",
            name: "Revalidate remote calendars",
            callback: () => this.cache.revalidateRemoteCalendars(true),
        });

        this.addCommand({
            id: "neo-calendar-reset",
            name: "Reset Event Cache",
            callback: () => {
                this.cache.reset(this.settings.calendarSources);
                this.app.workspace.detachLeavesOfType(NEO_CALENDAR_VIEW_TYPE);
                this.app.workspace.detachLeavesOfType(
                    NEO_CALENDAR_SIDEBAR_VIEW_TYPE
                );
                new Notice("Neo Calendar has been reset.");
            },
        });

        // No default hotkey: Mod+Z is bound to Obsidian's own editor undo. A
        // command hotkey is registered globally and would swallow Ctrl/Cmd+Z in
        // every note. The calendar binds Mod+Z through a keymap Scope that is
        // only pushed while a calendar leaf is active (see useKeyboardShortcuts).
        this.addCommand({
            id: "neo-calendar-undo",
            name: "Undo Event Deletion",
            callback: () => this.undoLastDeletion(),
        });
    }

    ///
    // Settings
    ///

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
        await this.migrateAutoCalendars();
    }

    /**
     * Bring pre-`auto` holiday sources up to date. Needs the preset file, so a
     * failure here (missing file, unreadable JSON) leaves the source alone to be
     * migrated on a later start rather than losing the user's calendar.
     */
    private async migrateAutoCalendars() {
        if (!this.settings.calendarSources.some((s) => s.type === "holidays")) {
            return;
        }
        try {
            const catalogue = await loadPresetCatalogue(
                this.app,
                this.manifest.dir ?? ""
            );
            const { sources, changed } = migrateCalendarSources(
                this.settings.calendarSources,
                catalogue
            );
            if (changed) {
                this.settings.calendarSources = sources;
                await this.saveData(this.settings);
            }
        } catch (e) {
            console.error("Neo Calendar: holiday preset migration failed", e);
        }
    }

    /** Changing a source invalidates everything, so this is a full rebuild. */
    async saveSettings() {
        await this.saveData(this.settings);
        this.cache.reset(this.settings.calendarSources);
        await this.cache.populate();
        this.cache.resync();
    }
}
