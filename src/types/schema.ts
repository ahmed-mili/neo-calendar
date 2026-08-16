import { z, ZodError } from "zod";

/**
 * The single normalized representation every event source is translated to.
 *
 * The shape is a cross-product of three independent facets, each modelled as
 * its own Zod schema so they can be validated and generated in isolation:
 *   - common metadata (title, id, …), always present;
 *   - a time facet, discriminated by `allDay`;
 *   - an event-kind facet, discriminated by `type`.
 *
 * The field names and structure here ARE the on-disk contract documented in
 * docs/event-format-spec.md — kept byte-compatible with events written by the
 * upstream plugin.
 */

/** A calendar date, stored verbatim as a string (e.g. "2022-01-01"). */
export const ParsedDate = z.string();

/** A clock time, stored verbatim as a string (e.g. "09:30"). */
export const ParsedTime = z.string();

/**
 * `completed` marks a task-style event: an ISO date when it was finished, the
 * literal `false` when not, `"in-progress"` for a partial state, or `null`.
 */
const CompletedSchema = ParsedDate.or(z.literal(false))
    .or(z.literal("in-progress"))
    .or(z.literal(null))
    .optional();

/**
 * `due` is a task's deadline — the day it has to be DONE by.
 *
 * It is not the same thing as `date`, and that is the whole point. An event has
 * no deadline: it *is* its date, and when the hour passes it is over. A task
 * has two separate days that rarely coincide — the one you set aside to do it
 * ("jeudi 14h, écrire le rapport") and the one it is owed by ("vendredi"). The
 * calendar can only hold the first; without this field the second has nowhere
 * to live, and lateness has to be guessed from the wrong day.
 *
 * Only the task-capable types carry it. On a plain event it would be
 * meaningless, and the UI only offers it once an entry is a task.
 */
const DueSchema = ParsedDate.or(z.literal(null)).optional();

/**
 * `completedDates` records WHICH occurrences of a series have been done.
 *
 * A series cannot use `completed` for that: there is one field and many
 * occurrences, so ticking Tuesday the 12th would tick every other Tuesday
 * with it. The per-occurrence truth needs a list, exactly as `skipDates`
 * already holds the occurrences that were detached.
 *
 * `completed` still appears on a series, but only as the marker that says the
 * series IS a task; its value is never a finish date there, because a series
 * as a whole is never finished.
 *
 * Optional rather than defaulted: a default would materialise
 * `completedDates: []` on every series the app parses, and the next write would
 * stamp that empty key into notes that have nothing to do with tasks. The key
 * appears the first time an occurrence is actually ticked, and not before.
 */
const CompletedDatesSchema = z.array(ParsedDate).optional();

/**
 * A description written for ONE occurrence of a series.
 *
 * A series is a single note, so its `description` is read by every occurrence
 * it produces — change it on one Tuesday and every other Tuesday says the same
 * thing. That is the right default, and it is what most series want; this is
 * the exception, held the way `completedDates` and `skipDates` hold their own
 * per-occurrence truths: a flat list, one line per date that differs.
 *
 * Each entry is the ISO day, a space, then the text — `"2026-08-16 Bring the
 * keys"`. A date with nothing after it is an occurrence deliberately left
 * blank, which is not the same as one that follows the series.
 */
const OccurrenceDescriptionsSchema = z.array(z.string()).optional();

/** Time facet: all-day events carry no clock times; timed ones carry both. */
export const TimeSchema = z.discriminatedUnion("allDay", [
    z.object({ allDay: z.literal(true) }),
    z.object({
        allDay: z.literal(false),
        startTime: ParsedTime,
        endTime: ParsedTime.nullable().default(null),
    }),
]);

/**
 * The steps a task is made of, in the order they are to be done.
 *
 * Each one is a line of Markdown carrying its own checkbox — `"[x] Book the
 * van"`, `"[ ] Pack"` — rather than a nested object, and that is deliberate:
 * frontmatter here is written line by line, values being scalars or flat lists
 * of them, and a list of objects would need a nested YAML writer in each of the
 * two persistence layers. A checkbox in front of the text is also exactly how
 * the same list would be written by hand in the note's body, so a note opened
 * outside the app still reads as what it is.
 *
 * The mark follows the one events already use (see dailyNoteParsing): a space,
 * `/` or `~` is still to do, anything else is done. A line with no mark at all
 * is a subtask that has not been started.
 */
const SubtasksSchema = z.array(z.string()).optional();

/** Metadata common to every event, regardless of time or kind. */
export const CommonSchema = z.object({
    title: z.string(),
    id: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    subtasks: SubtasksSchema,
});

/** Event-kind facet, discriminated by `type`. */
export const EventSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("single"),
        date: ParsedDate,
        endDate: ParsedDate.nullable().default(null),
        completed: CompletedSchema,
        due: DueSchema,
    }),
    z.object({
        type: z.literal("recurring"),
        daysOfWeek: z.array(z.enum(["U", "M", "T", "W", "R", "F", "S"])),
        completed: CompletedSchema,
        completedDates: CompletedDatesSchema,
        startRecur: ParsedDate.optional(),
        endRecur: ParsedDate.optional(),
        // Dates this series does NOT occur on — how a single occurrence gets
        // detached (moved or resized on its own) without losing the rest.
        // Defaulted, never required: notes written before this existed — every
        // one the upstream plugin wrote — carry no such key and must stay valid.
        skipDates: z.array(ParsedDate).default([]),
        occurrenceDescriptions: OccurrenceDescriptionsSchema,
    }),
    z.object({
        type: z.literal("rrule"),
        startDate: ParsedDate,
        rrule: z.string(),
        skipDates: z.array(ParsedDate),
        completed: CompletedSchema,
        completedDates: CompletedDatesSchema,
        occurrenceDescriptions: OccurrenceDescriptionsSchema,
    }),
    z.object({
        type: z.literal("someday"),
        completed: CompletedSchema,
        due: DueSchema,
    }),
]);

type CommonType = z.infer<typeof CommonSchema>;
type TimeType = z.infer<typeof TimeSchema>;
type EventType = z.infer<typeof EventSchema>;

export type NeoEvent = CommonType & TimeType & EventType;

/**
 * Frontmatter keys owned by exactly one event `type`. When an event changes
 * type the replacement object no longer carries the previous type's keys, so
 * persistence layers must DROP the stale lines rather than keep them. This is
 * the single source of truth shared by the frontmatter writer and the UI's
 * save-merge, so the two can never drift.
 */
export const TYPE_DISCRIMINANT_KEYS = [
    "date",
    "endDate",
    "completed",
    "due",
    "daysOfWeek",
    "startRecur",
    "endRecur",
    "rrule",
    "startDate",
    "skipDates",
    "completedDates",
    "occurrenceDescriptions",
] as const;

/**
 * Keys the model TAKES AWAY when an event stops carrying them, rather than
 * leaving the old line behind.
 *
 * The type-exclusive keys above are the bulk of it, for the reason given there.
 * `subtasks` joins them on its own account: a task whose last step has been
 * deleted has no list, and "no list" has to reach the note as the line being
 * removed — a merge that only ever adds and overwrites would keep the steps
 * that were just thrown away.
 *
 * Everything NOT in this set is left exactly as found when the event does not
 * mention it, which is what protects keys the app knows nothing about.
 */
export const KEYS_DROPPED_WHEN_ABSENT = [
    ...TYPE_DISCRIMINANT_KEYS,
    "subtasks",
] as const;

/**
 * Normalize an arbitrary object into a fully-defaulted `NeoEvent`.
 *
 * The output key order is Common → Time → Event by construction; the
 * frontmatter serializer relies on that order, so it must not change.
 *
 * @throws ZodError if the object does not describe a valid event.
 */
export function parseEvent(obj: unknown): NeoEvent {
    if (typeof obj !== "object" || obj === null) {
        throw new Error("value for parsing was not an object.");
    }
    const raw = obj as Record<string, unknown>;

    // "someday" events are dateless and timeless: force all-day and skip the
    // time facet entirely (no startTime/endTime defaults get injected).
    if (raw.type === "someday") {
        return {
            ...CommonSchema.parse(obj),
            allDay: true,
            ...EventSchema.parse(obj),
        } as NeoEvent;
    }

    // Default an untyped object to a timed single event; the object's own
    // values win over these defaults.
    const withDefaults = { type: "single", allDay: false, ...raw };
    return {
        ...CommonSchema.parse(withDefaults),
        ...TimeSchema.parse(withDefaults),
        ...EventSchema.parse(withDefaults),
    };
}

/**
 * Like {@link parseEvent} but never throws: returns `null` for anything that
 * fails validation, so a single malformed note can't break a whole calendar.
 */
export function validateEvent(obj: unknown): NeoEvent | null {
    try {
        return parseEvent(obj);
    } catch (e) {
        if (e instanceof ZodError) {
            console.debug("Parsing failed with errors", {
                obj,
                message: e.message,
            });
        }
        return null;
    }
}

type Json = { [key: string]: Json } | Json[] | string | number | boolean | null;

/**
 * Turn a normalized event back into a plain JSON object (a shallow copy),
 * ready to be written to frontmatter or a daily-note bullet.
 */
export function serializeEvent(event: NeoEvent): Json {
    return { ...event };
}
