export type { NeoEvent } from "./schema";
export {
    validateEvent,
    TYPE_DISCRIMINANT_KEYS,
    KEYS_DROPPED_WHEN_ABSENT,
} from "./schema";

export type { CalendarInfo } from "./calendar_settings";
export { makeDefaultPartialCalendarSource } from "./calendar_settings";

/** Namespace the plugin registers hover-link previews under. */
export const PLUGIN_SLUG = "neo-calendar-plugin";

/** An error worth surfacing to the user rather than only to the console. */
export class NeoCalendarError {
    constructor(public message: string) {}
}

/** Where an event sits in the vault: a file, plus a line for inline events. */
export type EventLocation = {
    file: { path: string };
    lineNumber: number | undefined;
};

/** Credentials for a source that needs them (CalDAV, today). */
export type Authentication = {
    type: "basic";
    username: string;
    password: string;
};
