import { DateTime } from "luxon";
import { parseIcsSnapshot } from "../../../../src/calendars/parsing/ics";
import type { DesktopStoredEvent } from "./desktopEventFormat";
import {
    planIcsNoteSync,
    type IcalNoteWrite,
    type IcsSyncState,
} from "./icalNoteSync";
import {
    dueIcsFeeds,
    runIcsQueue,
    type IcsRuntimeStateByFeed,
} from "./icsSyncScheduler";
import type {
    IcsFeedSubscription,
    IcsRefreshMinutes,
} from "./icsFeedPreferences";

/**
 * The side effects one feed's sync cycle needs, injected so the orchestration
 * below stays free of Tauri and React — every lifecycle path (startup, focus,
 * the wake timer, manual refresh) is therefore testable as plain data in/data
 * out, without mounting the desktop shell.
 */
export interface IcsSyncIo {
    fetchIcs: (url: string) => Promise<string>;
    /** Returns the relative path the note was written at. */
    writeEventFile: (write: IcalNoteWrite) => Promise<string>;
    deleteEventFile: (relativePath: string) => Promise<void>;
}

export interface IcsCalendarSyncArgs {
    feeds: readonly IcsFeedSubscription[];
    states: IcsRuntimeStateByFeed;
    records: readonly DesktopStoredEvent[];
    now: Date;
    defaultMinutes: IcsRefreshMinutes;
    /** Bypasses the due check for these feed ids only — an inactive feed still
        never runs, and dedup/concurrency still apply. */
    forcedIds?: ReadonlySet<string>;
    io: IcsSyncIo;
}

export interface IcsCalendarSyncResult {
    records: DesktopStoredEvent[];
    states: IcsRuntimeStateByFeed;
    /** The feed ids this cycle actually attempted, in no particular order. */
    syncedFeedIds: string[];
}

function fileNameFromRelativePath(path: string): string {
    const segments = path.split(/[\\/]/);
    return segments[segments.length - 1] ?? path;
}

/** Runs `worker` over `items` with at most 6 in flight — each targets its own
    file, so nothing about correctness depends on running them one at a time;
    only wall-clock time did. */
async function runWriteQueue<T>(
    items: readonly T[],
    worker: (item: T) => Promise<void>
): Promise<void> {
    let nextIndex = 0;
    async function runNext(): Promise<void> {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        await worker(items[index]);
        await runNext();
    }
    const workerCount = Math.min(6, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runNext()));
}

/** Monday one year before `now` through two years after — generous enough to
    cover a feed's whole useful history and horizon without unbounded growth. */
export function icsSyncWindow(now: Date): { from: string; to: string } {
    const from = DateTime.fromJSDate(now).minus({ years: 1 }).toISODate();
    const to = DateTime.fromJSDate(now).plus({ years: 2 }).toISODate();
    if (!from || !to) {
        throw new Error(
            "Cannot compute the ICS sync window from an invalid Date."
        );
    }
    return { from, to };
}

/**
 * Runs one ICS sync cycle over whichever feeds `dueIcsFeeds` selects (or
 * exactly the forced ones), reconciling each through `planIcsNoteSync` and
 * folding the results back into the caller's records and per-feed runtime
 * state.
 *
 * A feed's cycle is atomic from the caller's point of view: on any failure —
 * a fetch error, an invalid document, or the planner's guard against an
 * unexpectedly empty snapshot — neither its writes nor its deletes are
 * applied, and its state keeps the previous `lastSuccessAt` while recording
 * the new `lastAttemptAt`/`lastError`. A failing feed never stops the others.
 */
export async function syncIcsFeeds(
    args: IcsCalendarSyncArgs
): Promise<IcsCalendarSyncResult> {
    const { feeds, states, records, now, defaultMinutes, forcedIds, io } =
        args;

    const due = dueIcsFeeds(feeds, states, now, defaultMinutes, forcedIds);

    const recordsById = new Map(records.map((record) => [record.id, record]));
    const nextStates: IcsRuntimeStateByFeed = { ...states };
    const syncedFeedIds: string[] = [];

    await runIcsQueue(
        due,
        async (feed) => {
            syncedFeedIds.push(feed.id);
            const attemptTime = now;
            const previousState: IcsSyncState = states[feed.id] ?? {
                knownEventCount: 0,
                missingCounts: {},
            };
            try {
                const text = await io.fetchIcs(feed.url);
                const snapshot = parseIcsSnapshot(
                    text,
                    icsSyncWindow(attemptTime)
                );
                const plan = planIcsNoteSync({
                    feed,
                    snapshot,
                    existingRecords: [...recordsById.values()],
                    previousState,
                    now: attemptTime,
                });

                // Each write targets its own occurrence's file, so nothing
                // here depends on write order — a first sync's whole
                // semester of notes going through one at a time was exactly
                // the wall-clock cost users felt as the app hanging.
                await runWriteQueue(plan.writes, async (write) => {
                    const relativePath = await io.writeEventFile(write);
                    const id = write.event.id as string;
                    recordsById.set(id, {
                        id,
                        calendarId: write.calendarId,
                        calendarPath: write.calendarPath,
                        relativePath,
                        fileName: fileNameFromRelativePath(relativePath),
                        contents: write.contents,
                        event: write.event,
                        readOnly: true,
                    });
                });
                for (const deleted of plan.deletes) {
                    await io.deleteEventFile(deleted.relativePath);
                    recordsById.delete(deleted.id);
                }

                nextStates[feed.id] = plan.nextState;
            } catch (reason) {
                nextStates[feed.id] = {
                    ...previousState,
                    lastAttemptAt: attemptTime.toISOString(),
                    lastError:
                        reason instanceof Error
                            ? reason.message
                            : String(reason),
                };
            }
        },
        2
    );

    return {
        records: [...recordsById.values()],
        states: nextStates,
        syncedFeedIds,
    };
}
