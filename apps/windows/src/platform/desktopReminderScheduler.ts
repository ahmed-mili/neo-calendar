import type { Reminder } from "./androidReminders";

/**
 * Reminders on a desktop, where nothing waits for us.
 *
 * The phone hands its list to the system and forgets about it: an alarm fires
 * whether the app is running or not. Windows has no such thing here, so the app
 * keeps the list itself and watches the clock while it is open — which is also
 * why a reminder is posted as soon as the app finds it already due, rather than
 * being skipped for having happened while nobody was looking.
 *
 * The wait is taken in short steps instead of one long timeout: a month out is
 * further than a browser timer can be trusted to hold (and further than it can
 * count at all), and a machine coming back from sleep has a stale timeout.
 */

/** A reminder later than this has missed its point, and is dropped. */
const STALE_AFTER_MS = 5 * 60_000;

/** The longest a single wait ever lasts before the clock is read again. */
const STEP_MS = 30_000;

export interface ReminderScheduler {
    /** Hands over the whole list, as often as it changes. */
    set(reminders: readonly Reminder[]): void;
    stop(): void;
}

export function createReminderScheduler(
    post: (reminder: Reminder) => void
): ReminderScheduler {
    let pending: Reminder[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    // What has already been said, so a list rewritten on every edit does not
    // say it again. Pruned to the list itself, so it cannot grow forever.
    const posted = new Set<string>();

    const disarm = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const tick = () => {
        timer = null;
        if (stopped) return;

        const now = Date.now();
        const waiting: Reminder[] = [];

        for (const reminder of pending) {
            if (reminder.atMs > now) {
                waiting.push(reminder);
                continue;
            }
            if (now - reminder.atMs <= STALE_AFTER_MS) {
                posted.add(reminder.key);
                post(reminder);
            }
        }

        pending = waiting;
        arm();
    };

    const arm = () => {
        disarm();
        if (stopped || pending.length === 0) return;
        const soonest = Math.min(...pending.map((item) => item.atMs));
        const wait = Math.max(0, Math.min(STEP_MS, soonest - Date.now()));
        timer = setTimeout(tick, wait);
    };

    return {
        set(reminders) {
            if (stopped) return;
            pending = reminders.filter((item) => !posted.has(item.key));
            const keys = new Set(reminders.map((item) => item.key));
            for (const key of [...posted]) {
                if (!keys.has(key)) posted.delete(key);
            }
            tick();
        },
        stop() {
            stopped = true;
            disarm();
            pending = [];
        },
    };
}
