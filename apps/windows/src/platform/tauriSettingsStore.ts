import { LazyStore } from "@tauri-apps/plugin-store";
import { DesktopPreferences, normalizeDesktopPreferences } from "./preferences";
import {
    parseDeviceWorkspacePreferences,
    type DeviceWorkspacePreferences,
} from "./desktopWorkspacePreferences";

const store = new LazyStore("desktop-settings.json", { autoSave: false });
const PREFERENCES_KEY = "preferences";

/** This machine's view of the calendar, kept out of the synced preference file
    so switching view here cannot conflict with the phone. */
const WORKSPACE_DEVICE_KEY = "workspaceDevice";

export async function loadDesktopPreferences(): Promise<DesktopPreferences> {
    return normalizeDesktopPreferences(await store.get(PREFERENCES_KEY));
}

export async function saveDesktopPreferences(
    preferences: DesktopPreferences
): Promise<void> {
    await store.set(PREFERENCES_KEY, preferences);
    await store.save();
}

export async function loadDeviceWorkspacePreferences(): Promise<DeviceWorkspacePreferences> {
    return parseDeviceWorkspacePreferences(
        await store.get(WORKSPACE_DEVICE_KEY)
    );
}

export async function saveDeviceWorkspacePreferences(
    preferences: DeviceWorkspacePreferences
): Promise<void> {
    await store.set(WORKSPACE_DEVICE_KEY, preferences);
    await store.save();
}
