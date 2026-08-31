import { DateTime } from "luxon";
import type { IcsFeedSubscription, IcsRefreshMinutes } from "./icsFeedPreferences";
import type { IcsSyncState } from "./icalNoteSync";

export type IcsRuntimeStateByFeed = Record<string, IcsSyncState>;

/**
 * Which active feeds are due for a refresh right now. A feed with no runtime
 * state yet (never synced) is always due. A forced feed is always due
 * regardless of when it last ran, but an inactive feed never runs, forced or
 * not — manual refresh only ever bypasses the due check, never the toggle.
 */
export function dueIcsFeeds(
    feeds: readonly IcsFeedSubscription[],
    states: IcsRuntimeStateByFeed,
    now: Date,
    defaultMinutes: IcsRefreshMinutes,
    forcedIds?: ReadonlySet<string>
): IcsFeedSubscription[] {
    return feeds.filter((feed) => {
        if (!feed.active) return false;
        if (forcedIds?.has(feed.id)) return true;

        const state = states[feed.id];
        if (!state?.lastSuccessAt && !state?.lastAttemptAt) return true;
        if (!state.lastAttemptAt) return true;

        const minutes = feed.refreshMinutes ?? defaultMinutes;
        const elapsedMinutes = DateTime.fromJSDate(now).diff(
            DateTime.fromISO(state.lastAttemptAt),
            "minutes"
        ).minutes;
        return elapsedMinutes >= minutes;
    });
}

/**
 * Run `worker` for each feed with at most `concurrency` in flight at once. A
 * feed id repeated within one call runs only once. A failing worker never
 * aborts the others: settled results come back in input order, not
 * completion order.
 */
export async function runIcsQueue<T>(
    feeds: readonly IcsFeedSubscription[],
    worker: (feed: IcsFeedSubscription) => Promise<T>,
    concurrency = 2
): Promise<PromiseSettledResult<T>[]> {
    const uniqueFeeds: IcsFeedSubscription[] = [];
    const seenIds = new Set<string>();
    for (const feed of feeds) {
        if (seenIds.has(feed.id)) continue;
        seenIds.add(feed.id);
        uniqueFeeds.push(feed);
    }

    const results: PromiseSettledResult<T>[] = new Array(uniqueFeeds.length);
    let nextIndex = 0;

    async function runNext(): Promise<void> {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= uniqueFeeds.length) return;

        try {
            const value = await worker(uniqueFeeds[index]);
            results[index] = { status: "fulfilled", value };
        } catch (reason) {
            results[index] = { status: "rejected", reason };
        }
        await runNext();
    }

    const workerCount = Math.min(concurrency, uniqueFeeds.length);
    await Promise.all(
        Array.from({ length: workerCount }, () => runNext())
    );

    return results;
}
