import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getTheme, THEMES } from "./themes/registry";
import ThemeColorPicker from "./ThemeColorPicker";
import ThemeWallpaperPicker from "./ThemeWallpaperPicker";
import WallpaperEffectsControls from "./WallpaperEffectsControls";
import { isWallpaperId, type WallpaperId } from "./themes/wallpapers";
import { ThemeId } from "./themes/types";
import {
    getLanguage,
    LANGUAGES,
    setLanguage,
    t,
    type Language,
} from "../../../src/ui/i18n";
import {
    SettingsGroup,
    SettingsChoiceRow,
    SettingsRow,
    SettingsToggleRow,
} from "./SettingsPrimitives";
import {
    AppearanceMode,
    AppearancePreferences,
    ThemeCustomization,
    getEffectiveThemeAppearance,
    loadAppearancePreferences,
    resetThemeCustomization,
    saveAppearancePreferences,
    setThemeCustomization,
} from "./themes/appearancePreferences";
import type { DesktopDetectedVaultDto } from "./platform/desktopCalendarStore";
import type {
    DesktopInitialView,
    DesktopWorkspacePreferences,
    MobileInitialView,
} from "./platform/desktopWorkspacePreferences";
import {
    ArrowLeft,
    Check,
    ChevronDown,
    Copy,
    FileText,
    Flag,
    FolderOpen,
    Library,
    Plus,
    Trash2,
    Upload,
    Wifi,
    X,
    RotateCcw,
    Save,
} from "lucide-react";

/**
 * The settings are a stack of pages rather than a row of tabs.
 *
 * A tab bar asks a person to read four labels and guess which one hides what
 * they came for; a first page that lists everything, with the heavy subjects
 * behind a chevron, answers the question before it is asked. The back arrow is
 * then the only way out, at the top left, where it always is.
 */
type SettingsSection =
    | "calendars"
    | "appearance"
    | "sync"
    | "vaults"
    | "timezones"
    | "folder";

/** Kept for callers that used to open the settings straight onto a tab. */
type SettingsTab = "general" | SettingsSection;

interface ChoicePage {
    title: string;
    value: string;
    options: Array<{ value: string; label: string; icon?: React.ReactNode }>;
    onPick: (value: string) => void;
}

type SettingsPage =
    | { kind: "root" }
    | { kind: "section"; id: SettingsSection }
    | { kind: "choice"; choice: ChoicePage };

const SECTION_TITLES: Record<SettingsSection, string> = {
    calendars: t("Calendars"),
    appearance: t("Appearance"),
    sync: t("Sync"),
    vaults: t("Obsidian vaults"),
    timezones: t("Time zones"),
    folder: t("Data folder"),
};

function pageTitle(page: SettingsPage): string {
    if (page.kind === "root") return t("Settings");
    if (page.kind === "choice") return page.choice.title;
    return SECTION_TITLES[page.id];
}

function pageKey(page: SettingsPage, index: number): string {
    if (page.kind === "root") return "root";
    if (page.kind === "section") return `section:${page.id}`;
    return `choice:${index}:${page.choice.title}`;
}

/**
 * A caller asking for a section gets it opened on top of the first page, not
 * instead of it: the back arrow then leads where it looks like it leads.
 */
function initialStack(tab: SettingsTab): SettingsPage[] {
    if (tab === "general") return [{ kind: "root" }];
    return [{ kind: "root" }, { kind: "section", id: tab }];
}

export interface DesktopSettingsCalendar {
    id: string;
    name: string;
    color: string;
    hidden: boolean;
    isDefault: boolean;
    type: "local" | "ical" | "auto";
    editable: boolean;
    icon?: string;
}

export interface DesktopSettingsProps {
    open: boolean;
    initialTab?: SettingsTab;
    dataFolder: string;
    vaultFolders: string[];
    detectedVaults: DesktopDetectedVaultDto[];
    disabledVaults: string[];
    isChoosingVaultFolder?: boolean;
    isScanningVaults?: boolean;
    themeId: ThemeId;
    preferences: DesktopWorkspacePreferences;
    calendars: DesktopSettingsCalendar[];
    onThemeChange: (themeId: ThemeId) => Promise<void>;
    onPreferencesChange: (
        patch: Partial<DesktopWorkspacePreferences>
    ) => Promise<void>;
    onClose: () => void;
    onChangeDataFolder: () => Promise<void>;
    onOpenDataFolder: () => Promise<void>;
    onAddVaultFolder: () => Promise<void>;
    onRemoveVaultFolder: (folderPath: string) => Promise<void>;
    onSetVaultEnabled: (vaultPath: string, enabled: boolean) => Promise<void>;
    onAddCalendar: () => void;
    onRenameCalendar: (calendarId: string, name: string) => Promise<void>;
    onDeleteCalendar: (calendarId: string) => Promise<void>;
    onToggleCalendar: (calendarId: string) => void;
    onSetDefaultCalendar: (calendarId: string) => void;
    onCalendarColorChange: (calendarId: string, color: string) => void;
}

/**
 * How long the settings take to leave, matched in App.css and mobile.css. The
 * panel is unmounted on this timer, so a shorter value here cuts the exit off
 * partway through.
 */
const SETTINGS_EXIT_MS = 240;

/** Length of a page sliding back out to the right, matched in App.css. */
const PAGE_EXIT_MS = 220;

/** Length of the settings arriving, matched in App.css and mobile.css. */
const SETTINGS_ENTER_MS = 260;

const WEEKDAYS = [
    t("Sunday"),
    t("Monday"),
    t("Tuesday"),
    t("Wednesday"),
    t("Thursday"),
    t("Friday"),
    t("Saturday"),
];

function createThemeDraft(
    themeId: ThemeId,
    preferences: AppearancePreferences
): Required<ThemeCustomization> {
    const effective = getEffectiveThemeAppearance(
        getTheme(themeId),
        preferences
    );
    return {
        accent: effective.accent,
        surface: effective.surface,
        ink: effective.ink,
        uiFont: effective.uiFont,
        codeFont: effective.codeFont,
        translucentSidebar: effective.translucentSidebar,
        contrast: effective.contrast,
        wallpaperId: effective.wallpaperId,
    };
}

function isValidHex(value: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export default function DesktopSettings({
    open,
    initialTab = "general",
    dataFolder,
    vaultFolders,
    detectedVaults,
    disabledVaults,
    isChoosingVaultFolder = false,
    isScanningVaults = false,
    themeId,
    preferences,
    calendars,
    onThemeChange,
    onPreferencesChange,
    onClose,
    onChangeDataFolder,
    onOpenDataFolder,
    onAddVaultFolder,
    onRemoveVaultFolder,
    onSetVaultEnabled,
    onAddCalendar,
    onRenameCalendar,
    onDeleteCalendar,
    onToggleCalendar,
    onSetDefaultCalendar,
    onCalendarColorChange,
}: DesktopSettingsProps) {
    const currentTheme = getTheme(themeId);
    const [stack, setStack] = useState<SettingsPage[]>(() =>
        initialStack(initialTab)
    );
    // The page that was just left stays mounted for the length of its exit:
    // React would otherwise remove it on the spot and it would vanish instead
    // of sliding back out.
    const [leaving, setLeaving] = useState<SettingsPage | null>(null);
    const [timezone, setTimezone] = useState("");
    const [editingCalendarId, setEditingCalendarId] = useState<string | null>(
        null
    );
    const [calendarName, setCalendarName] = useState("");
    const [themePickerOpen, setThemePickerOpen] = useState(false);
    const themePickerRef = useRef<HTMLDivElement>(null);
    const importThemeInputRef = useRef<HTMLInputElement>(null);
    const [appearance, setAppearance] = useState<AppearancePreferences>(() =>
        loadAppearancePreferences()
    );
    const [themeMessage, setThemeMessage] = useState<string | null>(null);
    const [themeDraft, setThemeDraft] = useState<Required<ThemeCustomization>>(
        () => createThemeDraft(themeId, loadAppearancePreferences())
    );
    const [themeDirty, setThemeDirty] = useState(false);

    /*
     * Rewind to the requested page only when the settings window is opened (or
     * when a caller explicitly changes initialTab). Keeping this separate from
     * the Escape listener prevents theme-picker state and parent callback
     * updates from throwing the user back to the first page mid-visit.
     */
    useEffect(() => {
        if (open) {
            setStack(initialStack(initialTab));
            setLeaving(null);
        }
    }, [initialTab, open]);

    const currentPage = stack[stack.length - 1] ?? { kind: "root" };

    /**
     * One step back: out of a sub-page, or out of the settings from the first
     * page. Both leave in the same direction, so the arrow always means the
     * same thing.
     */
    const goBack = React.useCallback(() => {
        if (stack.length <= 1) {
            onClose();
            return;
        }
        const departing = stack[stack.length - 1];
        setLeaving(departing);
        setStack(stack.slice(0, -1));
        window.setTimeout(() => {
            setLeaving((page) => (page === departing ? null : page));
        }, PAGE_EXIT_MS);
    }, [onClose, stack]);

    const openPage = React.useCallback((page: SettingsPage) => {
        setStack((current) => [...current, page]);
    }, []);

    const openChoice = React.useCallback(
        (choice: ChoicePage) => openPage({ kind: "choice", choice }),
        [openPage]
    );

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (themePickerOpen) {
                setThemePickerOpen(false);
                return;
            }
            if (!editingCalendarId) goBack();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [editingCalendarId, goBack, open, themePickerOpen]);

    useEffect(() => {
        if (!themePickerOpen) return;
        const closeOnPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (
                target instanceof Node &&
                !themePickerRef.current?.contains(target)
            ) {
                setThemePickerOpen(false);
            }
        };
        window.addEventListener("pointerdown", closeOnPointerDown);
        return () =>
            window.removeEventListener("pointerdown", closeOnPointerDown);
    }, [themePickerOpen]);

    useEffect(() => {
        if (!open) return;
        const nextAppearance = loadAppearancePreferences();
        setAppearance(nextAppearance);
        setThemeDraft(createThemeDraft(themeId, nextAppearance));
        setThemeDirty(false);
        setThemeMessage(null);
    }, [open, themeId]);

    const disabledKeys = useMemo(
        () =>
            disabledVaults.map((path) =>
                path.replace(/\\/g, "/").toLowerCase()
            ),
        [disabledVaults]
    );

    // The panel outlives `open` by the length of its exit: React would
    // otherwise unmount it on the spot and the closing animation would have
    // nothing left to animate.
    const [mounted, setMounted] = useState(open);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            setClosing(false);
            return;
        }
        if (!mounted) return;

        setClosing(true);
        const timer = window.setTimeout(() => {
            setMounted(false);
            setClosing(false);
        }, SETTINGS_EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [open, mounted]);

    // The calendar behind is faded out rather than left showing through: the
    // panel is glass, so without this the drawer and the grid read straight
    // through the settings instead of the wallpaper alone.
    /*
     * Both stacks of glass in here are backdrop-filters, and a backdrop-filter
     * on something that is moving is resampled from whatever happens to be
     * behind it that frame — including, at the edges, nothing at all. The panel
     * darkened for exactly as long as it slid, and looked right the moment it
     * stopped. So the blur is switched off while it travels: `entering` marks
     * the arrival the way `closing` already marked the departure.
     */
    const [entering, setEntering] = useState(false);

    useEffect(() => {
        if (!open) return;
        setEntering(true);
        const timer = window.setTimeout(
            () => setEntering(false),
            SETTINGS_ENTER_MS
        );
        return () => window.clearTimeout(timer);
    }, [open]);

    useEffect(() => {
        if (typeof document === "undefined") return;
        const body = document.body;
        body.classList.toggle("nc-settings-open", mounted);
        body.classList.toggle("nc-settings-closing", closing);
        body.classList.toggle("nc-settings-entering", entering && mounted);
        return () => {
            body.classList.remove("nc-settings-open");
            body.classList.remove("nc-settings-closing");
            body.classList.remove("nc-settings-entering");
        };
    }, [mounted, closing, entering]);

    if (!mounted) return null;

    const updateAppearance = (patch: Partial<AppearancePreferences>) => {
        setAppearance((current) => {
            const next = saveAppearancePreferences({ ...current, ...patch });
            return next;
        });
    };

    const updateThemeDraft = (patch: Partial<ThemeCustomization>) => {
        setThemeDraft((current) => ({ ...current, ...patch }));
        setThemeDirty(true);
        setThemeMessage(null);
    };

    /**
     * Picking a wallpaper takes effect straight away.
     *
     * It used to land in the draft like a colour, waiting on a Save button
     * sitting far below the fold — so choosing a background appeared to do
     * nothing at all. A wallpaper needs no validation and is undone by picking
     * another, so there is nothing to confirm.
     */
    const applyWallpaper = (wallpaperId: WallpaperId) => {
        const draft = { ...themeDraft, wallpaperId };
        setThemeDraft(draft);
        setAppearance(setThemeCustomization(appearance, themeId, draft));
        setThemeMessage(null);
    };

    const saveThemeChanges = () => {
        if (
            !isValidHex(themeDraft.accent) ||
            !isValidHex(themeDraft.surface) ||
            !isValidHex(themeDraft.ink)
        ) {
            setThemeMessage(t("Colours must use the #RRGGBB format"));
            return;
        }
        const next = setThemeCustomization(appearance, themeId, themeDraft);
        setAppearance(next);
        setThemeDraft(createThemeDraft(themeId, next));
        setThemeDirty(false);
        setThemeMessage(t("Changes saved"));
    };

    const resetCurrentTheme = () => {
        const next = resetThemeCustomization(appearance, themeId);
        setAppearance(next);
        setThemeDraft(createThemeDraft(themeId, next));
        setThemeDirty(false);
        setThemeMessage(t("Theme reset"));
    };

    const copyCurrentTheme = async () => {
        const payload =
            "codex-theme-v1:" +
            JSON.stringify({
                codeThemeId: currentTheme.id,
                theme: {
                    accent: themeDraft.accent,
                    contrast: themeDraft.contrast,
                    fonts: {
                        code: themeDraft.codeFont,
                        ui: themeDraft.uiFont,
                    },
                    ink: themeDraft.ink,
                    opaqueWindows: !themeDraft.translucentSidebar,
                    semanticColors: currentTheme.semanticColors,
                    surface: themeDraft.surface,
                    wallpaperId: themeDraft.wallpaperId,
                },
                variant: currentTheme.colorScheme,
            });

        try {
            await navigator.clipboard.writeText(payload);
            setThemeMessage(t("Theme copied"));
        } catch {
            setThemeMessage(t("Could not copy the theme"));
        }
    };

    const importThemeFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            const text = (await file.text()).trim();
            const json = text.startsWith("codex-theme-v1:")
                ? text.slice("codex-theme-v1:".length)
                : text;
            const parsed = JSON.parse(json) as {
                codeThemeId?: unknown;
                theme?: {
                    accent?: unknown;
                    contrast?: unknown;
                    fonts?: { code?: unknown; ui?: unknown };
                    ink?: unknown;
                    opaqueWindows?: unknown;
                    surface?: unknown;
                    wallpaperId?: unknown;
                };
            };
            const importedTheme = THEMES.find(
                (candidate) => candidate.id === parsed.codeThemeId
            );
            if (!importedTheme) {
                setThemeMessage(
                    "Ce thème n’est pas installé dans Neo Calendar"
                );
                return;
            }
            await onThemeChange(importedTheme.id);
            const imported = parsed.theme ?? {};
            const nextDraft = createThemeDraft(importedTheme.id, appearance);
            if (typeof imported.accent === "string")
                nextDraft.accent = imported.accent;
            if (typeof imported.surface === "string")
                nextDraft.surface = imported.surface;
            if (typeof imported.ink === "string") nextDraft.ink = imported.ink;
            if (typeof imported.contrast === "number")
                nextDraft.contrast = imported.contrast;
            if (typeof imported.fonts?.ui === "string")
                nextDraft.uiFont = imported.fonts.ui;
            if (typeof imported.fonts?.code === "string")
                nextDraft.codeFont = imported.fonts.code;
            if (typeof imported.opaqueWindows === "boolean") {
                nextDraft.translucentSidebar = !imported.opaqueWindows;
            }
            if (isWallpaperId(imported.wallpaperId)) {
                nextDraft.wallpaperId = imported.wallpaperId;
            }
            setThemeDraft(nextDraft);
            setThemeDirty(true);
            setThemeMessage(
                `${importedTheme.label} importé — enregistre pour appliquer`
            );
        } catch {
            setThemeMessage(t("Invalid theme file"));
        } finally {
            if (importThemeInputRef.current) {
                importThemeInputRef.current.value = "";
            }
        }
    };

    // Only the touched fields travel: sending a whole snapshot would overwrite
    // whatever the stored file holds for the untouched ones.
    const patchPreferences = (patch: Partial<DesktopWorkspacePreferences>) =>
        void onPreferencesChange(patch);

    const patchInitialView = (
        patch: Partial<DesktopWorkspacePreferences["initialView"]>
    ) =>
        patchPreferences({
            initialView: { ...preferences.initialView, ...patch },
        });

    const addTimezone = () => {
        const value = timezone.trim();
        if (!value || preferences.secondaryTimezones.includes(value)) return;
        patchPreferences({
            secondaryTimezones: [...preferences.secondaryTimezones, value],
        });
        setTimezone("");
    };

    const isVaultEnabled = (vaultPath: string) =>
        !disabledKeys.includes(vaultPath.replace(/\\/g, "/").toLowerCase());

    const submitCalendarRename = async (calendarId: string) => {
        const name = calendarName.trim();
        if (!name) return;
        await onRenameCalendar(calendarId, name);
        setEditingCalendarId(null);
        setCalendarName("");
    };

    const secondaryTimezoneCount = preferences.secondaryTimezones.length;
    const enabledVaultCount = detectedVaults.filter((vault) =>
        isVaultEnabled(vault.path)
    ).length;

    /** The first page: everything the app can be set to, in one column. */
    const renderRoot = () => (
        <div className="nc-set-groups">
            <SettingsGroup
                title={t("Calendar view")}
                note={t("Without “Create an event by tapping a day of the month”, tapping a day opens the day view instead.")}
            >
                <SettingsChoiceRow
                    label={t("Initial view on desktop")}
                    value={preferences.initialView.desktop}
                    options={[
                        { value: "day", label: t("Day") },
                        { value: "week", label: t("Week") },
                        { value: "month", label: t("Month") },
                        { value: "list", label: t("List") },
                    ]}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchInitialView({
                            desktop: value as DesktopInitialView,
                        })
                    }
                />
                <SettingsChoiceRow
                    label={t("Initial view on phone")}
                    value={preferences.initialView.mobile}
                    options={[
                        { value: "day", label: t("Day") },
                        { value: "3days", label: t("3 days") },
                        { value: "list", label: t("List") },
                    ]}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchInitialView({
                            mobile: value as MobileInitialView,
                        })
                    }
                />
                <SettingsChoiceRow
                    label={t("First day of the week")}
                    value={String(preferences.firstDay)}
                    options={WEEKDAYS.map((day, index) => ({
                        value: String(index),
                        label: day,
                    }))}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchPreferences({ firstDay: Number(value) })
                    }
                />
                <SettingsToggleRow
                    label={t("24-hour time")}
                    checked={preferences.timeFormat24h}
                    onChange={(checked) =>
                        patchPreferences({ timeFormat24h: checked })
                    }
                />
                <SettingsToggleRow
                    label={t("Create an event by tapping a day of the month")}
                    checked={preferences.clickToCreateEventFromMonthView}
                    onChange={(checked) =>
                        patchPreferences({
                            clickToCreateEventFromMonthView: checked,
                        })
                    }
                />
                <SettingsToggleRow
                    label={t("New events created as tasks")}
                    checked={preferences.defaultEventsAsTasks}
                    onChange={(checked) =>
                        patchPreferences({ defaultEventsAsTasks: checked })
                    }
                />
            </SettingsGroup>

            {/* Colour mode sits directly under the theme rather than inside
                the appearance page: going light-to-dark is a decision taken
                often, and four taps for it is three too many. */}
            <SettingsGroup title={t("Appearance")}>
                <SettingsRow
                    label={t("Theme")}
                    value={currentTheme.label}
                    navigates
                    onClick={() =>
                        openPage({ kind: "section", id: "appearance" })
                    }
                />
                <SettingsChoiceRow
                    label={t("Colour mode")}
                    value={appearance.mode}
                    options={[
                        { value: "system", label: t("System") },
                        { value: "light", label: t("Light") },
                        { value: "dark", label: t("Dark") },
                    ]}
                    onOpen={openChoice}
                    onChange={(mode) =>
                        updateAppearance({ mode: mode as AppearanceMode })
                    }
                />
                <SettingsChoiceRow
                    label={t("Language")}
                    value={getLanguage()}
                    options={LANGUAGES}
                    onOpen={openChoice}
                    onChange={(language) => setLanguage(language as Language)}
                />
            </SettingsGroup>

            <SettingsGroup title={t("Integrations")}>
                <SettingsRow
                    label={t("Calendars")}
                    value={String(calendars.length)}
                    navigates
                    onClick={() =>
                        openPage({ kind: "section", id: "calendars" })
                    }
                />
                <SettingsRow
                    label={t("Time zones")}
                    value={
                        secondaryTimezoneCount === 0
                            ? t("None")
                            : String(secondaryTimezoneCount)
                    }
                    navigates
                    onClick={() =>
                        openPage({ kind: "section", id: "timezones" })
                    }
                />
            </SettingsGroup>

            <SettingsGroup title={t("Data")}>
                <SettingsRow
                    label={t("Data folder")}
                    value={vaultName(dataFolder)}
                    navigates
                    onClick={() => openPage({ kind: "section", id: "folder" })}
                />
                <SettingsRow
                    label={t("Obsidian vaults")}
                    value={
                        vaultFolders.length === 0
                            ? t("No folder")
                            : String(enabledVaultCount)
                    }
                    navigates
                    onClick={() => openPage({ kind: "section", id: "vaults" })}
                />
                <SettingsRow
                    label={t("Sync")}
                    navigates
                    onClick={() => openPage({ kind: "section", id: "sync" })}
                />
            </SettingsGroup>
        </div>
    );

    const renderTimezones = () => (
        <div className="nc-set-groups">
            <SettingsGroup note={t("An extra hour column appears in the week, day and three-day views.")}>
                <div className="nc-set-row nc-set-row--field">
                    <input
                        value={timezone}
                        placeholder="ex. America/New_York"
                        aria-label={t("Time zone to add")}
                        onChange={(event) => setTimezone(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addTimezone();
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={addTimezone}
                        aria-label="Ajouter un fuseau horaire"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </SettingsGroup>

            {preferences.secondaryTimezones.length > 0 && (
                <SettingsGroup title={t("Time zones added")}>
                    {preferences.secondaryTimezones.map((zone) => (
                        <div className="nc-set-row" key={zone}>
                            <span className="nc-set-row__label">{zone}</span>
                            <span className="nc-set-row__trailing">
                                <button
                                    type="button"
                                    className="nc-set-row__icon-button"
                                    onClick={() =>
                                        patchPreferences({
                                            secondaryTimezones:
                                                preferences.secondaryTimezones.filter(
                                                    (item) => item !== zone
                                                ),
                                        })
                                    }
                                    aria-label={`Retirer ${zone}`}
                                >
                                    <X size={16} />
                                </button>
                            </span>
                        </div>
                    ))}
                </SettingsGroup>
            )}
        </div>
    );

    const renderFolder = () => (
        <div className="nc-set-groups">
            <SettingsGroup note={t("Neo Calendar keeps its calendar files in this folder. Each direct subfolder is a calendar.")}>
                <div className="nc-set-row nc-set-row--stacked">
                    <code>{dataFolder}</code>
                </div>
                <SettingsRow
                    label={t("Change folder")}
                    onClick={() => void onChangeDataFolder()}
                />
                <SettingsRow
                    label={t("Open folder")}
                    onClick={() => void onOpenDataFolder()}
                />
            </SettingsGroup>
        </div>
    );

    const renderVaults = () => (
        <div className="nc-set-groups">
            <SettingsGroup note={t("Add the folder that holds your Obsidian vaults. Those sitting directly inside it with an .obsidian folder are detected.")}>
                <SettingsRow
                    label={
                        isChoosingVaultFolder
                            ? t("Choosing…")
                            : t("Add a folder")
                    }
                    disabled={isChoosingVaultFolder}
                    onClick={() => void onAddVaultFolder()}
                />
            </SettingsGroup>

            {vaultFolders.length > 0 && (
                <SettingsGroup title={t("Folders added")}>
                    {vaultFolders.map((folderPath) => (
                        <div
                            className="nc-set-row nc-set-row--path"
                            key={folderPath}
                        >
                            <span className="nc-set-row__icon">
                                <FolderOpen size={18} />
                            </span>
                            <span className="nc-set-row__text">
                                <span className="nc-set-row__label">
                                    {vaultName(folderPath)}
                                </span>
                                <code>{folderPath}</code>
                            </span>
                            <span className="nc-set-row__trailing">
                                <button
                                    type="button"
                                    className="nc-set-row__icon-button"
                                    onClick={() =>
                                        void onRemoveVaultFolder(folderPath)
                                    }
                                    aria-label={`Retirer ${folderPath}`}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </span>
                        </div>
                    ))}
                </SettingsGroup>
            )}

            {vaultFolders.length > 0 && (
                <SettingsGroup
                    title={
                        isScanningVaults
                            ? t("Vaults detected — scanning…")
                            : t("Vaults detected")
                    }
                    note={t("Turn a vault off to leave it out of note search.")}
                >
                    {detectedVaults.length === 0 ? (
                        <div className="nc-set-row">
                            <span className="nc-set-row__label">
                                Aucun coffre détecté
                            </span>
                        </div>
                    ) : (
                        detectedVaults.map((vault) => {
                            const enabled = isVaultEnabled(vault.path);
                            return (
                                <button
                                    className="nc-set-row nc-set-row--action nc-set-row--path"
                                    key={vault.path}
                                    type="button"
                                    role="switch"
                                    aria-checked={enabled}
                                    onClick={() =>
                                        void onSetVaultEnabled(
                                            vault.path,
                                            !enabled
                                        )
                                    }
                                >
                                    <span className="nc-set-row__icon">
                                        <Library size={18} />
                                    </span>
                                    <span className="nc-set-row__text">
                                        <span className="nc-set-row__label">
                                            {vault.name}
                                        </span>
                                        <code>{vault.path}</code>
                                    </span>
                                    <span className="nc-set-row__trailing">
                                        <span
                                            className="nc-set-switch"
                                            aria-hidden="true"
                                        >
                                            <span className="nc-set-switch__knob" />
                                        </span>
                                    </span>
                                </button>
                            );
                        })
                    )}
                </SettingsGroup>
            )}
        </div>
    );

    const renderCalendars = () => (
        <div className="nc-set-groups">
            <SettingsGroup note={t("Each direct subfolder of the data folder is a calendar.")}>
                <SettingsRow
                    label={t("Add calendar")}
                    value={t("Full note, ICS or automatic")}
                    onClick={onAddCalendar}
                />
            </SettingsGroup>

            {calendars.length > 0 && (
                <SettingsGroup title={t("Calendars")}>
                    {calendars.map((calendar) => (
                        <div
                            className="nc-settings__calendar-item"
                            key={calendar.id}
                        >
                            <span
                                className="nc-settings__calendar-kind"
                                title={
                                    calendar.type === "local"
                                        ? t("Full note")
                                        : calendar.type === "ical"
                                        ? "Remote ICS"
                                        : "Calendrier automatique"
                                }
                            >
                                {calendar.type === "local" ? (
                                    <FileText size={15} />
                                ) : calendar.type === "ical" ? (
                                    <Wifi size={15} />
                                ) : (
                                    <Flag size={15} />
                                )}
                            </span>
                            <button
                                className={`nc-settings__calendar-enabled${
                                    calendar.hidden ? " is-hidden" : ""
                                }`}
                                type="button"
                                onClick={() => onToggleCalendar(calendar.id)}
                                aria-label={`${
                                    calendar.hidden ? "Afficher" : "Masquer"
                                } ${calendar.name}`}
                            >
                                {!calendar.hidden && <Check size={14} />}
                            </button>
                            <input
                                className="nc-settings__calendar-color"
                                type="color"
                                value={calendar.color}
                                onChange={(event) =>
                                    onCalendarColorChange(
                                        calendar.id,
                                        event.target.value
                                    )
                                }
                                aria-label={`Couleur de ${calendar.name}`}
                            />
                            {editingCalendarId === calendar.id ? (
                                <input
                                    className="nc-settings__calendar-name-input"
                                    value={calendarName}
                                    autoFocus
                                    onChange={(event) =>
                                        setCalendarName(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            void submitCalendarRename(
                                                calendar.id
                                            );
                                        } else if (event.key === "Escape") {
                                            setEditingCalendarId(null);
                                        }
                                    }}
                                    onBlur={() =>
                                        void submitCalendarRename(calendar.id)
                                    }
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="nc-settings__calendar-name"
                                    onDoubleClick={() => {
                                        setEditingCalendarId(calendar.id);
                                        setCalendarName(calendar.name);
                                    }}
                                    onClick={() => {
                                        if (calendar.editable) {
                                            onSetDefaultCalendar(calendar.id);
                                        }
                                    }}
                                    title={
                                        calendar.editable
                                            ? t("Tap to set as default, double-tap to rename")
                                            : t("Read-only calendar; double-tap to rename")
                                    }
                                >
                                    {calendar.name}
                                </button>
                            )}
                            {calendar.isDefault && (
                                <span className="nc-settings__calendar-default">
                                    Par défaut
                                </span>
                            )}
                            <button
                                className="nc-settings__calendar-delete"
                                type="button"
                                onClick={() => void onDeleteCalendar(calendar.id)}
                                aria-label={`Supprimer ${calendar.name}`}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </SettingsGroup>
            )}
        </div>
    );

    const renderSync = () => (
        <div className="nc-set-groups">
            <SettingsGroup note={t("Neo Calendar keeps its data in the folder you choose. Syncing is done by whichever tool you settle on.")}>
                <SettingsRow
                    label={t("Data folder")}
                    value={vaultName(dataFolder)}
                    navigates
                    onClick={() => openPage({ kind: "section", id: "folder" })}
                />
            </SettingsGroup>

            <SettingsGroup title={t("Possible methods")}>
                <SettingsRow
                    label="Syncthing"
                    value={t("Recommended")}
                />
                <SettingsRow
                    label={t("Online storage")}
                    value={t("OneDrive, Google Drive, Dropbox")}
                />
                <SettingsRow
                    label={t("Manual transfer")}
                    value={t("Over USB")}
                />
            </SettingsGroup>
        </div>
    );

    const renderAppearance = () => (
        <div className="nc-set-groups nc-settings__appearance">
            <section className="nc-theme-studio">
                <header className="nc-theme-studio__header">
                    <strong>
                        {appearance.mode === "system"
                            ? t("System mode")
                            : appearance.mode === "light"
                            ? t("Light mode")
                            : t("Dark mode")}
                    </strong>
                    <div className="nc-theme-studio__actions">
                        <input
                            ref={importThemeInputRef}
                            className="nc-theme-import-input"
                            type="file"
                            accept=".json,.txt,application/json,text/plain"
                            onChange={(event) =>
                                void importThemeFile(event.target.files?.[0])
                            }
                        />
                        <button
                            type="button"
                            className="nc-theme-text-action"
                            onClick={() => importThemeInputRef.current?.click()}
                        >
                            <Upload size={14} />
                            Importer
                        </button>
                        <button
                            type="button"
                            className="nc-theme-text-action"
                            onClick={() => void copyCurrentTheme()}
                        >
                            <Copy size={14} />
                            Copier le thème
                        </button>

                        <div
                            className="nc-settings__theme-picker"
                            ref={themePickerRef}
                        >
                            <button
                                className="nc-settings__theme-picker-button"
                                type="button"
                                aria-haspopup="listbox"
                                aria-expanded={themePickerOpen}
                                onClick={() => setThemePickerOpen((it) => !it)}
                            >
                                <ThemePreview theme={currentTheme} />
                                <span>{currentTheme.label}</span>
                                <ChevronDown
                                    className={
                                        themePickerOpen ? "nc-open" : undefined
                                    }
                                    size={15}
                                />
                            </button>

                            {themePickerOpen && (
                                <div
                                    className="nc-settings__theme-menu"
                                    role="listbox"
                                    aria-label={t("Themes")}
                                >
                                    {THEMES.map((theme) => {
                                        const selected = theme.id === themeId;
                                        return (
                                            <button
                                                key={theme.id}
                                                className="nc-settings__theme-option"
                                                type="button"
                                                role="option"
                                                aria-selected={selected}
                                                onClick={() => {
                                                    setThemePickerOpen(false);
                                                    setThemeDirty(false);
                                                    setThemeMessage(null);
                                                    void onThemeChange(theme.id);
                                                }}
                                            >
                                                <ThemePreview theme={theme} />
                                                <span>
                                                    <strong>
                                                        {theme.label}
                                                    </strong>
                                                    <small>
                                                        {theme.variantLabel}
                                                    </small>
                                                </span>
                                                {selected && <Check size={16} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <ThemeColorPicker
                    label={t("Accent")}
                    value={themeDraft.accent}
                    emphasized
                    onChange={(accent) => updateThemeDraft({ accent })}
                />
                <ThemeColorPicker
                    label={t("Background")}
                    value={themeDraft.surface}
                    onChange={(surface) => updateThemeDraft({ surface })}
                />
                <ThemeColorPicker
                    label={t("Foreground")}
                    value={themeDraft.ink}
                    onChange={(ink) => updateThemeDraft({ ink })}
                />
                <ThemeWallpaperPicker
                    value={themeDraft.wallpaperId}
                    accent={themeDraft.accent}
                    surface={themeDraft.surface}
                    onChange={applyWallpaper}
                />
                <WallpaperEffectsControls />
                <label className="nc-theme-studio__row nc-theme-font-row">
                    <span>Police de l’interface utilisateur</span>
                    <input
                        type="text"
                        list="nc-ui-fonts"
                        value={themeDraft.uiFont}
                        onChange={(event) =>
                            updateThemeDraft({ uiFont: event.target.value })
                        }
                        spellCheck={false}
                    />
                    <datalist id="nc-ui-fonts">
                        <option
                            value={'"Inter Variable", Inter, sans-serif'}
                        />
                        <option
                            value={
                                '"Geist Variable", Geist, "Inter Variable", sans-serif'
                            }
                        />
                        <option
                            value={
                                'Satoshi, "Inter Variable", Inter, sans-serif'
                            }
                        />
                        <option
                            value={
                                '"JetBrains Mono Variable", "JetBrains Mono", monospace'
                            }
                        />
                        <option
                            value={
                                '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'
                            }
                        />
                    </datalist>
                </label>
                <label className="nc-theme-studio__row nc-theme-font-row">
                    <span>Police monospace</span>
                    <input
                        type="text"
                        list="nc-code-fonts"
                        value={themeDraft.codeFont}
                        onChange={(event) =>
                            updateThemeDraft({ codeFont: event.target.value })
                        }
                        spellCheck={false}
                    />
                    <datalist id="nc-code-fonts">
                        <option
                            value={
                                '"JetBrains Mono Variable", "JetBrains Mono", monospace'
                            }
                        />
                        <option
                            value={
                                '"Geist Mono Variable", "Geist Mono", "JetBrains Mono Variable", monospace'
                            }
                        />
                        <option
                            value={'"Cascadia Code", Consolas, monospace'}
                        />
                    </datalist>
                </label>
                <div className="nc-theme-studio__row">
                    <span>Barre latérale translucide</span>
                    <button
                        className="nc-theme-switch"
                        type="button"
                        role="switch"
                        aria-checked={themeDraft.translucentSidebar}
                        onClick={() =>
                            updateThemeDraft({
                                translucentSidebar:
                                    !themeDraft.translucentSidebar,
                            })
                        }
                    >
                        <i />
                    </button>
                </div>
                <label className="nc-theme-studio__row nc-theme-contrast-row">
                    <span>Contraste</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={themeDraft.contrast}
                        onChange={(event) =>
                            updateThemeDraft({
                                contrast: Number(event.target.value),
                            })
                        }
                    />
                    <output>{themeDraft.contrast}</output>
                </label>

                <footer className="nc-theme-studio__footer">
                    <button
                        type="button"
                        className="nc-theme-reset-button"
                        onClick={resetCurrentTheme}
                    >
                        <RotateCcw size={15} />
                        Réinitialiser ce thème
                    </button>
                    <button
                        type="button"
                        className="nc-theme-save-button"
                        disabled={!themeDirty}
                        onClick={saveThemeChanges}
                    >
                        <Save size={15} />
                        Enregistrer
                    </button>
                </footer>

                {themeMessage && (
                    <p className="nc-theme-studio__message" role="status">
                        {themeMessage}
                    </p>
                )}
            </section>
        </div>
    );

    /** A list of choices, one per line, the current one ticked. */
    const renderChoice = (choice: ChoicePage) => (
        <div className="nc-set-groups">
            <SettingsGroup>
                {choice.options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={option.value === choice.value}
                        className="nc-set-row nc-set-row--action"
                        onClick={() => {
                            choice.onPick(option.value);
                            goBack();
                        }}
                    >
                        {option.icon && (
                            <span className="nc-set-row__icon">
                                {option.icon}
                            </span>
                        )}
                        <span className="nc-set-row__label">
                            {option.label}
                        </span>
                        {option.value === choice.value && (
                            <span className="nc-set-row__trailing nc-set-row__trailing--check">
                                <Check size={18} />
                            </span>
                        )}
                    </button>
                ))}
            </SettingsGroup>
        </div>
    );

    const renderSection = (id: SettingsSection) => {
        switch (id) {
            case "appearance":
                return renderAppearance();
            case "calendars":
                return renderCalendars();
            case "sync":
                return renderSync();
            case "vaults":
                return renderVaults();
            case "timezones":
                return renderTimezones();
            case "folder":
                return renderFolder();
        }
    };

    const renderPage = (page: SettingsPage) => {
        if (page.kind === "root") return renderRoot();
        if (page.kind === "choice") return renderChoice(page.choice);
        return renderSection(page.id);
    };

    const content = (
        <div
            className="nc-settings-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className="nc-settings"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-settings-title"
                data-settings-page={
                    currentPage.kind === "section" ? currentPage.id : "general"
                }
            >
                <header className="nc-settings__header">
                    <button
                        className="nc-settings__back"
                        type="button"
                        onClick={goBack}
                        aria-label={
                            stack.length > 1 ? t("Back") : t("Close settings")
                        }
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <h2 id="nc-settings-title">{pageTitle(currentPage)}</h2>
                </header>

                {/* Every page occupies the same slot: the one on top slides in
                    from the right, and the one it replaced waits underneath
                    with the scroll position it was left at. */}
                <div className="nc-settings__pages">
                    {stack.map((page, index) => {
                        const buried = index < stack.length - 1;
                        return (
                            <div
                                className={`nc-settings__page${
                                    buried ? " nc-settings__page--buried" : ""
                                }`}
                                key={pageKey(page, index)}
                                data-depth={index}
                                aria-hidden={buried ? true : undefined}
                            >
                                {renderPage(page)}
                            </div>
                        );
                    })}
                    {leaving && (
                        <div
                            className="nc-settings__page nc-settings__page--leaving"
                            key="leaving"
                            aria-hidden="true"
                        >
                            {renderPage(leaving)}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );

    if (typeof document === "undefined") return content;
    return createPortal(content, document.body);
}

function ThemePreview({ theme }: { theme: (typeof THEMES)[number] }) {
    return (
        <span
            className="nc-settings__theme-preview"
            style={{
                backgroundColor: theme.surface,
                color: theme.accent,
                borderColor: `color-mix(in srgb, ${theme.ink} 22%, ${theme.surface})`,
                fontFamily:
                    theme.uiFont ??
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
            }}
            aria-hidden="true"
        >
            <strong>A</strong>
            <small>a</small>
        </span>
    );
}

function vaultName(path: string): string {
    const normalized = path.replace(/[\\/]+$/, "");
    return normalized.split(/[\\/]/).pop() || path;
}
