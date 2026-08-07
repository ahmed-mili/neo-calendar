import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getTheme, THEMES } from "./themes/registry";
import ThemeColorPicker from "./ThemeColorPicker";
import ThemeWallpaperPicker from "./ThemeWallpaperPicker";
import WallpaperEffectsControls from "./WallpaperEffectsControls";
import { isWallpaperId, type WallpaperId } from "./themes/wallpapers";
import { ThemeId } from "./themes/types";
import {
    SettingsGroup,
    SettingsChoiceRow,
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
    Cable,
    CalendarDays,
    Check,
    Cloud,
    ChevronDown,
    Copy,
    FileText,
    Flag,
    FolderOpen,
    Library,
    Moon,
    Palette,
    Plus,
    Settings2,
    Smartphone,
    Sun,
    Trash2,
    Upload,
    Wifi,
    X,
    RotateCcw,
    Save,
} from "lucide-react";

type SettingsTab = "general" | "calendars" | "appearance" | "sync";

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

const TABS: Array<{
    id: SettingsTab;
    label: string;
    icon: typeof Settings2;
}> = [
    { id: "general", label: "Général", icon: Settings2 },
    { id: "calendars", label: "Calendriers", icon: CalendarDays },
    { id: "appearance", label: "Apparence", icon: Palette },
    { id: "sync", label: "Synchronisation", icon: Cloud },
];

const WEEKDAYS = [
    "Dimanche",
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
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
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
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
     * Select the requested tab only when the settings window is opened (or when
     * a caller explicitly changes initialTab). Keeping this separate from the
     * Escape listener prevents theme-picker state and parent callback updates
     * from resetting the user back to the General tab.
     */
    useEffect(() => {
        if (open) setActiveTab(initialTab);
    }, [initialTab, open]);

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (themePickerOpen) {
                setThemePickerOpen(false);
                return;
            }
            if (!editingCalendarId) onClose();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [editingCalendarId, onClose, open, themePickerOpen]);

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

    if (!open) return null;

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
            setThemeMessage("Les couleurs doivent utiliser le format #RRGGBB");
            return;
        }
        const next = setThemeCustomization(appearance, themeId, themeDraft);
        setAppearance(next);
        setThemeDraft(createThemeDraft(themeId, next));
        setThemeDirty(false);
        setThemeMessage("Modifications enregistrées");
    };

    const resetCurrentTheme = () => {
        const next = resetThemeCustomization(appearance, themeId);
        setAppearance(next);
        setThemeDraft(createThemeDraft(themeId, next));
        setThemeDirty(false);
        setThemeMessage("Thème réinitialisé");
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
            setThemeMessage("Thème copié");
        } catch {
            setThemeMessage("Impossible de copier le thème");
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
            setThemeMessage("Fichier de thème invalide");
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
                data-settings-tab={activeTab}
            >
                <header className="nc-settings__header">
                    <h2 id="nc-settings-title">Paramètres</h2>
                    <button
                        className="nc-settings__close"
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer les paramètres"
                    >
                        <X size={18} />
                    </button>
                </header>
                <div className="nc-settings__body">
                    <nav className="nc-settings__tabs" aria-label="Paramètres">
                        {TABS.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                className="nc-settings__tab"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === id}
                                onClick={() => setActiveTab(id)}
                            >
                                <Icon size={16} />
                                <span>{label}</span>
                            </button>
                        ))}
                    </nav>
                    <div className="nc-settings__content">
                        {activeTab === "general" && (
                            <div className="nc-settings__section">
                                <h3>Préférences du calendrier</h3>
                                <div className="nc-settings__preference-list">
                                    <SelectPreference
                                        title="Vue initiale sur ordinateur"
                                        description="La vue affichée au lancement sur ordinateur."
                                        value={preferences.initialView.desktop}
                                        onChange={(value) =>
                                            patchInitialView({
                                                desktop:
                                                    value as DesktopInitialView,
                                            })
                                        }
                                        options={[
                                            ["day", "Jour"],
                                            ["week", "Semaine"],
                                            ["month", "Mois"],
                                            ["list", "Liste"],
                                        ]}
                                    />
                                    <SelectPreference
                                        title="Vue initiale sur téléphone"
                                        description="La vue affichée au lancement sur téléphone."
                                        value={preferences.initialView.mobile}
                                        onChange={(value) =>
                                            patchInitialView({
                                                mobile: value as MobileInitialView,
                                            })
                                        }
                                        options={[
                                            ["day", "Jour"],
                                            ["3days", "3 jours"],
                                            ["list", "Liste"],
                                        ]}
                                    />
                                    <SelectPreference
                                        title="Premier jour de la semaine"
                                        description="Le jour par lequel commencent les semaines."
                                        value={String(preferences.firstDay)}
                                        onChange={(value) =>
                                            patchPreferences({
                                                firstDay: Number(value),
                                            })
                                        }
                                        options={WEEKDAYS.map(
                                            (day, index): [string, string] => [
                                                String(index),
                                                day,
                                            ]
                                        )}
                                    />
                                    <TogglePreference
                                        title="Format 24 heures"
                                        description="Afficher les heures de 0 à 23 plutôt qu'en AM et PM."
                                        checked={preferences.timeFormat24h}
                                        onChange={(checked) =>
                                            patchPreferences({
                                                timeFormat24h: checked,
                                            })
                                        }
                                    />
                                    <TogglePreference
                                        title="Créer un événement en cliquant un jour du mois"
                                        description="Désactiver pour ouvrir la vue du jour à la place."
                                        checked={
                                            preferences.clickToCreateEventFromMonthView
                                        }
                                        onChange={(checked) =>
                                            patchPreferences({
                                                clickToCreateEventFromMonthView:
                                                    checked,
                                            })
                                        }
                                    />
                                    <TogglePreference
                                        title="Créer les nouveaux événements comme des tâches"
                                        description="Les nouveaux événements sont créés avec le statut « À faire »."
                                        checked={
                                            preferences.defaultEventsAsTasks
                                        }
                                        onChange={(checked) =>
                                            patchPreferences({
                                                defaultEventsAsTasks: checked,
                                            })
                                        }
                                    />
                                </div>

                                <div className="nc-settings__divider" />

                                <h3>Fuseaux horaires secondaires</h3>
                                <div className="nc-settings__timezone-add">
                                    <div>
                                        <strong>
                                            Ajouter un fuseau secondaire
                                        </strong>
                                        <span>
                                            Afficher une colonne d'heures
                                            supplémentaire dans les vues
                                            semaine, jour et trois jours.
                                        </span>
                                    </div>
                                    <div className="nc-settings__timezone-control">
                                        <input
                                            value={timezone}
                                            placeholder="ex. America/New_York"
                                            onChange={(event) =>
                                                setTimezone(event.target.value)
                                            }
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
                                            <Plus size={17} />
                                        </button>
                                    </div>
                                </div>
                                {preferences.secondaryTimezones.map((zone) => (
                                    <div
                                        className="nc-settings__timezone-item"
                                        key={zone}
                                    >
                                        <span>{zone}</span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                patchPreferences({
                                                    secondaryTimezones:
                                                        preferences.secondaryTimezones.filter(
                                                            (item) =>
                                                                item !== zone
                                                        ),
                                                })
                                            }
                                            aria-label={`Remove ${zone}`}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}

                                <div className="nc-settings__divider" />

                                <h3>Dossier de données</h3>
                                <p>
                                    Neo Calendar range ses fichiers de
                                    calendrier dans ce dossier.
                                </p>
                                <FolderSetting
                                    dataFolder={dataFolder}
                                    onChangeDataFolder={onChangeDataFolder}
                                />

                                <div className="nc-settings__divider" />

                                <div className="nc-settings__section-heading">
                                    <div>
                                        <h3>Dossiers de coffres Obsidian</h3>
                                        <p>
                                            Ajoutez le dossier qui contient vos
                                            coffres Obsidian. Ceux qui s'y
                                            trouvent directement et possèdent un
                                            dossier .obsidian sont détectés.
                                        </p>
                                    </div>
                                    <button
                                        className="nc-settings__primary-action"
                                        type="button"
                                        onClick={() => void onAddVaultFolder()}
                                        disabled={isChoosingVaultFolder}
                                    >
                                        <Plus size={16} />
                                        {isChoosingVaultFolder
                                            ? "Sélection…"
                                            : "Ajouter un dossier"}
                                    </button>
                                </div>

                                <div className="nc-settings__vault-list">
                                    {vaultFolders.length === 0 ? (
                                        <div className="nc-settings__vault-empty">
                                            <FolderOpen size={20} />
                                            <div>
                                                <strong>
                                                    Aucun dossier de coffres
                                                </strong>
                                                <span>
                                                    Choisissez le dossier qui
                                                    contient vos coffres.
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        vaultFolders.map((folderPath) => (
                                            <div
                                                className="nc-settings__vault-item nc-settings__vault-root"
                                                key={folderPath}
                                            >
                                                <span className="nc-settings__vault-icon">
                                                    <FolderOpen size={17} />
                                                </span>
                                                <div className="nc-settings__vault-copy">
                                                    <strong>
                                                        {vaultName(folderPath)}
                                                    </strong>
                                                    <code>{folderPath}</code>
                                                </div>
                                                <button
                                                    className="nc-settings__vault-remove"
                                                    type="button"
                                                    onClick={() =>
                                                        void onRemoveVaultFolder(
                                                            folderPath
                                                        )
                                                    }
                                                    aria-label={`Remove ${folderPath}`}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {vaultFolders.length > 0 && (
                                    <div className="nc-settings__detected-vaults">
                                        <div className="nc-settings__detected-heading">
                                            <div>
                                                <h4>Coffres détectés</h4>
                                                <p>
                                                    Désactivez un coffre pour
                                                    l'exclure de la recherche de
                                                    notes.
                                                </p>
                                            </div>
                                            {isScanningVaults && (
                                                <span>Scanning…</span>
                                            )}
                                        </div>
                                        <div className="nc-settings__vault-list">
                                            {detectedVaults.map((vault) => {
                                                const enabled = isVaultEnabled(
                                                    vault.path
                                                );
                                                return (
                                                    <div
                                                        className="nc-settings__vault-item"
                                                        key={vault.path}
                                                    >
                                                        <span className="nc-settings__vault-icon">
                                                            <Library
                                                                size={17}
                                                            />
                                                        </span>
                                                        <div className="nc-settings__vault-copy">
                                                            <strong>
                                                                {vault.name}
                                                            </strong>
                                                            <code>
                                                                {vault.path}
                                                            </code>
                                                        </div>
                                                        <button
                                                            className="nc-settings__vault-toggle"
                                                            type="button"
                                                            role="switch"
                                                            aria-checked={
                                                                enabled
                                                            }
                                                            onClick={() =>
                                                                void onSetVaultEnabled(
                                                                    vault.path,
                                                                    !enabled
                                                                )
                                                            }
                                                        >
                                                            <span />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "calendars" && (
                            <div className="nc-settings__section">
                                <h3>Gérer les calendriers</h3>
                                <div className="nc-settings__calendar-root">
                                    <div>
                                        <strong>
                                            Dossier racine des calendriers
                                        </strong>
                                        <span>
                                            Full-note calendars are direct
                                            subfolders of this folder.
                                        </span>
                                    </div>
                                    <code>{dataFolder}</code>
                                    <button
                                        type="button"
                                        onClick={() => void onOpenDataFolder()}
                                    >
                                        <FolderOpen size={16} />
                                    </button>
                                </div>

                                <div className="nc-settings__calendar-add">
                                    <div>
                                        <strong>Calendars</strong>
                                        <span>Ajouter un calendrier</span>
                                    </div>
                                    <div className="nc-settings__calendar-add-control">
                                        <span>
                                            Full note / Remote ICS / Auto
                                        </span>
                                        <button
                                            type="button"
                                            onClick={onAddCalendar}
                                            aria-label="Ajouter un calendrier"
                                        >
                                            <Plus size={17} />
                                        </button>
                                    </div>
                                </div>

                                <div className="nc-settings__calendar-list">
                                    {calendars.map((calendar) => (
                                        <div
                                            className="nc-settings__calendar-item"
                                            key={calendar.id}
                                        >
                                            <span
                                                className="nc-settings__calendar-kind"
                                                title={
                                                    calendar.type === "local"
                                                        ? "Note complète"
                                                        : calendar.type ===
                                                          "ical"
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
                                                    calendar.hidden
                                                        ? " is-hidden"
                                                        : ""
                                                }`}
                                                type="button"
                                                onClick={() =>
                                                    onToggleCalendar(
                                                        calendar.id
                                                    )
                                                }
                                                aria-label={`${
                                                    calendar.hidden
                                                        ? "Show"
                                                        : "Hide"
                                                } ${calendar.name}`}
                                            >
                                                {!calendar.hidden && (
                                                    <Check size={14} />
                                                )}
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
                                                aria-label={`Color for ${calendar.name}`}
                                            />
                                            {editingCalendarId ===
                                            calendar.id ? (
                                                <input
                                                    className="nc-settings__calendar-name-input"
                                                    value={calendarName}
                                                    autoFocus
                                                    onChange={(event) =>
                                                        setCalendarName(
                                                            event.target.value
                                                        )
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                            "Enter"
                                                        ) {
                                                            event.preventDefault();
                                                            void submitCalendarRename(
                                                                calendar.id
                                                            );
                                                        } else if (
                                                            event.key ===
                                                            "Escape"
                                                        ) {
                                                            setEditingCalendarId(
                                                                null
                                                            );
                                                        }
                                                    }}
                                                    onBlur={() =>
                                                        void submitCalendarRename(
                                                            calendar.id
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="nc-settings__calendar-name"
                                                    onDoubleClick={() => {
                                                        setEditingCalendarId(
                                                            calendar.id
                                                        );
                                                        setCalendarName(
                                                            calendar.name
                                                        );
                                                    }}
                                                    onClick={() => {
                                                        if (calendar.editable) {
                                                            onSetDefaultCalendar(
                                                                calendar.id
                                                            );
                                                        }
                                                    }}
                                                    title={
                                                        calendar.editable
                                                            ? "Cliquer pour définir par défaut, double-cliquer pour renommer"
                                                            : "Read-only calendar; double-click to rename"
                                                    }
                                                >
                                                    {calendar.name}
                                                </button>
                                            )}
                                            {calendar.isDefault && (
                                                <span className="nc-settings__calendar-default">
                                                    Default
                                                </span>
                                            )}
                                            <button
                                                className="nc-settings__calendar-delete"
                                                type="button"
                                                onClick={() =>
                                                    void onDeleteCalendar(
                                                        calendar.id
                                                    )
                                                }
                                                aria-label={`Delete ${calendar.name}`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === "appearance" && (
                            <div className="nc-settings__section nc-settings__appearance">
                                <h3>Thème</h3>
                                <p>
                                    Chaque thème peut avoir ses propres
                                    couleurs, polices, contraste et
                                    transparence.
                                </p>

                                {/* One row that opens three choices, rather
                                    than three cards competing for attention:
                                    picking an appearance mode is a one-second
                                    decision taken once. */}
                                <div className="nc-set-groups">
                                    <SettingsGroup>
                                        <SettingsChoiceRow
                                            label="Mode de couleur"
                                            icon={<Moon size={18} />}
                                            value={appearance.mode}
                                            options={[
                                                {
                                                    value: "system",
                                                    label: "Système",
                                                    icon: (
                                                        <Smartphone size={17} />
                                                    ),
                                                },
                                                {
                                                    value: "light",
                                                    label: "Clair",
                                                    icon: <Sun size={17} />,
                                                },
                                                {
                                                    value: "dark",
                                                    label: "Sombre",
                                                    icon: <Moon size={17} />,
                                                },
                                            ]}
                                            onChange={(mode) =>
                                                updateAppearance({ mode })
                                            }
                                        />
                                    </SettingsGroup>
                                </div>

                                <section className="nc-theme-studio">
                                    <header className="nc-theme-studio__header">
                                        <strong>
                                            {appearance.mode === "system"
                                                ? "Mode système"
                                                : appearance.mode === "light"
                                                ? "Mode clair"
                                                : "Mode sombre"}
                                        </strong>
                                        <div className="nc-theme-studio__actions">
                                            <input
                                                ref={importThemeInputRef}
                                                className="nc-theme-import-input"
                                                type="file"
                                                accept=".json,.txt,application/json,text/plain"
                                                onChange={(event) =>
                                                    void importThemeFile(
                                                        event.target.files?.[0]
                                                    )
                                                }
                                            />
                                            <button
                                                type="button"
                                                className="nc-theme-text-action"
                                                onClick={() =>
                                                    importThemeInputRef.current?.click()
                                                }
                                            >
                                                <Upload size={14} />
                                                Importer
                                            </button>
                                            <button
                                                type="button"
                                                className="nc-theme-text-action"
                                                onClick={() =>
                                                    void copyCurrentTheme()
                                                }
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
                                                    aria-expanded={
                                                        themePickerOpen
                                                    }
                                                    onClick={() =>
                                                        setThemePickerOpen(
                                                            (open) => !open
                                                        )
                                                    }
                                                >
                                                    <ThemePreview
                                                        theme={currentTheme}
                                                    />
                                                    <span>
                                                        {currentTheme.label}
                                                    </span>
                                                    <ChevronDown
                                                        className={
                                                            themePickerOpen
                                                                ? "nc-open"
                                                                : undefined
                                                        }
                                                        size={15}
                                                    />
                                                </button>

                                                {themePickerOpen && (
                                                    <div
                                                        className="nc-settings__theme-menu"
                                                        role="listbox"
                                                        aria-label="Thèmes"
                                                    >
                                                        {THEMES.map((theme) => {
                                                            const selected =
                                                                theme.id ===
                                                                themeId;
                                                            return (
                                                                <button
                                                                    key={
                                                                        theme.id
                                                                    }
                                                                    className="nc-settings__theme-option"
                                                                    type="button"
                                                                    role="option"
                                                                    aria-selected={
                                                                        selected
                                                                    }
                                                                    onClick={() => {
                                                                        setThemePickerOpen(
                                                                            false
                                                                        );
                                                                        setThemeDirty(
                                                                            false
                                                                        );
                                                                        setThemeMessage(
                                                                            null
                                                                        );
                                                                        void onThemeChange(
                                                                            theme.id
                                                                        );
                                                                    }}
                                                                >
                                                                    <ThemePreview
                                                                        theme={
                                                                            theme
                                                                        }
                                                                    />
                                                                    <span>
                                                                        <strong>
                                                                            {
                                                                                theme.label
                                                                            }
                                                                        </strong>
                                                                        <small>
                                                                            {
                                                                                theme.variantLabel
                                                                            }
                                                                        </small>
                                                                    </span>
                                                                    {selected && (
                                                                        <Check
                                                                            size={
                                                                                16
                                                                            }
                                                                        />
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </header>

                                    <ThemeColorPicker
                                        label="Accentuation"
                                        value={themeDraft.accent}
                                        emphasized
                                        onChange={(accent) =>
                                            updateThemeDraft({ accent })
                                        }
                                    />
                                    <ThemeColorPicker
                                        label="Arrière-plan"
                                        value={themeDraft.surface}
                                        onChange={(surface) =>
                                            updateThemeDraft({ surface })
                                        }
                                    />
                                    <ThemeColorPicker
                                        label="Avant-plan"
                                        value={themeDraft.ink}
                                        onChange={(ink) =>
                                            updateThemeDraft({ ink })
                                        }
                                    />
                                    <ThemeWallpaperPicker
                                        value={themeDraft.wallpaperId}
                                        accent={themeDraft.accent}
                                        surface={themeDraft.surface}
                                        onChange={applyWallpaper}
                                    />
                                    <WallpaperEffectsControls />
                                    <label className="nc-theme-studio__row nc-theme-font-row">
                                        <span>
                                            Police de l’interface utilisateur
                                        </span>
                                        <input
                                            type="text"
                                            list="nc-ui-fonts"
                                            value={themeDraft.uiFont}
                                            onChange={(event) =>
                                                updateThemeDraft({
                                                    uiFont: event.target.value,
                                                })
                                            }
                                            spellCheck={false}
                                        />
                                        <datalist id="nc-ui-fonts">
                                            <option
                                                value={
                                                    '"Inter Variable", Inter, sans-serif'
                                                }
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
                                                updateThemeDraft({
                                                    codeFont:
                                                        event.target.value,
                                                })
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
                                                value={
                                                    '"Cascadia Code", Consolas, monospace'
                                                }
                                            />
                                        </datalist>
                                    </label>
                                    <div className="nc-theme-studio__row">
                                        <span>Barre latérale translucide</span>
                                        <button
                                            className="nc-theme-switch"
                                            type="button"
                                            role="switch"
                                            aria-checked={
                                                themeDraft.translucentSidebar
                                            }
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
                                                    contrast: Number(
                                                        event.target.value
                                                    ),
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
                                        <p
                                            className="nc-theme-studio__message"
                                            role="status"
                                        >
                                            {themeMessage}
                                        </p>
                                    )}
                                </section>
                            </div>
                        )}

                        {activeTab === "sync" && (
                            <div className="nc-settings__section">
                                <h3>Synchronisation</h3>
                                <p>
                                    Neo Calendar range ses données dans le
                                    dossier que vous choisissez. La
                                    synchronisation est assurée par l'outil que
                                    vous retenez.
                                </p>
                                <FolderSetting
                                    dataFolder={dataFolder}
                                    onChangeDataFolder={onChangeDataFolder}
                                />
                                <div className="nc-sync-options">
                                    <article className="nc-sync-option nc-sync-option--recommended">
                                        <div className="nc-sync-option__icon">
                                            <Cloud size={19} />
                                        </div>
                                        <div>
                                            <div className="nc-sync-option__title">
                                                <strong>Syncthing</strong>
                                                <span>Recommandé</span>
                                            </div>
                                            <p>
                                                Synchronisation directe du
                                                dossier entre votre PC Windows
                                                et votre téléphone Android.
                                            </p>
                                        </div>
                                    </article>
                                    <article className="nc-sync-option">
                                        <div className="nc-sync-option__icon">
                                            <Cloud size={19} />
                                        </div>
                                        <div>
                                            <strong>Stockage en ligne</strong>
                                            <p>
                                                OneDrive, Google Drive ou
                                                Dropbox, avec un outil de
                                                synchronisation de dossier
                                                compatible.
                                            </p>
                                        </div>
                                    </article>
                                    <article className="nc-sync-option">
                                        <div className="nc-sync-option__icon">
                                            <Cable size={19} />
                                        </div>
                                        <div>
                                            <strong>Transfert manuel</strong>
                                            <p>
                                                Copier le dossier de données par
                                                USB ou par tout autre moyen, au
                                                besoin.
                                            </p>
                                        </div>
                                    </article>
                                </div>
                            </div>
                        )}
                    </div>
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

function SelectPreference({
    title,
    description,
    value,
    options,
    onChange,
}: {
    title: string;
    description: string;
    value: string;
    options: Array<[string, string]>;
    onChange: (value: string) => void;
}) {
    // A native <select> on Android is drawn by the system, so it ignores the
    // theme entirely and lands as a grey box in the middle of the glass. The
    // choice sheet is ours, and reads the chosen option back by its label.
    return (
        <SettingsChoiceRow
            label={title}
            value={value}
            options={options.map(([optionValue, label]) => ({
                value: optionValue,
                label,
            }))}
            onChange={onChange}
        />
    );
}

function TogglePreference({
    title,
    description,
    checked,
    onChange,
}: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <SettingsToggleRow
            label={title}
            value={description}
            checked={checked}
            onChange={onChange}
        />
    );
}

function vaultName(path: string): string {
    const normalized = path.replace(/[\\/]+$/, "");
    return normalized.split(/[\\/]/).pop() || path;
}

function FolderSetting({
    dataFolder,
    onChangeDataFolder,
}: Pick<DesktopSettingsProps, "dataFolder" | "onChangeDataFolder">) {
    return (
        <div className="nc-settings__folder">
            <code>{dataFolder}</code>
            <button type="button" onClick={() => void onChangeDataFolder()}>
                <FolderOpen size={16} />
                Changer de dossier
            </button>
        </div>
    );
}
