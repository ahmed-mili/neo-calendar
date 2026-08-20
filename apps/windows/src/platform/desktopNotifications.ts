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

/*
 * The asking itself, kept rather than its answer.
 *
 * Reminders come in bursts: the scheduler posts everything due in the same
 * turn, and each one asks whether it may. Holding only the answer means every
 * reminder in the burst finds nothing yet and asks Windows again — ten
 * reminders, ten permission requests for one decision. Holding the promise
 * makes them all wait on the first.
 */
let asking: Promise<boolean> | null = null;

/** Asks once, then remembers the answer for the rest of the session. */
export function ensureNotificationPermission(): Promise<boolean> {
    if (!asking) {
        asking = (async () => {
            try {
                return (
                    (await isPermissionGranted()) ||
                    (await requestPermission()) === "granted"
                );
            } catch {
                return false;
            }
        })();
    }
    return asking;
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
