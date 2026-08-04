import * as dav from "dav";
import { Authentication, CalendarInfo, NeoEvent } from "src/types";
import { EventResponse } from "./Calendar";
import { getEventsFromICS } from "./parsing/ics";
import { Basic } from "./parsing/caldav/transport";
import RemoteCalendar from "./RemoteCalendar";

/**
 * A read-only calendar backed by one collection on a CalDAV server, reached with
 * HTTP basic auth. Each revalidation pulls the collection's objects and reparses
 * them; the events are held in memory so the view never waits on the network.
 */
export default class CalDAVCalendar extends RemoteCalendar {
    private displayName: string;
    private credentials: Authentication;
    private serverUrl: string;
    private calendarUrl: string;

    private events: NeoEvent[] = [];

    constructor(
        color: string,
        name: string,
        credentials: Authentication,
        serverUrl: string,
        calendarUrl: string
    ) {
        super(color);
        this.displayName = name;
        this.credentials = credentials;
        this.serverUrl = serverUrl;
        this.calendarUrl = calendarUrl;
    }

    get type(): CalendarInfo["type"] {
        return "caldav";
    }

    get identifier(): string {
        return this.calendarUrl;
    }

    get name(): string {
        return this.displayName;
    }

    async revalidate(): Promise<void> {
        const xhr = new Basic(
            new dav.Credentials({
                username: this.credentials.username,
                password: this.credentials.password,
            })
        );

        const account = await dav.createAccount({
            server: this.serverUrl,
            xhr,
        });

        // The account exposes every collection on the server; we only follow the
        // one this calendar was configured with.
        const calendar = account.calendars.find(
            (candidate) => candidate.url === this.calendarUrl
        );
        if (!calendar) {
            return;
        }

        const objects = await dav.listCalendarObjects(calendar, { xhr });
        this.events = objects
            .filter((object) => object.calendarData)
            .flatMap((object) => getEventsFromICS(object.calendarData));
    }

    async getEvents(): Promise<EventResponse[]> {
        // Remote events live nowhere in the vault, hence the null location.
        return this.events.map((event) => [event, null]);
    }
}
