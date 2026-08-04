import { App, normalizePath } from "obsidian";
import { z } from "zod";
import { HolidayRule, holidayRuleSchema } from "./rules";

/** One country's ready-made rule set, as shipped in holiday-presets.json. */
export interface HolidayPreset {
    name: string;
    icon: string;
    rules: HolidayRule[];
}

export type PresetCatalogue = Record<string, HolidayPreset>;

/**
 * The presets live in a data file next to main.js instead of inside the bundle:
 * 206 countries weigh 325 KB, of which a user needs one or two, and only while
 * the country picker is open. Read once, then kept in memory — adding a
 * calendar copies its rules into data.json, so nothing here is needed again.
 */
let cached: PresetCatalogue | null = null;

export async function loadPresetCatalogue(
    app: App,
    pluginDir: string
): Promise<PresetCatalogue> {
    if (cached) return cached;
    const path = normalizePath(`${pluginDir}/holiday-presets.json`);
    const raw = await app.vault.adapter.read(path);
    cached = JSON.parse(raw) as PresetCatalogue;
    return cached;
}

/**
 * Custom rule sets shipped with the plugin — not tied to a country. Same shape
 * as a country preset, plus a line describing what it covers.
 */
export interface CustomPreset extends HolidayPreset {
    description: string;
}

let customCache: Record<string, CustomPreset> | null = null;

export async function loadCustomPresets(
    app: App,
    pluginDir: string
): Promise<Record<string, CustomPreset>> {
    if (customCache) return customCache;
    const path = normalizePath(`${pluginDir}/custom-presets.json`);
    const raw = await app.vault.adapter.read(path);
    customCache = JSON.parse(raw) as Record<string, CustomPreset>;
    return customCache;
}

/**
 * A custom calendar as it travels between users: name, icon and rules, nothing
 * else. Colour, target and id belong to whoever imports it.
 */
export const sharedCalendarSchema = z.object({
    name: z.string().min(1),
    icon: z.string().optional(),
    rules: z.array(holidayRuleSchema).min(1),
});

export type SharedCalendar = z.infer<typeof sharedCalendarSchema>;

/** @returns the calendar, or a message explaining why the text isn't one. */
export function parseSharedCalendar(
    text: string
): { ok: true; value: SharedCalendar } | { ok: false; error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, error: "That isn't valid JSON." };
    }
    const result = sharedCalendarSchema.safeParse(parsed);
    if (!result.success) {
        const issue = result.error.issues[0];
        return {
            ok: false,
            error: `${issue.path.join(".") || "calendar"}: ${issue.message}`,
        };
    }
    return { ok: true, value: result.data };
}

/** The JSON to hand someone else, from a configured auto calendar. */
export function serializeSharedCalendar(calendar: SharedCalendar): string {
    return JSON.stringify(
        {
            name: calendar.name,
            icon: calendar.icon ?? "flag",
            rules: calendar.rules,
        },
        null,
        2
    );
}

/** Countries as the picker lists them: sorted by name, code carried along. */
export function presetOptions(
    catalogue: PresetCatalogue
): { code: string; name: string }[] {
    return Object.entries(catalogue)
        .map(([code, preset]) => ({ code, name: preset.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
