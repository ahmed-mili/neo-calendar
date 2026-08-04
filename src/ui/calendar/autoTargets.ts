import { CalendarInfo } from "../../types";

/**
 * An auto calendar can file its events under a calendar the user already has
 * ("put the Islamic dates in my الْإِسْلَامُ calendar") instead of appearing as a
 * row of its own.
 *
 * This is a display-time redirection: the events keep being computed and stay
 * read-only, nothing is written to the vault, and removing the target puts the
 * calendar back on its own row. Only the id, colour and name the view sees are
 * swapped for the host's.
 */
export type TargetMap = Map<string, string>;

/** Auto calendar id → host calendar id, for the sources that declare one. */
export function buildTargetMap(sources: CalendarInfo[]): TargetMap {
    const map: TargetMap = new Map();
    const known = new Set(
        sources
            .map((source) => calendarIdOf(source))
            .filter(Boolean) as string[]
    );
    for (const source of sources) {
        if (source.type !== "auto" || !source.target) continue;
        // A target that no longer exists is ignored, so deleting the host
        // calendar surfaces the auto one again instead of hiding its events.
        if (!known.has(source.target)) continue;
        map.set(`auto::${source.id}`, source.target);
    }
    return map;
}

/** The `<type>::<identifier>` id a configured source will be registered under. */
export function calendarIdOf(source: CalendarInfo): string | null {
    switch (source.type) {
        case "local":
            return `local::${source.directory}`;
        case "dailynote":
            return `dailynote::${source.heading}`;
        case "ical":
            return `ical::${source.url}`;
        case "caldav":
            return `caldav::${source.url}`;
        case "auto":
            return `auto::${source.id}`;
        default:
            return null;
    }
}
