import { createReminderScheduler } from "./desktopReminderScheduler";
import type { Reminder } from "./androidReminders";

const START = new Date("2026-08-19T12:00:00");

const reminder = (key: string, at: string): Reminder => ({
    id: key.split("#")[0],
    key,
    atMs: +new Date(at),
    title: key,
    body: "body",
});

describe("the desktop reminder scheduler", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(START);
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it("stays quiet until the moment arrives", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );

        scheduler.set([reminder("a#10", "2026-08-19T12:10:00")]);
        jest.advanceTimersByTime(9 * 60_000);

        expect(posted).toEqual([]);

        jest.advanceTimersByTime(60_000);
        expect(posted).toEqual(["a#10"]);

        scheduler.stop();
    });

    // Every edit rewrites the list whole, so the same reminder comes back over
    // and over. It has already been posted; posting it again would be noise.
    it("posts a reminder once, however often the list is rewritten", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );
        const list = [reminder("a#10", "2026-08-19T12:05:00")];

        scheduler.set(list);
        jest.advanceTimersByTime(5 * 60_000);
        scheduler.set(list);
        jest.advanceTimersByTime(60_000);

        expect(posted).toEqual(["a#10"]);

        scheduler.stop();
    });

    // The app was closed when it was due; opening it a minute later should
    // still say so, since the event has not started yet.
    it("catches up on one that came due while the app was away", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );

        scheduler.set([reminder("a#10", "2026-08-19T11:59:00")]);

        expect(posted).toEqual(["a#10"]);

        scheduler.stop();
    });

    /*
     * Being told at 13:00 about something that started at 12:00 is worse than
     * not being told: a notification you cannot act on, arriving as if you
     * could.
     */
    it("stays quiet about one whose moment is long gone", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );

        scheduler.set([reminder("a#10", "2026-08-19T11:00:00")]);

        expect(posted).toEqual([]);

        scheduler.stop();
    });

    it("forgets a reminder taken off the list before it fired", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );

        scheduler.set([reminder("a#10", "2026-08-19T12:10:00")]);
        scheduler.set([]);
        jest.advanceTimersByTime(20 * 60_000);

        expect(posted).toEqual([]);

        scheduler.stop();
    });

    // A month out is further than a browser timer can be trusted to hold, so
    // the wait is taken in short steps rather than one long one.
    it("waits out a reminder weeks away without firing early", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );

        scheduler.set([reminder("far#10", "2026-09-15T12:00:00")]);
        jest.advanceTimersByTime(20 * 24 * 60 * 60_000);

        expect(posted).toEqual([]);

        jest.advanceTimersByTime(7 * 24 * 60 * 60_000);
        expect(posted).toEqual(["far#10"]);

        scheduler.stop();
    });

    it("stops posting once it is stopped", () => {
        const posted: string[] = [];
        const scheduler = createReminderScheduler((item) =>
            posted.push(item.key)
        );

        scheduler.set([reminder("a#10", "2026-08-19T12:10:00")]);
        scheduler.stop();
        jest.advanceTimersByTime(20 * 60_000);

        expect(posted).toEqual([]);
    });
});
