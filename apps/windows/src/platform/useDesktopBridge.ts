import { invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { DesktopRoute } from "./deepLink";
import {
    DesktopPreferences,
    normalizeDesktopPreferences,
    withChosenTheme,
} from "./preferences";
import { ThemeId } from "../themes/types";
import { selectLastDesktopRoute } from "./routeDelivery";
import {
    loadDesktopPreferences,
    saveDesktopPreferences,
} from "./tauriSettingsStore";
import { findObsidianVaultAncestor, PathAccess } from "./vaultGuard";

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
    const [error, setError] = useState<string | null>(null);
    const [isChoosingFolder, setIsChoosingFolder] = useState(false);
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

    const setTheme = useCallback(
        async (themeId: ThemeId) => {
            setError(null);
            try {
                const current = preferences ?? (await loadDesktopPreferences());
                await savePreferences(withChosenTheme(current, themeId));
            } catch (reason) {
                setError(getErrorMessage(reason));
            }
        },
        [preferences, savePreferences]
    );

    return {
        preferences,
        chooseDataFolder,
        setTheme,
        error,
        isChoosingFolder,
        route,
    };
}
