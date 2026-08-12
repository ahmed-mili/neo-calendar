import NeoCalendarPlugin from "../main";
import {
    App,
    Menu,
    Notice,
    PluginSettingTab,
    Setting,
    setIcon,
    TFile,
    TFolder,
} from "obsidian";
import { makeDefaultPartialCalendarSource, CalendarInfo } from "../types";
import { CalendarSettings } from "./components/CalendarSetting";
import { AddCalendarSource } from "./components/AddCalendarSource";
import * as ReactDOM from "react-dom";
import { createElement } from "react";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";
import ReactModal from "./ReactModal";
import { importCalendars } from "src/calendars/parsing/caldav/import";
import { FolderSuggest } from "./suggest/FolderSuggest";
import { calendarIdOf } from "./calendar/autoTargets";
import "./settings.css";

///
// Settings shape
///

export interface NeoCalendarSettings {
    calendarSources: CalendarInfo[];
    defaultCalendar: number;
    firstDay: number;
    initialView: {
        desktop: string;
        mobile: string;
    };
    timeFormat24h: boolean;
    clickToCreateEventFromMonthView: boolean;
    /** Let the day grid come to rest between two days instead of on whole ones. */
    freeScroll: boolean;
    hiddenCalendars: string[];
    secondaryTimezones: string[];
    /** The main hours column's zone. Undefined means the system's own. */
    primaryTimezone?: string;
    /**
     * The system zone as of the last look, to tell a trip from a first run.
     * Undefined on a fresh install: there is no "before" to compare against,
     * so the first launch adopts what it finds without asking.
     */
    lastSeenSystemTimezone?: string;
    /** Most-recent-first, to float them to the top of the timezone picker. */
    recentTimezones?: string[];
    /** Display label per secondary timezone (IANA name -> label). */
    timezoneLabels: Record<string, string>;
    defaultEventsAsTasks: boolean;
    calendarRootFolder: string;
    allDayCollapsed: boolean;
}

export const DEFAULT_SETTINGS: NeoCalendarSettings = {
    calendarSources: [],
    defaultCalendar: 0,
    firstDay: 0,
    initialView: {
        desktop: "week",
        mobile: "3days",
    },
    timeFormat24h: false,
    clickToCreateEventFromMonthView: true,
    freeScroll: false,
    hiddenCalendars: [],
    secondaryTimezones: [],
    timezoneLabels: {},
    // A calendar entry is an event unless you say otherwise: most things you
    // put on a grid happen at a time rather than waiting to be done. The panel
    // now offers the choice on every event, so this is only the starting point.
    defaultEventsAsTasks: false,
    calendarRootFolder: "",
    allDayCollapsed: false,
};

const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const DESKTOP_VIEWS = {
    day: "Day",
    week: "Week",
    month: "Month",
    list: "List",
};
const MOBILE_VIEWS = { "3days": "3 Days", day: "Day", list: "List" };

const CALENDAR_KINDS = [
    { value: "local", label: "Full note" },
    { value: "dailynote", label: "Daily Note" },
    { value: "ical", label: "Remote (.ics format)" },
    { value: "auto", label: "Auto (public holidays)" },
];

///
// A themed replacement for <select>
///

type Option = { value: string; label: string };

/**
 * Give a Setting a dropdown that opens an Obsidian {@link Menu} instead of a
 * native `<select>`.
 *
 * A native select's open popup is drawn by the OS and is essentially unstylable
 * — bright system highlight, light background — which looks broken against a
 * dark theme. An Obsidian menu is just DOM, so it inherits the theme like
 * everything else. `setUseNativeMenu(false)` forces that even for users who
 * asked for native menus elsewhere.
 */
function addMenuSelect(
    setting: Setting,
    options: Option[],
    initial: string,
    onChange: (value: string) => void | Promise<void>
): Setting {
    let selected = initial;

    const button = setting.controlEl.createEl("button", {
        cls: "neo-dropdown-btn",
    });
    const label = button.createSpan({
        cls: "neo-dropdown-btn-label",
        text: options.find((o) => o.value === selected)?.label ?? "",
    });
    setIcon(
        button.createSpan({ cls: "neo-dropdown-btn-icon" }),
        "chevron-down"
    );

    // Obsidian closes an open menu on the button's mousedown — it counts as an
    // "outside" click — and the click handler would then reopen it right away,
    // so a second click would look like a no-op. Ignore a click that lands just
    // after the menu we opened was dismissed by that very same press.
    let closedAt = 0;
    const REOPEN_GUARD_MS = 200;

    button.addEventListener("click", () => {
        if (Date.now() - closedAt < REOPEN_GUARD_MS) {
            return;
        }

        const menu = new Menu();
        menu.setUseNativeMenu(false);
        menu.onHide(() => {
            closedAt = Date.now();
        });

        for (const option of options) {
            menu.addItem((item) => {
                item.setTitle(option.label);
                item.setChecked(option.value === selected);
                item.onClick(async () => {
                    selected = option.value;
                    label.setText(option.label);
                    await onChange(option.value);
                });
            });
        }

        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });

        // The menu is appended to <body>, so no ancestor selector can reach it.
        // Tag it, so only our dropdowns get the accent-filled "selected" row
        // (mirroring a native select's highlighted option) rather than a tick.
        (menu as Menu & { dom?: HTMLElement }).dom?.addClass(
            "neo-dropdown-menu"
        );
    });

    return setting;
}

///
// Adding a calendar
///

/** Folders directly inside `root` — a calendar's folder is never nested deeper. */
/* NEO_HIDDEN_FOLDER_HELPER_V3_START */
const hasHiddenDescendantFolder = (
    path: string,
    selectedRoot?: string
): boolean => {
    const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const root = selectedRoot?.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

    const relative =
        root && (normalized === root || normalized.startsWith(root + "/"))
            ? normalized.slice(root.length).replace(/^\/+/, "")
            : normalized;

    return relative
        .split("/")
        .filter(Boolean)
        .some((part) => part.startsWith("."));
};
/* NEO_HIDDEN_FOLDER_HELPER_V3_END */

const foldersUnder = (app: App, root?: string): string[] => {
    const all = app.vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder)
        .map((f) => f.path)
        .filter((path) => !hasHiddenDescendantFolder(path, root));

    if (!root) {
        return all;
    }
    return all.filter(
        (path) =>
            path.startsWith(root + "/") &&
            !path.slice(root.length + 1).includes("/")
    );
};

/** The headings of the daily-note template, to offer as event containers. */
const dailyNoteHeadings = (app: App): string[] => {
    let { template } = getDailyNoteSettings();
    if (!template) {
        return [];
    }
    if (!template.endsWith(".md")) {
        template += ".md";
    }
    const file = app.vault.getAbstractFileByPath(template);
    if (!(file instanceof TFile)) {
        return [];
    }
    return (
        app.metadataCache.getFileCache(file)?.headings?.map((h) => h.heading) ||
        []
    );
};

const createFolder = async (
    app: App,
    path: string
): Promise<TFolder | null> => {
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) {
        return existing;
    }
    try {
        await app.vault.createFolder(path);
        return app.vault.getAbstractFileByPath(path) as TFolder | null;
    } catch (e) {
        new Notice(
            `Could not create folder "${path}": ${
                e instanceof Error ? e.message : String(e)
            }`
        );
        return null;
    }
};

/**
 * The "add calendar" row: pick a kind, then fill the rest in a modal.
 *
 * Shared with the onboarding screen, which is why it takes its callbacks rather
 * than reaching into the settings tab.
 */
export function addCalendarButton(
    app: App,
    plugin: NeoCalendarPlugin,
    containerEl: HTMLElement,
    submitCallback: (source: CalendarInfo) => void,
    listUsedDirectories?: () => string[],
    calendarRootFolder?: string,
    disabled?: boolean
) {
    let kind: CalendarInfo["type"] = "local";
    const candidates = foldersUnder(app, calendarRootFolder);

    const setting = new Setting(containerEl)
        .setName("Calendars")
        .setDesc("Add calendar");

    addMenuSelect(setting, CALENDAR_KINDS, kind, (value) => {
        kind = value as CalendarInfo["type"];
    });

    return setting.addExtraButton((button) => {
        button.setTooltip("Add Calendar");
        button.setIcon("plus-with-circle");
        button.onClick(async () => {
            if (disabled) {
                new Notice(
                    "Set a Calendars root folder first before adding Full Note calendars."
                );
                return;
            }
            if (calendarRootFolder) {
                await createFolder(app, calendarRootFolder);
            }

            const modal = new ReactModal(app, async () => {
                await plugin.loadSettings();

                const used = (
                    listUsedDirectories ??
                    (() =>
                        plugin.settings.calendarSources
                            .map((s) => s.type === "local" && s.directory)
                            .filter((d): d is string => !!d))
                )();

                return createElement(AddCalendarSource, {
                    app,
                    source: makeDefaultPartialCalendarSource(kind),
                    // A folder can only back one calendar.
                    directories: candidates.filter(
                        (dir) => !used.includes(dir)
                    ),
                    headings: dailyNoteHeadings(app),
                    pluginDir: plugin.manifest.dir ?? "",
                    existingCalendars: plugin.settings.calendarSources.flatMap(
                        (source) => {
                            const id = calendarIdOf(source);
                            if (!id || source.type === "auto") return [];
                            const label =
                                source.type === "local"
                                    ? source.directory.slice(
                                          source.directory.lastIndexOf("/") + 1
                                      )
                                    : id;
                            return [{ id, name: label }];
                        }
                    ),
                    calendarRootFolder: calendarRootFolder || undefined,
                    createFolder: (path: string) => createFolder(app, path),
                    submit: async (source: CalendarInfo) => {
                        if (source.type === "caldav") {
                            // A CalDAV server exposes many calendars: add them all.
                            try {
                                const discovered = await importCalendars(
                                    {
                                        type: "basic",
                                        username: source.username,
                                        password: source.password,
                                    },
                                    source.url
                                );
                                discovered.forEach(submitCallback);
                            } catch (e) {
                                if (e instanceof Error) {
                                    new Notice(e.message);
                                }
                            }
                        } else if (
                            source.type === "auto" &&
                            plugin.settings.calendarSources.some(
                                (s) => s.type === "auto" && s.id === source.id
                            )
                        ) {
                            // Two auto calendars for one country would share an
                            // id, and one would silently shadow the other.
                            new Notice("That calendar is already added.");
                        } else {
                            submitCallback(source);
                        }
                        modal.close();
                    },
                });
            });
            modal.open();
        });
    });
}

///
// The settings tab
///

export class NeoCalendarSettingTab extends PluginSettingTab {
    plugin: NeoCalendarPlugin;

    constructor(app: App, plugin: NeoCalendarPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private async update(mutate: () => void) {
        mutate();
        await this.plugin.saveSettings();
    }

    /** Save, then rebuild the tab — for changes that alter what it shows. */
    private async updateAndRedraw(mutate: () => void) {
        await this.update(mutate);
        this.display();
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        this.renderPreferences(containerEl);
        this.renderTimezones(containerEl);
        this.renderCalendars(containerEl);
    }

    private renderPreferences(containerEl: HTMLElement) {
        const { settings } = this.plugin;
        containerEl.createEl("h2", { text: "Calendar Preferences" });

        const asOptions = (views: Record<string, string>): Option[] =>
            Object.entries(views).map(([value, label]) => ({ value, label }));

        addMenuSelect(
            new Setting(containerEl)
                .setName("Desktop Initial View")
                .setDesc("Choose the initial view range on desktop devices."),
            asOptions(DESKTOP_VIEWS),
            settings.initialView.desktop,
            (view) => this.update(() => (settings.initialView.desktop = view))
        );

        addMenuSelect(
            new Setting(containerEl)
                .setName("Mobile Initial View")
                .setDesc("Choose the initial view range on mobile devices."),
            asOptions(MOBILE_VIEWS),
            settings.initialView.mobile,
            (view) => this.update(() => (settings.initialView.mobile = view))
        );

        addMenuSelect(
            new Setting(containerEl)
                .setName("Starting Day of the Week")
                .setDesc("Choose what day of the week to start."),
            WEEKDAYS.map((day, index) => ({
                value: String(index),
                label: day,
            })),
            String(settings.firstDay),
            (day) => this.update(() => (settings.firstDay = Number(day)))
        );

        const toggles: [string, string, keyof NeoCalendarSettings][] = [
            [
                "24-hour format",
                "Display the time in a 24-hour format.",
                "timeFormat24h",
            ],
            [
                "Click on a day in month view to create event",
                "Switch off to open day view on click instead.",
                "clickToCreateEventFromMonthView",
            ],
            [
                "Free scrolling",
                "Off, one swipe turns one day and the grid lands on it, so you are never left looking at two half columns. On, the days scroll freely and stay wherever you leave them.",
                "freeScroll",
            ],
            [
                "New events are tasks by default",
                'When enabled, new entries start as tasks with status "À faire" (todo). Either way, the event panel lets you switch between Event and Task at any time.',
                "defaultEventsAsTasks",
            ],
        ];

        for (const [name, desc, key] of toggles) {
            new Setting(containerEl)
                .setName(name)
                .setDesc(desc)
                .addToggle((toggle) => {
                    toggle.setValue(settings[key] as boolean);
                    toggle.onChange((value) =>
                        this.update(() => ((settings[key] as boolean) = value))
                    );
                });
        }
    }

    private renderTimezones(containerEl: HTMLElement) {
        const { settings } = this.plugin;
        containerEl.createEl("h2", { text: "Secondary Timezones" });

        // Hold onto the input itself. Finding it again by CSS selector was
        // fragile — and in fact broken, since the row it looked for is not the
        // container's last child once the calendar list is rendered below it.
        let input: HTMLInputElement | null = null;

        const add = async () => {
            const zone = input?.value.trim();
            if (!zone) {
                return;
            }
            if (settings.secondaryTimezones.includes(zone)) {
                new Notice(`"${zone}" is already shown.`);
                return;
            }
            await this.updateAndRedraw(() =>
                settings.secondaryTimezones.push(zone)
            );
        };

        new Setting(containerEl)
            .setName("Add secondary timezone")
            .setDesc("Display an extra time column in week/day/3-day views.")
            .addText((text) => {
                input = text.inputEl;
                text.setPlaceholder("e.g. America/New_York");
                text.inputEl.style.width = "200px";
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                    }
                });
            })
            .addExtraButton((button) =>
                button
                    .setIcon("plus-with-circle")
                    .setTooltip("Add timezone")
                    .onClick(add)
            );

        for (const zone of settings.secondaryTimezones) {
            new Setting(containerEl).setName(zone).addExtraButton((button) =>
                button
                    .setIcon("cross")
                    .setTooltip("Remove")
                    .onClick(() =>
                        this.updateAndRedraw(() => {
                            settings.secondaryTimezones =
                                settings.secondaryTimezones.filter(
                                    (t) => t !== zone
                                );
                        })
                    )
            );
        }
    }

    private renderCalendars(containerEl: HTMLElement) {
        const { settings } = this.plugin;
        containerEl.createEl("h2", { text: "Manage Calendars" });

        this.renderRootFolder(containerEl);

        // Declared before the button below, which closes over it.
        const sourcesEl = containerEl.createDiv();
        sourcesEl.style.display = "block";

        addCalendarButton(
            this.app,
            this.plugin,
            containerEl,
            (source) => sourceList.addSource(source),
            () =>
                sourceList.state.sources
                    .map((s) => s.type === "local" && s.directory)
                    .filter((d): d is string => !!d),
            settings.calendarRootFolder || undefined,
            // Full-note calendars need somewhere to live.
            !settings.calendarRootFolder
        );

        // The button is created above the list, but Obsidian appends both, so
        // move the list back under it.
        containerEl.appendChild(sourcesEl);

        const sourceList = ReactDOM.render(
            createElement(CalendarSettings, {
                sources: settings.calendarSources,
                submit: (sources: CalendarInfo[]) =>
                    this.update(() => (settings.calendarSources = sources)),
                onRenameCalendar: (index: number, name: string) =>
                    this.renameCalendar(index, name),
            }),
            sourcesEl
        );
    }

    private renderRootFolder(containerEl: HTMLElement) {
        const { settings } = this.plugin;
        let input: HTMLInputElement | null = null;

        const setting = new Setting(containerEl)
            .setName("Calendars root folder")
            .setDesc(
                settings.calendarRootFolder
                    ? `Full Note calendars are stored under "${settings.calendarRootFolder}"`
                    : "Set a root folder before adding Full Note calendars."
            )
            .addSearch((search) => {
                input = search.inputEl;
                search.setPlaceholder("Type to search folders…");
                search.setValue(settings.calendarRootFolder || "");

                new FolderSuggest(this.app, search.inputEl, (path) =>
                    this.updateAndRedraw(
                        () => (settings.calendarRootFolder = path)
                    )
                );

                // Typing an existing folder's exact path commits it too.
                search.onChange((value) => {
                    const path = value.trim();
                    if (
                        path &&
                        this.app.vault.getAbstractFileByPath(path) instanceof
                            TFolder
                    ) {
                        this.update(() => (settings.calendarRootFolder = path));
                    }
                });
            })
            .addExtraButton((button) => {
                if (settings.calendarRootFolder) {
                    button
                        .setIcon("cross")
                        .setTooltip("Clear root folder")
                        .onClick(() =>
                            this.updateAndRedraw(
                                () => (settings.calendarRootFolder = "")
                            )
                        );
                    return;
                }

                button
                    .setIcon("plus-with-circle")
                    .setTooltip("Create root folder")
                    .onClick(async () => {
                        const path = input?.value.trim();
                        if (!path) {
                            new Notice(
                                "Type or select a folder name first, then click +"
                            );
                            return;
                        }
                        if (!(await createFolder(this.app, path))) {
                            return;
                        }
                        await this.updateAndRedraw(
                            () => (settings.calendarRootFolder = path)
                        );
                    });
            });

        setting.settingEl.addClass("neo-suggest-field");
    }

    /**
     * A full-note calendar IS its folder, so renaming one renames the folder —
     * and only then is the setting updated to match.
     */
    private async renameCalendar(index: number, name: string) {
        const source = this.plugin.settings.calendarSources[index];
        if (source.type !== "local") {
            return;
        }

        const lastSlash = source.directory.lastIndexOf("/");
        const parent =
            lastSlash === -1 ? "" : source.directory.slice(0, lastSlash);
        const directory = parent ? `${parent}/${name}` : name;

        const folder = this.app.vault.getAbstractFileByPath(source.directory);
        if (folder) {
            try {
                await this.app.fileManager.renameFile(folder, directory);
            } catch (e) {
                new Notice(
                    `Could not rename folder: ${
                        e instanceof Error ? e.message : String(e)
                    }`
                );
                return;
            }
        }

        await this.updateAndRedraw(() => {
            this.plugin.settings.calendarSources[index] = {
                ...source,
                directory,
            };
        });
    }
}
