import { PresetCatalogue } from "./presets";

/**
 * Rewrites the pre-`auto` French-holidays source into a rule-carrying auto
 * calendar. The old shape stored only `{ type: "holidays", country: "FR" }` and
 * kept its rules in the plugin's code; auto calendars carry their own, so the
 * migration copies them out of the shipped preset.
 *
 * A source is left untouched when its preset is missing rather than dropped —
 * the calendar simply doesn't load that session, and the next start (with the
 * preset file in place) migrates it.
 */
export function migrateCalendarSources<T extends { type: string }>(
    sources: T[],
    catalogue: PresetCatalogue
): { sources: T[]; changed: boolean } {
    let changed = false;
    const migrated = sources.map((source) => {
        if (source.type !== "holidays") return source;
        const country = (source as { country?: string }).country ?? "FR";
        const preset = catalogue[country];
        if (!preset) return source;
        changed = true;
        return {
            ...source,
            type: "auto",
            id: country,
            name: preset.name,
            icon: preset.icon,
            rules: preset.rules,
        } as unknown as T;
    });
    return { sources: migrated, changed };
}
