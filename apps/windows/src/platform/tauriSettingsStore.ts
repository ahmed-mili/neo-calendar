import { LazyStore } from "@tauri-apps/plugin-store";
import { DesktopPreferences, normalizeDesktopPreferences } from "./preferences";
import {
    parseDeviceWorkspacePreferences,
    type DeviceWorkspacePreferences,
} from "./desktopWorkspacePreferences";
import type { IcsRuntimeStateByFeed } from "./icsSyncScheduler";

const store = new LazyStore("desktop-settings.json", { autoSave: false });
const PREFERENCES_KEY = "preferences";

/** This machine's view of the calendar, kept out of the synced preference file
    so switching view here cannot conflict with the phone. */
const WORKSPACE_DEVICE_KEY = "workspaceDevice";

/** Per-feed ICS sync bookkeeping (last attempt/success/error). Runtime state
    about this device's own sync activity, never written into the shared
    `.neo-calendar.json` and never synced to other devices. */
const ICS_RUNTIME_STATE_KEY = "icsRuntimeState";

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

export async function loadIcsRuntimeState(): Promise<IcsRuntimeStateByFeed> {
    const value = await store.get(ICS_RUNTIME_STATE_KEY);
    return value && typeof value === "object"
        ? (value as IcsRuntimeStateByFeed)
        : {};
}

export async function saveIcsRuntimeState(
    state: IcsRuntimeStateByFeed
): Promise<void> {
    await store.set(ICS_RUNTIME_STATE_KEY, state);
    await store.save();
}
