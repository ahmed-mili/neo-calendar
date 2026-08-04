import { request } from "obsidian";
import { CalendarInfo } from "src/types";
import { EventResponse } from "./Calendar";
import { getEventsFromICS } from "./parsing/ics";
import RemoteCalendar from "./RemoteCalendar";

const WEBCAL_SCHEME = "webcal";

/**
 * A read-only calendar subscribed to a public `.ics` URL. The feed is fetched
 * whole on each revalidation and kept in memory; `getEvents` only ever reads
 * that cached copy, so the view never blocks on the network.
 */
export default class ICSCalendar extends RemoteCalendar {
    private url: string;
    private displayName?: string;
    private response: string | null = null;

    constructor(color: string, url: string, displayName?: string) {
        super(color);
        // `webcal://` is the same feed over https — browsers and Obsidian's
        // request API only speak the latter.
        this.url = url.startsWith(WEBCAL_SCHEME)
            ? "https" + url.slice(WEBCAL_SCHEME.length)
            : url;
        this.displayName = displayName?.trim() || undefined;
    }

    get type(): CalendarInfo["type"] {
        return "ical";
    }

    get identifier(): string {
        return this.url;
    }

    get name(): string {
        // A user-set label wins; otherwise fall back to the feed URL.
        return this.displayName ?? this.url;
    }

    async revalidate(): Promise<void> {
        console.debug("revalidating ICS calendar " + this.name);
        this.response = await request({ url: this.url, method: "GET" });
    }

    async getEvents(): Promise<EventResponse[]> {
        if (!this.response) {
            return [];
        }
        // Remote events live nowhere in the vault, hence the null location.
        return getEventsFromICS(this.response).map((event) => [event, null]);
    }
}
