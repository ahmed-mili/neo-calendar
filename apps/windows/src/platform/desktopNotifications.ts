import {
    isPermissionGranted,
    requestPermission,
    sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Reminder } from "./androidReminders";

/**
 * Notifications on Windows.
 *
 * The phone hands its reminders to the system; here the app posts them itself,
 * through the OS notification centre. Permission is asked for once — Windows
 * grants it by default and refuses it silently when the user has turned
 * notifications off for the app, which is a state to accept rather than nag
 * about.
 */

let granted: boolean | null = null;

/** Asks once, then remembers the answer for the rest of the session. */
export async function ensureNotificationPermission(): Promise<boolean> {
    if (granted !== null) return granted;
    try {
        granted =
            (await isPermissionGranted()) ||
            (await requestPermission()) === "granted";
    } catch {
        granted = false;
    }
    return granted;
}

export async function postReminder(reminder: Reminder): Promise<void> {
    if (!(await ensureNotificationPermission())) return;
    try {
        sendNotification({ title: reminder.title, body: reminder.body });
    } catch {
        // A notification that could not be posted is not worth interrupting
        // the calendar for.
    }
}
