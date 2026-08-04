import { LazyStore } from "@tauri-apps/plugin-store";
import { DesktopPreferences, normalizeDesktopPreferences } from "./preferences";

const store = new LazyStore("desktop-settings.json", { autoSave: false });
const PREFERENCES_KEY = "preferences";

export async function loadDesktopPreferences(): Promise<DesktopPreferences> {
    return normalizeDesktopPreferences(await store.get(PREFERENCES_KEY));
}

export async function saveDesktopPreferences(
    preferences: DesktopPreferences
): Promise<void> {
    await store.set(PREFERENCES_KEY, preferences);
    await store.save();
}
