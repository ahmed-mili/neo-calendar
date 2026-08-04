import * as dav from "dav";
import { Authentication, CalendarInfo } from "../../../types";
import { Basic } from "./transport";

/**
 * Discovering the calendars a CalDAV account exposes.
 *
 * A user points the plugin at a server, not at a single calendar, so on import
 * the account is walked and every calendar that can hold events is turned into a
 * source they can then enable individually.
 */

/** Calendars that can't hold events (contact or task collections) are of no use here. */
const HOLDS_EVENTS = "VEVENT";

/** New sources start on the theme's accent colour, like every other source does. */
const defaultColor = (): string =>
    getComputedStyle(document.body)
        .getPropertyValue("--interactive-accent")
        .trim();

export async function importCalendars(
    auth: Authentication,
    serverUrl: string
): Promise<CalendarInfo[]> {
    const xhr = new Basic(
        new dav.Credentials({
            username: auth.username,
            password: auth.password,
        })
    );

    const account = await dav.createAccount({
        server: serverUrl,
        xhr,
        // We only want the list of calendars here — pulling every event of every
        // calendar at import time would be slow and is done lazily anyway.
        loadCollections: true,
        loadObjects: false,
    });

    const color = defaultColor();

    return account.calendars
        .filter((calendar) => calendar.components?.includes(HOLDS_EVENTS))
        .map((calendar) => ({
            type: "caldav",
            name: calendar.displayName,
            url: calendar.url,
            homeUrl: account.homeUrl,
            username: auth.username,
            password: auth.password,
            color,
        }));
}
