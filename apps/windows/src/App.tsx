import React, { useCallback, useEffect, useMemo, useState } from "react";
import { watchDesktopUpdates } from "./platform/desktopUpdates";
import { CalendarDays, FolderOpen } from "lucide-react";
import DesktopCalendar from "./DesktopCalendar";
import DesktopErrorBoundary from "./DesktopErrorBoundary";
import { useDesktopBridge } from "./platform/useDesktopBridge";
import {
    APPEARANCE_CHANGE_EVENT,
    AppearancePreferences,
    getEffectiveThemeAppearance,
    loadAppearancePreferences,
    resolveAppearanceMode,
} from "./themes/appearancePreferences";
import { getTheme, THEMES } from "./themes/registry";
import { getWallpaper, isAndroidRuntime } from "./themes/wallpapers";
import { useWallpaperReady } from "./themes/useWallpaperReady";
import WallpaperRenderLayer from "./WallpaperRenderLayer";
import "./themes/wallpaperEffects";
import { t } from "../../../src/ui/i18n";

function readStringProperty(
    value: unknown,
    property: string
): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    const candidate = (value as Record<string, unknown>)[property];
    return typeof candidate === "string" ? candidate : undefined;
}

const CUSTOM_THEME_PROPERTIES = [
    "--nc-user-contrast",
    "--nc-ui-font",
    "--nc-code-font",
    "--interactive-accent",
    "--nc-accent",
    "--nc-theme-accent",
    "--background-primary",
    "--nc-bg-primary",
    "--nc-theme-surface",
    "--background-secondary",
    "--nc-bg-secondary",
    "--background-modifier-form-field",
    "--background-modifier-hover",
    "--background-modifier-border",
    "--background-modifier-border-hover",
    "--text-normal",
    "--nc-text-primary",
    "--nc-theme-ink",
    "--text-muted",
    "--nc-text-secondary",
    "--text-faint",
    "--nc-text-faint",
    "--nc-selected-wallpaper",
    "--nc-selected-wallpaper-overlay",
] as const;

export default function App() {
    const {
        preferences,
        chooseDataFolder,
        detectedVaults,
        enabledVaults,
        chooseVaultFolder,
        removeVaultFolder,
        setVaultEnabled,
        setTheme,
        error,
        isChoosingFolder,
        isChoosingVaultFolder,
        isScanningVaults,
        route,
    } = useDesktopBridge();

    const savedThemeId =
        readStringProperty(preferences, "themeId") ??
        readStringProperty(preferences, "theme");
    const theme = getTheme(savedThemeId);
    const dataFolder = readStringProperty(preferences, "dataFolder");
    const [appearance, setAppearance] = useState<AppearancePreferences>(() =>
        loadAppearancePreferences()
    );
    // The calendar mounts hidden and reads its folder; revealing it only once
    // that read is done means landing on a filled grid instead of watching it
    // populate. It also makes the startup race impossible to trigger by hand:
    // nothing is clickable before the stored preferences are known.
    const [isCalendarReady, setIsCalendarReady] = useState(false);
    const handleCalendarReady = useCallback(() => setIsCalendarReady(true), []);

    const appearanceMode = useMemo(
        () => resolveAppearanceMode(appearance.mode),
        [appearance.mode]
    );
    const effectiveTheme = useMemo(
        () => getEffectiveThemeAppearance(theme, appearance),
        [appearance, theme]
    );

    // Sur Android la photo choisie vit dans le dossier de données : tant qu'elle
    // n'y est pas, les variables de fond restent celles du thème.
    const wallpaperReady = useWallpaperReady(
        getWallpaper(effectiveTheme.wallpaperId).imageUrl
    );

    /*
     * Ce que le natif rapporte de sa mise à jour, redit à la fenêtre.
     *
     * L'écoute vit ici et pas dans le contrôle : le contrôle apparaît et
     * disparaît avec ce qu'il a à dire, et une écoute qui se pose au moment où
     * il apparaît aurait manqué tout ce qui s'est passé avant — c'est-à-dire le
     * téléchargement, qui commence au lancement.
     */
    useEffect(() => {
        let stop: (() => void) | null = null;
        let dropped = false;
        void watchDesktopUpdates().then((release) => {
            if (dropped) release();
            else stop = release;
        });
        return () => {
            dropped = true;
            stop?.();
        };
    }, []);

    useEffect(() => {
        const onAppearanceChange = (event: Event) => {
            const detail = (event as CustomEvent<AppearancePreferences>).detail;
            if (detail) setAppearance(detail);
        };

        const media = window.matchMedia?.("(prefers-color-scheme: dark)");
        const onSystemModeChange = () => {
            if (appearance.mode === "system") {
                setAppearance((current) => ({ ...current }));
            }
        };

        window.addEventListener(APPEARANCE_CHANGE_EVENT, onAppearanceChange);
        media?.addEventListener?.("change", onSystemModeChange);
        return () => {
            window.removeEventListener(
                APPEARANCE_CHANGE_EVENT,
                onAppearanceChange
            );
            media?.removeEventListener?.("change", onSystemModeChange);
        };
    }, [appearance.mode]);

    useEffect(() => {
        const roots = [document.documentElement, document.body];
        const themeClasses = THEMES.map((item) => item.className);
        const {
            accent,
            surface,
            ink,
            uiFont,
            codeFont,
            contrast,
            translucentSidebar,
            wallpaperId,
        } = effectiveTheme;
        const wallpaper = getWallpaper(wallpaperId);

        const properties: Record<string, string> = {
            "--nc-user-contrast": String(contrast),
            "--nc-ui-font": uiFont,
            "--nc-code-font": codeFont,
            "--interactive-accent": accent,
            "--nc-accent": accent,
            "--nc-theme-accent": accent,
            "--background-primary": surface,
            "--nc-bg-primary": surface,
            "--nc-theme-surface": surface,
            "--background-secondary": `color-mix(in srgb, ${surface} 88%, ${ink} 12%)`,
            "--nc-bg-secondary": `color-mix(in srgb, ${surface} 88%, ${ink} 12%)`,
            "--background-modifier-form-field": `color-mix(in srgb, ${surface} 84%, ${ink} 16%)`,
            "--background-modifier-hover": `color-mix(in srgb, ${surface} 78%, ${ink} 22%)`,
            "--background-modifier-border": `color-mix(in srgb, ${ink} 22%, transparent)`,
            "--background-modifier-border-hover": `color-mix(in srgb, ${accent} 70%, ${ink} 30%)`,
            "--text-normal": ink,
            "--nc-text-primary": ink,
            "--nc-theme-ink": ink,
            "--text-muted": `color-mix(in srgb, ${ink} 72%, ${surface})`,
            "--nc-text-secondary": `color-mix(in srgb, ${ink} 72%, ${surface})`,
            "--text-faint": `color-mix(in srgb, ${ink} 52%, ${surface})`,
            "--nc-text-faint": `color-mix(in srgb, ${ink} 52%, ${surface})`,
        };

        if (
            wallpaper.previewStyle === "image" &&
            wallpaper.imageUrl &&
            wallpaperReady
        ) {
            properties[
                "--nc-selected-wallpaper"
            ] = `url("${wallpaper.imageUrl}")`;
            properties["--nc-selected-wallpaper-overlay"] =
                appearanceMode === "light"
                    ? "linear-gradient(rgba(255,255,255,.18), rgba(255,255,255,.18))"
                    : `linear-gradient(color-mix(in srgb, ${surface} 38%, transparent), color-mix(in srgb, ${surface} 38%, transparent))`;
        } else if (wallpaper.previewStyle === "solid") {
            properties["--nc-selected-wallpaper"] = "none";
            properties["--nc-selected-wallpaper-overlay"] = "none";
        }

        for (const root of roots) {
            root.classList.remove(...themeClasses);
            root.classList.remove(
                "nc-appearance-light",
                "nc-appearance-dark",
                "nc-sidebar-opaque"
            );
            root.classList.add(theme.className);
            root.classList.add(`nc-appearance-${appearanceMode}`);
            root.classList.toggle("nc-sidebar-opaque", !translucentSidebar);
            root.style.removeProperty("--nc-selected-wallpaper");
            root.style.removeProperty("--nc-selected-wallpaper-overlay");
            for (const [name, value] of Object.entries(properties)) {
                root.style.setProperty(name, value);
            }
        }

        document.documentElement.style.colorScheme = appearanceMode;

        return () => {
            for (const root of roots) {
                root.classList.remove(theme.className);
                root.classList.remove(
                    "nc-appearance-light",
                    "nc-appearance-dark",
                    "nc-sidebar-opaque"
                );
                for (const property of CUSTOM_THEME_PROPERTIES) {
                    root.style.removeProperty(property);
                }
            }
        };
    }, [appearanceMode, effectiveTheme, theme, wallpaperReady]);

    // `preferences` stays null until the stored settings have been read. Falling
    // through to the welcome screen would flash t("Choose the folder") on every
    // launch, even though a folder is already configured.
    if (!preferences) {
        return (
            <main
                className={`nc-desktop nc-desktop--loading ${theme.className}`}
                aria-busy="true"
            >
                <WallpaperRenderLayer
                    wallpaperId={effectiveTheme.wallpaperId}
                    appearanceMode={appearanceMode}
                    surface={effectiveTheme.surface}
                />
            </main>
        );
    }

    if (dataFolder) {
        const preferenceRecord =
            preferences && typeof preferences === "object"
                ? (preferences as unknown as Record<string, unknown>)
                : {};
        const vaultFolders = Array.isArray(preferenceRecord.vaultFolders)
            ? preferenceRecord.vaultFolders.filter(
                  (value): value is string => typeof value === "string"
              )
            : [];
        const disabledVaults = Array.isArray(preferenceRecord.disabledVaults)
            ? preferenceRecord.disabledVaults.filter(
                  (value): value is string => typeof value === "string"
              )
            : [];

        return (
            <main
                className={`nc-desktop nc-desktop--calendar ${theme.className}${
                    isCalendarReady ? "" : " nc-desktop--booting"
                }`}
                aria-busy={isCalendarReady ? undefined : "true"}
            >
                <WallpaperRenderLayer
                    wallpaperId={effectiveTheme.wallpaperId}
                    appearanceMode={appearanceMode}
                    surface={effectiveTheme.surface}
                />
                <DesktopErrorBoundary>
                    <DesktopCalendar
                        onReady={handleCalendarReady}
                        dataFolder={dataFolder}
                        onChangeDataFolder={chooseDataFolder}
                        linkedVaults={enabledVaults.map((vault) => vault.path)}
                        vaultFolders={vaultFolders}
                        detectedVaults={detectedVaults}
                        disabledVaults={disabledVaults}
                        onAddVaultFolder={chooseVaultFolder}
                        onRemoveVaultFolder={removeVaultFolder}
                        onSetVaultEnabled={setVaultEnabled}
                        isChoosingVaultFolder={isChoosingVaultFolder}
                        isScanningVaults={isScanningVaults}
                        themeId={theme.id}
                        onThemeChange={setTheme}
                    />
                </DesktopErrorBoundary>
            </main>
        );
    }

    return (
        <main className={`nc-desktop ${theme.className}`}>
            <section className="nc-welcome" aria-labelledby="welcome-title">
                <div className="nc-welcome__mark" aria-hidden="true">
                    <CalendarDays size={28} strokeWidth={1.8} />
                </div>
                <p className="nc-welcome__eyebrow">
                    Application {isAndroidRuntime() ? "Android" : "Windows"}
                </p>
                <h1 id="welcome-title">Neo Calendar</h1>
                <p className="nc-welcome__description">
                    Choisissez le dossier de données de Neo Calendar.
                </p>
                <button
                    className="nc-folder-button"
                    type="button"
                    onClick={() => void chooseDataFolder()}
                    disabled={!preferences || isChoosingFolder}
                    aria-busy={isChoosingFolder}
                >
                    <FolderOpen aria-hidden="true" size={18} />
                    Choisir le dossier
                </button>
                <p className="nc-welcome__hint">
                    Les fichiers de calendrier restent hors de tout coffre
                    Obsidian.
                </p>
                {error && (
                    <p className="nc-welcome__error" role="alert">
                        {error}
                    </p>
                )}
                {route?.type === "task" && (
                    <p className="nc-route-probe">
                        Ouverture de la tâche : {route.taskId}
                    </p>
                )}
            </section>
        </main>
    );
}
