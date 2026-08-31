import { dueIcsFeeds, runIcsQueue } from "./icsSyncScheduler";
import type { IcsFeedSubscription } from "./icsFeedPreferences";
import type { IcsSyncState } from "./icalNoteSync";

const feed = (overrides: Partial<IcsFeedSubscription>): IcsFeedSubscription => ({
    id: "feed",
    calendarPath: "Calendrier",
    name: "Feed",
    url: "https://example.com/feed.ics",
    active: true,
    ...overrides,
});

const state = (overrides: Partial<IcsSyncState>): IcsSyncState => ({
    knownEventCount: 0,
    missingCounts: {},
    ...overrides,
});

describe("dueIcsFeeds", () => {
    it("computes due feeds from last attempt against the global default", () => {
        const feeds = [
            feed({ id: "never" }),
            feed({ id: "overdue" }),
            feed({ id: "fresh" }),
        ];
        const states = {
            overdue: state({ lastAttemptAt: "2026-08-30T16:00:00Z", lastSuccessAt: "2026-08-30T16:00:00Z" }),
            fresh: state({ lastAttemptAt: "2026-08-30T18:00:00Z", lastSuccessAt: "2026-08-30T18:00:00Z" }),
        };

        expect(
            dueIcsFeeds(feeds, states, new Date("2026-08-30T18:05:00Z"), 60).map((f) => f.id)
        ).toEqual(["never", "overdue"]);
    });

    it("lets a per-feed refresh interval override the global default", () => {
        const feeds = [feed({ id: "quick", refreshMinutes: 15 })];
        const states = {
            quick: state({ lastAttemptAt: "2026-08-30T17:50:00Z", lastSuccessAt: "2026-08-30T17:50:00Z" }),
        };

        // Global default of 60 would not be due yet, but the 15-minute
        // per-feed override has already elapsed.
        expect(
            dueIcsFeeds(feeds, states, new Date("2026-08-30T18:06:00Z"), 60).map((f) => f.id)
        ).toEqual(["quick"]);
    });

    it("never runs an inactive feed, forced or not", () => {
        const feeds = [feed({ id: "off", active: false })];
        const states = {};

        expect(
            dueIcsFeeds(feeds, states, new Date("2026-08-30T18:05:00Z"), 60).map((f) => f.id)
        ).toEqual([]);
        expect(
            dueIcsFeeds(
                feeds,
                states,
                new Date("2026-08-30T18:05:00Z"),
                60,
                new Set(["off"])
            ).map((f) => f.id)
        ).toEqual([]);
    });

    it("includes a non-due feed when forced by manual refresh", () => {
        const feeds = [feed({ id: "fresh" })];
        const states = {
            fresh: state({ lastAttemptAt: "2026-08-30T18:00:00Z", lastSuccessAt: "2026-08-30T18:00:00Z" }),
        };

        expect(
            dueIcsFeeds(
                feeds,
                states,
                new Date("2026-08-30T18:05:00Z"),
                60,
                new Set(["fresh"])
            ).map((f) => f.id)
        ).toEqual(["fresh"]);
    });
});

describe("runIcsQueue", () => {
    it("never runs more than the concurrency limit at once", async () => {
        const feeds = [
            feed({ id: "a" }),
            feed({ id: "b" }),
            feed({ id: "c" }),
            feed({ id: "d" }),
        ];
        let inFlight = 0;
        let maxObservedConcurrency = 0;

        const worker = async (f: IcsFeedSubscription) => {
            inFlight += 1;
            maxObservedConcurrency = Math.max(maxObservedConcurrency, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 10));
            inFlight -= 1;
            return f.id;
        };

        await runIcsQueue(feeds, worker, 2);

        expect(maxObservedConcurrency).toBe(2);
    });

    it("resolves settled results in input order, not completion order", async () => {
        const feeds = [feed({ id: "slow" }), feed({ id: "fast" })];
        const worker = async (f: IcsFeedSubscription) => {
            await new Promise((resolve) =>
                setTimeout(resolve, f.id === "slow" ? 20 : 5)
            );
            return f.id;
        };

        const results = await runIcsQueue(feeds, worker, 2);

        expect(results).toEqual([
            { status: "fulfilled", value: "slow" },
            { status: "fulfilled", value: "fast" },
        ]);
    });

    it("runs a duplicated feed id only once per call", async () => {
        const feeds = [feed({ id: "same-feed" }), feed({ id: "same-feed" })];
        const invocationsById = new Map<string, number>();
        const worker = async (f: IcsFeedSubscription) => {
            invocationsById.set(f.id, (invocationsById.get(f.id) ?? 0) + 1);
            return f.id;
        };

        await runIcsQueue(feeds, worker, 2);

        expect(invocationsById.get("same-feed")).toBe(1);
    });

    it("does not abort other workers when one fails", async () => {
        const feeds = [feed({ id: "fails" }), feed({ id: "ok" })];
        const worker = async (f: IcsFeedSubscription) => {
            if (f.id === "fails") throw new Error("boom");
            return f.id;
        };

        const results = await runIcsQueue(feeds, worker, 2);

        expect(results[0].status).toBe("rejected");
        expect(results[1]).toEqual({ status: "fulfilled", value: "ok" });
    });
});

describe("recording scheduler state after a run (caller bookkeeping)", () => {
    it("retains lastSuccessAt on failure while recording lastAttemptAt and lastError", async () => {
        const previousState = state({
            lastSuccessAt: "2026-08-30T10:00:00Z",
            lastAttemptAt: "2026-08-30T10:00:00Z",
        });
        const feeds = [feed({ id: "flaky" })];
        const worker = async () => {
            throw new Error("network down");
        };

        const results = await runIcsQueue(feeds, worker, 2);
        const result = results[0];
        expect(result.status).toBe("rejected");

        const now = new Date("2026-08-30T18:05:00Z");
        const nextState: IcsSyncState =
            result.status === "rejected"
                ? {
                      ...previousState,
                      lastAttemptAt: now.toISOString(),
                      lastError: (result.reason as Error).message,
                  }
                : previousState;

        expect(nextState.lastSuccessAt).toBe("2026-08-30T10:00:00Z");
        expect(nextState.lastAttemptAt).toBe(now.toISOString());
        expect(nextState.lastError).toBe("network down");
    });
});
