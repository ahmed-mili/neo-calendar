import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getTheme, THEMES } from "./themes/registry";
import ThemeColorPicker from "./ThemeColorPicker";
import ThemeWallpaperPicker from "./ThemeWallpaperPicker";
import WallpaperEffectsControls from "./WallpaperEffectsControls";
import ConfirmDialog from "./ConfirmDialog";
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
    SettingsChoice,
    SettingsChoiceDialog,
    SettingsDialog,
    SettingsChoiceRow,
    SettingsFieldRow,
    SettingsRow,
    SettingsSliderRow,
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
import { folderName, readableFolderPath } from "./platform/documentPath";
import {
    writeDesktopClipboardText,
    type DesktopDetectedVaultDto,
} from "./platform/desktopCalendarStore";
import type {
    DesktopInitialView,
    DesktopWorkspacePreferences,
    MobileInitialView,
} from "./platform/desktopWorkspacePreferences";
import type {
    MapsAppChoice,
    MapsTravelMode,
} from "../../../src/ui/calendar/locationLink";
import {
    ICS_REFRESH_MINUTES,
    type IcsRefreshMinutes,
} from "./platform/icsFeedPreferences";
import {
    ArrowLeft,
    Bell,
    CalendarClock,
    CalendarDays,
    CalendarRange,
    Check,
    Code2,
    Copy,
    Columns2,
    Columns3,
    ExternalLink,
    FileText,
    Flag,
    FolderOpen,
    Globe,
    Languages,
    Library,
    List as ListIcon,
    Moon,
    Monitor,
    Palette,
    PanelLeft,
    RefreshCw,
    Map,
    Route,
    Smartphone,
    Plus,
    Square,
    SunMedium,
    Timer,
    Trash2,
    Type,
    Upload,
    Wifi,
    X,
    RotateCcw,
    Save,
    Search,
    Settings as SettingsIcon,
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

type SettingsPage = { kind: "root" } | { kind: "section"; id: SettingsSection };

/*
 * The submenus small enough to be taken over the screen instead of replacing it.
 *
 * The test is what the section holds, not how many lines it happens to show
 * today: a fixed handful of rows can be a dialog, a list that grows with use
 * cannot. Calendars, Obsidian vaults and time zones each grow — and time zones
 * carries a text field, which on a phone means a keyboard covering half of
 * whatever it is drawn over. Appearance is a whole screen of its own.
 */
const DIALOG_SECTIONS: ReadonlySet<SettingsSection> = new Set<SettingsSection>([
    "folder",
    "sync",
]);

function isDialogSection(page: SettingsPage): boolean {
    return page.kind === "section" && DIALOG_SECTIONS.has(page.id);
}

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
    return SECTION_TITLES[page.id];
}

function pageKey(page: SettingsPage): string {
    return page.kind === "root" ? "root" : `section:${page.id}`;
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
    /** Timed entries still marked as tasks by the old `completed: false` bug. */
    misfiledEventCount: number;
    /** Converts them back to plain events; resolves with how many landed. */
    onConvertMisfiledEvents: () => Promise<number>;
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

function icsFrequencyLabel(minutes: IcsRefreshMinutes): string {
    return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
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
    misfiledEventCount,
    onConvertMisfiledEvents,
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
    // The one-off repair for the `completed: false` bug: confirmation first,
    // then how many entries actually came back as events.
    const [convertOpen, setConvertOpen] = useState(false);
    const [convertedCount, setConvertedCount] = useState<number | null>(null);
    const [applyIcsFrequencyOpen, setApplyIcsFrequencyOpen] = useState(false);
    const importThemeInputRef = useRef<HTMLInputElement>(null);
    const [appearance, setAppearance] = useState<AppearancePreferences>(() =>
        loadAppearancePreferences()
    );
    const [themeMessage, setThemeMessage] = useState<string | null>(null);
    const [themeDraft, setThemeDraft] = useState<Required<ThemeCustomization>>(
        () => createThemeDraft(themeId, loadAppearancePreferences())
    );
    const [themeDirty, setThemeDirty] = useState(false);
    const [choice, setChoice] = useState<SettingsChoice | null>(null);
    const [settingsSearch, setSettingsSearch] = useState("");
    const isAndroid =
        typeof document !== "undefined" &&
        document.body.classList.contains("nc-platform-android");

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
            setChoice(null);
            setSettingsSearch("");
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

    /* Une liste courte se prend par-dessus l'écran qui l'a demandée, pas à sa
       place : choisir entre trois choses nommées est un geste, pas un voyage. */
    const openChoice = React.useCallback(
        (next: SettingsChoice) => setChoice(next),
        []
    );

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (!editingCalendarId) {
                if (isAndroid) goBack();
                else onClose();
            }
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [editingCalendarId, goBack, isAndroid, onClose, open]);

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
            await writeDesktopClipboardText(payload);
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
    const renderRoot = (desktop = false) => (
        <div className="nc-set-groups">
            <SettingsGroup
                title={t("Calendar view")}
                note={t(
                    "Without “Create an event by tapping a day of the month”, tapping a day opens the day view instead."
                )}
            >
                <SettingsChoiceRow
                    label={t("Initial view on desktop")}
                    icon={<Monitor size={18} />}
                    value={preferences.initialView.desktop}
                    options={[
                        {
                            value: "day",
                            label: t("Day"),
                            icon: <Square size={19} />,
                        },
                        {
                            value: "week",
                            label: t("Week"),
                            icon: <Columns3 size={19} />,
                        },
                        {
                            value: "month",
                            label: t("Month"),
                            icon: <CalendarRange size={19} />,
                        },
                        {
                            value: "list",
                            label: t("List"),
                            icon: <ListIcon size={19} />,
                        },
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
                    icon={<Smartphone size={18} />}
                    value={preferences.initialView.mobile}
                    options={[
                        {
                            value: "day",
                            label: t("Day"),
                            icon: <Square size={19} />,
                        },
                        {
                            value: "3days",
                            label: t("3 days"),
                            icon: <Columns3 size={19} />,
                        },
                        {
                            value: "list",
                            label: t("List"),
                            icon: <ListIcon size={19} />,
                        },
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
                    icon={<CalendarRange size={18} />}
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
                    icon={<Timer size={18} />}
                    checked={preferences.timeFormat24h}
                    onChange={(checked) =>
                        patchPreferences({ timeFormat24h: checked })
                    }
                />
                <SettingsToggleRow
                    label={t("Create an event by tapping a day of the month")}
                    icon={<CalendarClock size={18} />}
                    checked={preferences.clickToCreateEventFromMonthView}
                    onChange={(checked) =>
                        patchPreferences({
                            clickToCreateEventFromMonthView: checked,
                        })
                    }
                />
                {/* Le doigt seul a le choix. Sur ordinateur, la molette et le
                    pave tactile ne rendent bien qu'en defilement libre : la
                    grille y defile toujours librement et il n'y a donc rien a
                    regler. La ligne n'apparait que sur telephone, ou une
                    balayee doit pouvoir se poser sur un jour entier. */}
                {isAndroid && (
                    <SettingsToggleRow
                        label={t("Free scrolling between days")}
                        icon={<Columns2 size={18} />}
                        checked={preferences.freeScroll}
                        onChange={(checked) =>
                            patchPreferences({ freeScroll: checked })
                        }
                    />
                )}
                <SettingsChoiceRow
                    label={t("Reminder")}
                    icon={<Bell size={18} />}
                    value={String(preferences.reminderMinutes)}
                    options={[
                        { value: "0", label: t("No reminder") },
                        { value: "5", label: t("5 minutes before") },
                        { value: "10", label: t("10 minutes before") },
                        { value: "15", label: t("15 minutes before") },
                        { value: "30", label: t("30 minutes before") },
                        { value: "60", label: t("1 hour before") },
                    ]}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchPreferences({ reminderMinutes: Number(value) })
                    }
                />
                {/* Suivre le lieu d'un evenement ouvre un itineraire depuis
                    la position de l'appareil ; comment on compte s'y rendre ne
                    se devine pas. Au repos la carte tranche, ce qu'elle fait
                    mieux qu'un reglage pose une fois puis oublie. */}
                <SettingsChoiceRow
                    label={t("Travel mode")}
                    icon={<Route size={18} />}
                    value={preferences.mapsTravelMode}
                    options={[
                        { value: "auto", label: t("Chosen by Maps") },
                        { value: "transit", label: t("Public transport") },
                        { value: "driving", label: t("Driving") },
                        { value: "walking", label: t("Walking") },
                        { value: "bicycling", label: t("Cycling") },
                    ]}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchPreferences({
                            mapsTravelMode: value as MapsTravelMode,
                        })
                    }
                />
                {/* Le menu au repos : d'un cours en metro a un rendez-vous
                    en voiture, l'application qui convient change. Regle, il
                    n'y a plus de menu et le lieu s'ouvre du premier coup.

                    Citymapper, Moovit et Waze ne visent qu'un point : sur un
                    evenement qui n'en a pas, le lieu retombe sur Maps, seule a
                    savoir lire une adresse ecrite a la main. */}
                <SettingsChoiceRow
                    label={t("Maps app")}
                    icon={<Map size={18} />}
                    value={preferences.mapsApp}
                    options={[
                        { value: "ask", label: t("Ask each time") },
                        { value: "google", label: "Google Maps" },
                        { value: "citymapper", label: "Citymapper" },
                        { value: "moovit", label: "Moovit" },
                        { value: "waze", label: "Waze" },
                    ]}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchPreferences({ mapsApp: value as MapsAppChoice })
                    }
                />
                <SettingsToggleRow
                    label={t("New events created as tasks")}
                    icon={<Check size={18} />}
                    checked={preferences.defaultEventsAsTasks}
                    onChange={(checked) =>
                        patchPreferences({ defaultEventsAsTasks: checked })
                    }
                />
                {/* Only offered when there is something to repair: a row
                    reading "0" invites you to press it for nothing. */}
                {misfiledEventCount > 0 && (
                    <SettingsRow
                        label={t("Convert timed tasks back to events")}
                        icon={<Check size={18} />}
                        value={String(misfiledEventCount)}
                        onClick={() => {
                            setConvertedCount(null);
                            setConvertOpen(true);
                        }}
                        navigates
                    />
                )}
                {convertedCount !== null && (
                    <p className="nc-set-group__note">
                        {`${convertedCount} ${t(
                            "entries converted back to events."
                        )}`}
                    </p>
                )}
            </SettingsGroup>

            {/* Colour mode sits directly under the theme rather than inside
                the appearance page: going light-to-dark is a decision taken
                often, and four taps for it is three too many. */}
            <SettingsGroup title={t("Appearance")}>
                <SettingsRow
                    label={t("Theme")}
                    icon={<Palette size={18} />}
                    value={currentTheme.label}
                    navigates
                    onClick={() =>
                        openPage({ kind: "section", id: "appearance" })
                    }
                />
                <SettingsChoiceRow
                    label={t("Colour mode")}
                    icon={<Moon size={18} />}
                    value={appearance.mode}
                    options={[
                        {
                            value: "system",
                            label: t("System"),
                            icon: <Smartphone size={19} />,
                        },
                        {
                            value: "light",
                            label: t("Light"),
                            icon: <SunMedium size={19} />,
                        },
                        {
                            value: "dark",
                            label: t("Dark"),
                            icon: <Moon size={19} />,
                        },
                    ]}
                    onOpen={openChoice}
                    onChange={(mode) =>
                        updateAppearance({ mode: mode as AppearanceMode })
                    }
                />
                <SettingsChoiceRow
                    label={t("Language")}
                    icon={<Languages size={18} />}
                    value={getLanguage()}
                    options={LANGUAGES}
                    onOpen={openChoice}
                    onChange={(language) => setLanguage(language as Language)}
                />
            </SettingsGroup>

            {!desktop && (
                <>
                    <SettingsGroup title={t("Integrations")}>
                        <SettingsRow
                            label={t("Calendars")}
                            icon={<CalendarDays size={18} />}
                            value={String(calendars.length)}
                            navigates
                            onClick={() =>
                                openPage({
                                    kind: "section",
                                    id: "calendars",
                                })
                            }
                        />
                        <SettingsRow
                            label={t("Time zones")}
                            icon={<Globe size={18} />}
                            value={
                                secondaryTimezoneCount === 0
                                    ? t("None")
                                    : String(secondaryTimezoneCount)
                            }
                            navigates
                            onClick={() =>
                                openPage({
                                    kind: "section",
                                    id: "timezones",
                                })
                            }
                        />
                    </SettingsGroup>

                    <SettingsGroup title={t("Data")}>
                        <SettingsRow
                            label={t("Data folder")}
                            icon={<FolderOpen size={18} />}
                            value={folderName(dataFolder)}
                            navigates
                            onClick={() =>
                                openPage({ kind: "section", id: "folder" })
                            }
                        />
                        <SettingsRow
                            label={t("Obsidian vaults")}
                            icon={<Library size={18} />}
                            value={
                                vaultFolders.length === 0
                                    ? t("No folder")
                                    : String(enabledVaultCount)
                            }
                            navigates
                            onClick={() =>
                                openPage({ kind: "section", id: "vaults" })
                            }
                        />
                        <SettingsRow
                            label={t("Sync")}
                            icon={<RefreshCw size={18} />}
                            navigates
                            onClick={() =>
                                openPage({ kind: "section", id: "sync" })
                            }
                        />
                    </SettingsGroup>
                </>
            )}

            {/* At the foot of the page, where every app puts it. It is the
                first thing anyone needs when something is wrong, and the only
                thing that cannot be read off the screen otherwise. */}
            <p className="nc-set-version">{__NEO_VERSION__}</p>
        </div>
    );

    const renderTimezones = () => (
        <div className="nc-set-groups">
            <SettingsGroup
                note={t(
                    "An extra hour column appears in the week, day and three-day views."
                )}
            >
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
                        aria-label={t("Add timezone")}
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
                                    aria-label={`${t("Remove")} ${zone}`}
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
            <SettingsGroup
                note={t(
                    "Neo Calendar keeps its calendar files in this folder. Each direct subfolder is a calendar."
                )}
            >
                <div className="nc-set-row nc-set-row--stacked">
                    <code>{readableFolderPath(dataFolder)}</code>
                </div>
                <SettingsRow
                    label={t("Change folder")}
                    icon={<FolderOpen size={18} />}
                    onClick={() => void onChangeDataFolder()}
                />
                <SettingsRow
                    label={t("Open folder")}
                    icon={<ExternalLink size={18} />}
                    onClick={() => void onOpenDataFolder()}
                />
            </SettingsGroup>
        </div>
    );

    const renderVaults = () => (
        <div className="nc-set-groups">
            <SettingsGroup
                note={t(
                    "Add the folder that holds your Obsidian vaults. Those sitting directly inside it with an .obsidian folder are detected."
                )}
            >
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
                                    {folderName(folderPath)}
                                </span>
                                <code>{readableFolderPath(folderPath)}</code>
                            </span>
                            <span className="nc-set-row__trailing">
                                <button
                                    type="button"
                                    className="nc-set-row__icon-button"
                                    onClick={() =>
                                        void onRemoveVaultFolder(folderPath)
                                    }
                                    aria-label={`${t("Remove")} ${folderPath}`}
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
                                        <code>
                                            {readableFolderPath(vault.path)}
                                        </code>
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
            {/* Ce que l'on peut ajouter se dit sous le bloc, pas dans la
                colonne de droite : « Note complète, ICS ou automatique » ne
                tient pas à côté de son libellé sur un téléphone, et s'y
                faisait couper après « ICS ou au… ». */}
            <SettingsGroup
                note={`${t(
                    "Each direct subfolder of the data folder is a calendar."
                )} ${t(
                    "It can be a full note, an ICS subscription, or one detected automatically."
                )}`}
            >
                <SettingsRow
                    label={t("Add calendar")}
                    icon={<Plus size={18} />}
                    navigates
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
                                aria-label={`${t(
                                    calendar.hidden ? "Show" : "Hide"
                                )} ${calendar.name}`}
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
                                aria-label={`${t("Color")} ${calendar.name}`}
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
                                            ? t(
                                                  "Tap to set as default, double-tap to rename"
                                              )
                                            : t(
                                                  "Read-only calendar; double-tap to rename"
                                              )
                                    }
                                >
                                    {calendar.name}
                                </button>
                            )}
                            {calendar.isDefault && (
                                <span className="nc-settings__calendar-default">
                                    {t("Default")}
                                </span>
                            )}
                            <button
                                className="nc-settings__calendar-delete"
                                type="button"
                                onClick={() =>
                                    void onDeleteCalendar(calendar.id)
                                }
                                aria-label={`${t("Delete")} ${calendar.name}`}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </SettingsGroup>
            )}

            <SettingsGroup
                title={t("ICS links")}
                note={t(
                    "This sets every link's frequency to this value and removes any per-link override."
                )}
            >
                <SettingsChoiceRow
                    label={t("Default ICS refresh frequency")}
                    icon={<RefreshCw size={18} />}
                    value={String(preferences.icsDefaultRefreshMinutes)}
                    options={ICS_REFRESH_MINUTES.map((minutes) => ({
                        value: String(minutes),
                        label: icsFrequencyLabel(minutes),
                    }))}
                    onOpen={openChoice}
                    onChange={(value) =>
                        patchPreferences({
                            icsDefaultRefreshMinutes: Number(
                                value
                            ) as IcsRefreshMinutes,
                        })
                    }
                />
                {preferences.icsFeeds.length > 0 && (
                    <SettingsRow
                        label={t("Apply to all links")}
                        icon={<RefreshCw size={18} />}
                        onClick={() => setApplyIcsFrequencyOpen(true)}
                    />
                )}
            </SettingsGroup>
        </div>
    );

    const renderSync = () => (
        <div className="nc-set-groups">
            <SettingsGroup
                note={t(
                    "Neo Calendar keeps its data in the folder you choose. Syncing is done by whichever tool you settle on."
                )}
            >
                <SettingsRow
                    label={t("Data folder")}
                    icon={<FolderOpen size={18} />}
                    value={folderName(dataFolder)}
                    navigates
                    onClick={() => openPage({ kind: "section", id: "folder" })}
                />
            </SettingsGroup>

            <SettingsGroup title={t("Possible methods")}>
                <SettingsRow label="Syncthing" value={t("Recommended")} />
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

    /*
     * L'apparence, en lignes de réglage comme le reste.
     *
     * C'était une fiche à part : un en-tête portant le mode et trois boutons,
     * des rangées séparées par des filets, des cartes bordées pour les curseurs
     * du fond, et deux boutons en pied. Rien de tout cela ne ressemblait à
     * l'écran d'où l'on venait — même écran, deux dessins.
     *
     * Tout passe donc par les mêmes blocs : un titre discret, des lignes
     * pastille-nom-valeur-chevron, et ce qui ne tient pas sur une ligne (un
     * curseur, une pile de polices) prend la seconde ligne en entier plutôt que
     * de se serrer dans la colonne de droite.
     */
    const renderAppearance = () => (
        <div className="nc-set-groups nc-settings__appearance">
            <SettingsGroup title={t("Theme")}>
                {/* Le thème s'ouvre comme n'importe quel autre choix : une page
                    qui liste les thèmes, leur aperçu en guise d'icône. Le menu
                    flottant qui était là ne ressemblait à rien d'autre dans
                    l'écran, et il fallait viser un bouton de trois millimètres
                    pour l'ouvrir. */}
                <SettingsRow
                    label={t("Theme")}
                    icon={<ThemePreview theme={currentTheme} />}
                    value={currentTheme.label}
                    navigates
                    onClick={() =>
                        openChoice({
                            title: t("Themes"),
                            value: themeId,
                            options: THEMES.map((theme) => ({
                                value: theme.id,
                                label: theme.label,
                                icon: <ThemePreview theme={theme} />,
                            })),
                            onPick: (next) => {
                                setThemeDirty(false);
                                setThemeMessage(null);
                                void onThemeChange(next as ThemeId);
                            },
                        })
                    }
                />
                <SettingsRow
                    label={t("Import a theme")}
                    icon={<Upload size={18} />}
                    onClick={() => importThemeInputRef.current?.click()}
                />
                <SettingsRow
                    label={t("Copy theme")}
                    icon={<Copy size={18} />}
                    onClick={() => void copyCurrentTheme()}
                />
            </SettingsGroup>

            <SettingsGroup title={t("Colours")}>
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
                <SettingsSliderRow
                    label={t("Contrast")}
                    icon={<SunMedium size={18} />}
                    value={themeDraft.contrast}
                    min={0}
                    max={100}
                    step={1}
                    format={(value) => String(Math.round(value))}
                    defaultValue={currentTheme.contrast}
                    onChange={(contrast) => updateThemeDraft({ contrast })}
                    onReset={() =>
                        updateThemeDraft({ contrast: currentTheme.contrast })
                    }
                />
            </SettingsGroup>

            <SettingsGroup
                title={t("Wallpaper")}
                note={t("The preview and the app update instantly.")}
            >
                <ThemeWallpaperPicker
                    value={themeDraft.wallpaperId}
                    accent={themeDraft.accent}
                    surface={themeDraft.surface}
                    onChange={applyWallpaper}
                />
                <WallpaperEffectsControls />
                <SettingsToggleRow
                    label={t("Translucent sidebar")}
                    icon={<PanelLeft size={18} />}
                    checked={themeDraft.translucentSidebar}
                    onChange={(translucentSidebar) =>
                        updateThemeDraft({ translucentSidebar })
                    }
                />
            </SettingsGroup>

            <SettingsGroup title={t("Fonts")}>
                <SettingsFieldRow
                    label={t("Interface font")}
                    icon={<Type size={18} />}
                    value={themeDraft.uiFont}
                    list="nc-ui-fonts"
                    onChange={(uiFont) => updateThemeDraft({ uiFont })}
                >
                    <datalist id="nc-ui-fonts">
                        <option value={'"Inter Variable", Inter, sans-serif'} />
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
                </SettingsFieldRow>
                <SettingsFieldRow
                    label={t("Monospace font")}
                    icon={<Code2 size={18} />}
                    value={themeDraft.codeFont}
                    list="nc-code-fonts"
                    onChange={(codeFont) => updateThemeDraft({ codeFont })}
                >
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
                </SettingsFieldRow>
            </SettingsGroup>

            {/* Le fond s'applique tout de suite ; une couleur ou une police
                attend d'être enregistrée. La ligne le dit plutôt que de laisser
                un bouton grisé le sous-entendre. */}
            <SettingsGroup note={themeMessage ?? undefined}>
                <SettingsRow
                    label={t("Save")}
                    icon={<Save size={18} />}
                    value={themeDirty ? t("Unsaved changes") : undefined}
                    disabled={!themeDirty}
                    onClick={saveThemeChanges}
                />
                <SettingsRow
                    label={t("Reset this theme")}
                    icon={<RotateCcw size={18} />}
                    onClick={resetCurrentTheme}
                />
            </SettingsGroup>

            <input
                ref={importThemeInputRef}
                className="nc-theme-import-input"
                type="file"
                accept=".json,.txt,application/json,text/plain"
                onChange={(event) =>
                    void importThemeFile(event.target.files?.[0])
                }
            />
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

    const renderPage = (page: SettingsPage, desktop = false) => {
        if (page.kind === "root") return renderRoot(desktop);
        return renderSection(page.id);
    };

    /*
     * The stack splits where the first dialog section appears: everything below
     * stays a page and keeps the header, everything from there up is drawn over
     * it. Only the topmost dialog is shown — one panel at a time, and the back
     * arrow (or Escape, or the scrim) takes off one layer, exactly as before.
     */
    const dialogAt = isAndroid ? stack.findIndex(isDialogSection) : -1;
    const pages = dialogAt === -1 ? stack : stack.slice(0, dialogAt);
    const dialog =
        isAndroid && dialogAt !== -1 ? stack[stack.length - 1] : null;
    const headerPage = pages[pages.length - 1] ?? { kind: "root" as const };

    type DesktopNavigationId = "general" | SettingsSection;
    const desktopNavigation: Array<{
        id: DesktopNavigationId;
        label: string;
        icon: React.ReactNode;
        group: "settings" | "data";
    }> = [
        {
            id: "general",
            label: t("General"),
            icon: <SettingsIcon size={17} />,
            group: "settings",
        },
        {
            id: "calendars",
            label: t("Calendars"),
            icon: <CalendarDays size={17} />,
            group: "settings",
        },
        {
            id: "appearance",
            label: t("Appearance"),
            icon: <Palette size={17} />,
            group: "settings",
        },
        {
            id: "timezones",
            label: t("Time zones"),
            icon: <Globe size={17} />,
            group: "settings",
        },
        {
            id: "folder",
            label: t("Data folder"),
            icon: <FolderOpen size={17} />,
            group: "data",
        },
        {
            id: "vaults",
            label: t("Obsidian vaults"),
            icon: <Library size={17} />,
            group: "data",
        },
        {
            id: "sync",
            label: t("Sync"),
            icon: <RefreshCw size={17} />,
            group: "data",
        },
    ];

    const normalizeSearch = (value: string) =>
        value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase(getLanguage());
    const normalizedSettingsSearch = normalizeSearch(settingsSearch.trim());
    const visibleDesktopNavigation = desktopNavigation.filter((item) =>
        normalizeSearch(item.label).includes(normalizedSettingsSearch)
    );
    const activeDesktopNavigation: DesktopNavigationId =
        currentPage.kind === "section" ? currentPage.id : "general";

    const navigateDesktop = (id: DesktopNavigationId) => {
        setLeaving(null);
        setStack(
            id === "general"
                ? [{ kind: "root" }]
                : [{ kind: "root" }, { kind: "section", id }]
        );
    };

    const desktopTitle =
        currentPage.kind === "root" ? t("General") : pageTitle(currentPage);

    const renderDesktopNavigationGroup = (
        group: "settings" | "data",
        title: string
    ) => {
        const items = visibleDesktopNavigation.filter(
            (item) => item.group === group
        );
        if (items.length === 0) return null;
        return (
            <div className="nc-settings__nav-group">
                <p className="nc-settings__nav-heading">{title}</p>
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className="nc-settings__nav-item"
                        aria-current={
                            activeDesktopNavigation === item.id
                                ? "page"
                                : undefined
                        }
                        onClick={() => navigateDesktop(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        );
    };

    const content = (
        <div
            className="nc-settings-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className={`nc-settings${
                    isAndroid ? "" : " nc-settings--desktop"
                }`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-settings-title"
                data-settings-page={
                    currentPage.kind === "section" ? currentPage.id : "general"
                }
            >
                {isAndroid ? (
                    <>
                        <header className="nc-settings__header">
                            <button
                                className="nc-settings__back"
                                type="button"
                                onClick={goBack}
                                aria-label={
                                    stack.length > 1
                                        ? t("Back")
                                        : t("Close settings")
                                }
                            >
                                <ArrowLeft size={22} />
                            </button>
                            <h2 id="nc-settings-title">
                                {pageTitle(headerPage)}
                            </h2>
                        </header>

                        {/* Every page occupies the same slot: the one on top
                            slides in from the right, while the page underneath
                            keeps its scroll position. */}
                        <div className="nc-settings__pages">
                            {pages.map((page, index) => {
                                const buried = index < pages.length - 1;
                                return (
                                    <div
                                        className={`nc-settings__page${
                                            buried
                                                ? " nc-settings__page--buried"
                                                : ""
                                        }`}
                                        key={pageKey(page)}
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
                    </>
                ) : (
                    <div className="nc-settings__desktop-shell">
                        <aside className="nc-settings__sidebar">
                            <label className="nc-settings__search">
                                <Search size={17} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={settingsSearch}
                                    placeholder={t("Search")}
                                    aria-label={t("Search settings")}
                                    onChange={(event) =>
                                        setSettingsSearch(event.target.value)
                                    }
                                />
                            </label>
                            <nav
                                className="nc-settings__navigation"
                                aria-label={t("Settings sections")}
                            >
                                {renderDesktopNavigationGroup(
                                    "settings",
                                    t("Settings")
                                )}
                                {renderDesktopNavigationGroup(
                                    "data",
                                    t("Data and integrations")
                                )}
                                {visibleDesktopNavigation.length === 0 && (
                                    <p className="nc-settings__nav-empty">
                                        {t("No settings found")}
                                    </p>
                                )}
                            </nav>
                            <p className="nc-settings__sidebar-version">
                                Neo Calendar&nbsp; {__NEO_VERSION__}
                            </p>
                        </aside>

                        <main className="nc-settings__desktop-main">
                            <header className="nc-settings__desktop-header">
                                <h2 id="nc-settings-title">{desktopTitle}</h2>
                                <button
                                    type="button"
                                    className="nc-settings__close"
                                    onClick={onClose}
                                    aria-label={t("Close settings")}
                                >
                                    <X size={20} />
                                </button>
                            </header>
                            <div
                                className="nc-settings__desktop-page"
                                key={pageKey(currentPage)}
                            >
                                {renderPage(currentPage, true)}
                            </div>
                        </main>
                    </div>
                )}
            </section>

            {/* A submenu small enough to be taken over the screen. Drawn after
                the pages so it sits above them, and before the choice dialog so
                a choice made inside it lands on top. */}
            {dialog && dialog.kind === "section" && (
                <SettingsDialog
                    title={SECTION_TITLES[dialog.id]}
                    onClose={goBack}
                >
                    {renderSection(dialog.id)}
                </SettingsDialog>
            )}

            {choice && (
                <SettingsChoiceDialog
                    choice={choice}
                    onClose={() => setChoice(null)}
                />
            )}

            <ConfirmDialog
                open={applyIcsFrequencyOpen}
                title={t("Apply to all links")}
                message={`${t(
                    "Apply this frequency to every ICS link on every calendar?"
                )} ${t(
                    "This sets every link's frequency to this value and removes any per-link override."
                )}`}
                confirmLabel={t("Apply to all links")}
                onClose={() => setApplyIcsFrequencyOpen(false)}
                onConfirm={async () => {
                    await onPreferencesChange({
                        icsFeeds: preferences.icsFeeds.map(
                            ({ refreshMinutes: _refreshMinutes, ...feed }) =>
                                feed
                        ),
                    });
                }}
            />

            <ConfirmDialog
                open={convertOpen}
                title={t("Convert timed tasks back to events")}
                message={`${misfiledEventCount} ${t(
                    "entries have both a start and an end time, which is the shape of an event rather than a task. They will lose their checkbox. All-day tasks and anything already completed are left untouched."
                )}`}
                confirmLabel={t("Convert")}
                onClose={() => setConvertOpen(false)}
                onConfirm={async () => {
                    setConvertedCount(await onConvertMisfiledEvents());
                    setConvertOpen(false);
                }}
            />
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
