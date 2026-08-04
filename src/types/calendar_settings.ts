import { ZodError, z } from "zod";
import { NeoEvent } from "./schema";
import { holidayRuleSchema } from "../calendars/auto/rules";
import { normalizeColor } from "../utils/color";

/**
 * How each kind of event source is configured. This is what lives in the
 * plugin's `data.json`, so the field names are a persistence contract: renaming
 * one would orphan an existing user's calendar.
 */
const calendarOptionsSchema = z.discriminatedUnion("type", [
    // A folder of notes, one event per note.
    z.object({ type: z.literal("local"), directory: z.string() }),
    // List items under a heading in the daily notes.
    z.object({ type: z.literal("dailynote"), heading: z.string() }),
    // A public .ics feed. `name` is an optional friendly label the user can set
    // (the feed carries no title); absent, the URL is shown.
    z.object({
        type: z.literal("ical"),
        url: z.string().url(),
        name: z.string().optional(),
    }),
    /**
     * A calendar computed from rules — public holidays and observances — with
     * no network and no files. The rules travel with the source so a calendar
     * stays self-contained whether it came from a country preset or was written
     * by hand. `id` is its identity (a country code, or a minted id).
     */
    z.object({
        type: z.literal("auto"),
        id: z.string(),
        name: z.string(),
        icon: z.string(),
        rules: z.array(holidayRuleSchema),
        /**
         * Where the calendar came from: a country's public holidays, or a
         * custom rule set (shipped, hand-written, or shared as JSON). Absent
         * on calendars added before the distinction existed — read as
         * "holidays".
         */
        kind: z.enum(["holidays", "custom"]).optional(),
        /**
         * Id of an existing calendar to file these events under. With a target
         * set, the calendar doesn't get its own row: its events show up inside
         * that calendar, in its colour. Nothing is written to the vault — the
         * events stay computed and read-only.
         */
        target: z.string().optional(),
    }),
    /**
     * Superseded by `auto`, kept so an early French-holidays calendar still
     * parses; {@link migrateCalendarSources} rewrites it on load.
     */
    z.object({ type: z.literal("holidays"), country: z.literal("FR") }),
    // One collection on a CalDAV server.
    z.object({
        type: z.literal("caldav"),
        name: z.string(),
        url: z.string().url(),
        homeUrl: z.string().url(),
        username: z.string(),
        password: z.string(),
    }),
]);

const colorSchema = z.object({ color: z.string() });

/**
 * An in-memory source used only by tests. It never reaches disk, and
 * user-facing logic must filter it out.
 */
export type TestSource = {
    type: "FOR_TEST_ONLY";
    id: string;
    events?: NeoEvent[];
};

/** A configured event source: its kind-specific options plus a display colour. */
export type CalendarInfo = (
    | z.infer<typeof calendarOptionsSchema>
    | TestSource
) &
    z.infer<typeof colorSchema>;

/** @throws ZodError if the object isn't a valid source. */
export function parseCalendarInfo(obj: unknown): CalendarInfo {
    return {
        ...calendarOptionsSchema.parse(obj),
        ...colorSchema.parse(obj),
    };
}

/** Like {@link parseCalendarInfo}, but yields `null` instead of throwing. */
export function safeParseCalendarInfo(obj: unknown): CalendarInfo | null {
    try {
        return parseCalendarInfo(obj);
    } catch (e) {
        if (e instanceof ZodError) {
            console.debug("Parsing calendar info failed with errors", {
                obj,
                error: e.message,
            });
        }
        return null;
    }
}

/** The theme's accent colour, which every new source starts out on.
 *
 * Normalised to `#rrggbb` on the way in: themes derive --interactive-accent from
 * `hsl(var(--accent-h) …)`, and getPropertyValue hands back the SUBSTITUTED value
 * — measured as `rgb(101,143,242)`. That string is a valid CSS colour but not a
 * hex one, and `<input type="color">`, the colour picker and the preset-name
 * lookup all need hex. Normalising here keeps every colour that reaches
 * `data.json` in one shape. */
const accentColor = (): string =>
    normalizeColor(
        getComputedStyle(document.body).getPropertyValue("--interactive-accent")
    );

/**
 * A half-filled source for the "add calendar" form to build on. iCloud is a
 * CalDAV server whose URL we already know, so picking it pre-fills that too.
 */
export function makeDefaultPartialCalendarSource(
    type: CalendarInfo["type"] | "icloud"
): Partial<CalendarInfo> {
    if (type === "icloud") {
        return {
            type: "caldav",
            color: accentColor(),
            url: "https://caldav.icloud.com",
        };
    }
    if (type === "auto") {
        // The picker fills in id/name/icon/rules from the chosen preset.
        return {
            type,
            id: "",
            name: "",
            icon: "flag",
            rules: [],
            color: accentColor(),
        };
    }
    return { type, color: accentColor() };
}
