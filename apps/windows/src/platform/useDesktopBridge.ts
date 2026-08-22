import { invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DesktopRoute } from "./deepLink";
import {
    DesktopPreferences,
    isSameDesktopPath,
    normalizeDesktopPreferences,
} from "./preferences";
import { ThemeId } from "../themes/types";
import { selectLastDesktopRoute } from "./routeDelivery";
import {
    loadDesktopPreferences,
    saveDesktopPreferences,
} from "./tauriSettingsStore";
import { findObsidianVaultAncestor, PathAccess } from "./vaultGuard";
import {
    DesktopDetectedVaultDto,
    discoverDesktopObsidianVaults,
} from "./desktopCalendarStore";

const desktopPathAccess: PathAccess = {
    dirname,
    hasObsidianConfig: (path) =>
        invoke<boolean>("has_obsidian_config", { path }),
};

function getErrorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

export function useDesktopBridge() {
    const [preferences, setPreferences] = useState<DesktopPreferences | null>(
        null
    );
    const [detectedVaults, setDetectedVaults] = useState<
        DesktopDetectedVaultDto[]
    >([]);
    const [error, setError] = useState<string | null>(null);
    const [isChoosingFolder, setIsChoosingFolder] = useState(false);
    const [isChoosingVaultFolder, setIsChoosingVaultFolder] = useState(false);
    const [isScanningVaults, setIsScanningVaults] = useState(false);
    const [route, setRoute] = useState<DesktopRoute | null>(null);

    useEffect(() => {
        let active = true;

        loadDesktopPreferences()
            .then((value) => {
                if (active) setPreferences(value);
            })
            .catch((reason) => {
                if (!active) return;
                setPreferences(normalizeDesktopPreferences(null));
                setError(getErrorMessage(reason));
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        let dispose: (() => void) | undefined;
        const accept = (urls: string[]) => {
            if (!active) return;
            setRoute((current) => selectLastDesktopRoute(urls, current));
        };

        void getCurrent()
            .then((urls) => accept(urls ?? []))
            .catch((reason) => {
                if (active) setError(getErrorMessage(reason));
            });
        void onOpenUrl(accept)
            .then((unlisten) => {
                if (active) dispose = unlisten;
                else unlisten();
            })
            .catch((reason) => {
                if (active) setError(getErrorMessage(reason));
            });

        return () => {
            active = false;
            dispose?.();
        };
    }, []);

    useEffect(() => {
        if (!preferences) return;
        let active = true;
        setIsScanningVaults(true);

        void discoverDesktopObsidianVaults(preferences.vaultFolders)
            .then((vaults) => {
                if (active) setDetectedVaults(vaults);
            })
            .catch((reason) => {
                if (!active) return;
                setDetectedVaults([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => {
                if (active) setIsScanningVaults(false);
            });

        return () => {
            active = false;
        };
    }, [preferences?.vaultFolders]);

    const savePreferences = useCallback(async (next: DesktopPreferences) => {
        await saveDesktopPreferences(next);
        setPreferences(next);
    }, []);

    const chooseDataFolder = useCallback(async () => {
        setIsChoosingFolder(true);
        setError(null);

        try {
            const path = await open({
                directory: true,
                multiple: false,
                title: "Choose Neo Calendar data folder",
            });
            if (typeof path !== "string") return;

            const vault = await findObsidianVaultAncestor(
                path,
                desktopPathAccess
            );
            if (vault) {
                throw new Error(
                    `Choose a folder outside the Obsidian vault: ${vault}`
                );
            }

            const current = preferences ?? (await loadDesktopPreferences());
            await savePreferences({ ...current, dataFolder: path });
        } catch (reason) {
            setError(getErrorMessage(reason));
        } finally {
            setIsChoosingFolder(false);
        }
    }, [preferences, savePreferences]);

    const chooseVaultFolder = useCallback(async () => {
        setIsChoosingVaultFolder(true);
        setError(null);

        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Choose the folder containing your Obsidian vaults",
            });
            if (typeof selected !== "string") return;

            const found = await discoverDesktopObsidianVaults([selected]);
            if (found.length === 0) {
                throw new Error(
                    "No Obsidian vault was found. Each vault must contain a .obsidian folder."
                );
            }

            const current = preferences ?? (await loadDesktopPreferences());
            if (
                current.vaultFolders.some((path) =>
                    isSameDesktopPath(path, selected)
                )
            ) {
                return;
            }

            await savePreferences({
                ...current,
                vaultFolders: [...current.vaultFolders, selected],
            });
        } catch (reason) {
            setError(getErrorMessage(reason));
        } finally {
            setIsChoosingVaultFolder(false);
        }
    }, [preferences, savePreferences]);

    const removeVaultFolder = useCallback(
        async (folderPath: string) => {
            setError(null);
            try {
                const current = preferences ?? (await loadDesktopPreferences());
                await savePreferences({
                    ...current,
                    vaultFolders: current.vaultFolders.filter(
                        (path) => !isSameDesktopPath(path, folderPath)
                    ),
                });
            } catch (reason) {
                setError(getErrorMessage(reason));
            }
        },
        [preferences, savePreferences]
    );

    const setVaultEnabled = useCallback(
        async (vaultPath: string, enabled: boolean) => {
            setError(null);
            try {
                const current = preferences ?? (await loadDesktopPreferences());
                const disabledVaults = enabled
                    ? current.disabledVaults.filter(
                          (path) => !isSameDesktopPath(path, vaultPath)
                      )
                    : current.disabledVaults.some((path) =>
                          isSameDesktopPath(path, vaultPath)
                      )
                    ? current.disabledVaults
                    : [...current.disabledVaults, vaultPath];

                await savePreferences({ ...current, disabledVaults });
            } catch (reason) {
                setError(getErrorMessage(reason));
            }
        },
        [preferences, savePreferences]
    );

    const setTheme = useCallback(
        async (themeId: ThemeId) => {
            setError(null);
            try {
                const current = preferences ?? (await loadDesktopPreferences());
                await savePreferences({ ...current, themeId });
            } catch (reason) {
                setError(getErrorMessage(reason));
            }
        },
        [preferences, savePreferences]
    );

    const enabledVaults = useMemo(() => {
        const disabled = preferences?.disabledVaults ?? [];
        return detectedVaults.filter(
            (vault) =>
                !disabled.some((path) => isSameDesktopPath(path, vault.path))
        );
    }, [detectedVaults, preferences?.disabledVaults]);

    return {
        preferences,
        detectedVaults,
        enabledVaults,
        chooseDataFolder,
        chooseVaultFolder,
        removeVaultFolder,
        setVaultEnabled,
        setTheme,
        error,
        isChoosingFolder,
        isChoosingVaultFolder,
        isScanningVaults,
        route,
    };
}
