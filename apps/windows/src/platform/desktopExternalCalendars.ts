import type { NeoEvent } from "../../../../src/types";
import {
    expandRules,
    holidayRuleSchema,
    type HolidayRule,
} from "../../../../src/calendars/auto/rules";
import { getEventsFromICS } from "../../../../src/calendars/parsing/ics";

export interface DesktopIcalCalendarSource {
    type: "ical";
    id: string;
    name: string;
    url: string;
    color: string;
}

export interface DesktopAutoCalendarSource {
    type: "auto";
    id: string;
    country?: string;
    name: string;
    icon: string;
    color: string;
    rules: HolidayRule[];
}

export type DesktopExternalCalendarSource =
    | DesktopIcalCalendarSource
    | DesktopAutoCalendarSource;

export const FRANCE_HOLIDAY_SOURCE: DesktopAutoCalendarSource = {
    type: "auto",
    country: "FR",
    color: "#4a9d5f",
    id: "FR",
    name: "Jours fériés et autres fêtes en France",
    icon: "flag",
    rules: [
        { n: "Jour de l'an", k: "f", m: 1, d: 1 },
        { n: "Heure d'été", k: "n", m: 3, w: 0, i: -1 },
        { n: "Pâques", k: "e", o: 0 },
        { n: "Le lundi de Pâques", k: "e", o: 1 },
        { n: "La fête du Travail", k: "f", m: 5, d: 1 },
        { n: "Fête de la Victoire 1945", k: "f", m: 5, d: 8 },
        { n: "L'Ascension", k: "e", o: 39 },
        { n: "Pentecôte", k: "e", o: 49 },
        { n: "Le lundi de Pentecôte", k: "e", o: 50 },
        { n: "Fête des Mères", k: "n", m: 5, w: 0, i: -1, a: 49 },
        { n: "Fête des Pères", k: "n", m: 6, w: 0, i: 3 },
        { n: "La fête nationale", k: "f", m: 7, d: 14 },
        { n: "L'Assomption", k: "f", m: 8, d: 15 },
        { n: "Heure d'hiver", k: "n", m: 10, w: 0, i: -1 },
        { n: "La Toussaint", k: "f", m: 11, d: 1 },
        { n: "L'Armistice", k: "f", m: 11, d: 11 },
        { n: "La veille de Noël", k: "f", m: 12, d: 24 },
        { n: "Noël", k: "f", m: 12, d: 25 },
        { n: "la Saint-Sylvestre", k: "f", m: 12, d: 31 },
    ],
};

function stringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIcalUrl(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith("webcal://")
        ? `https://${trimmed.slice("webcal://".length)}`
        : trimmed;
}

export function externalCalendarId(
    source: DesktopExternalCalendarSource
): string {
    return source.type === "auto"
        ? `auto::${source.id}`
        : `ical::${normalizeIcalUrl(source.url)}`;
}

export function externalCalendarPreferenceKey(
    source: DesktopExternalCalendarSource
): string {
    return externalCalendarId(source);
}

export function parseExternalCalendarSources(
    value: unknown
): DesktopExternalCalendarSource[] {
    if (!Array.isArray(value)) return [];
    const result: DesktopExternalCalendarSource[] = [];
    const ids = new Set<string>();

    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const source = item as Record<string, unknown>;
        const type = source.type;
        const color = stringValue(source.color) ?? "#89b4fa";

        if (type === "ical") {
            const url = stringValue(source.url);
            if (!url) continue;
            const normalizedUrl = normalizeIcalUrl(url);
            if (!/^https?:\/\//i.test(normalizedUrl)) continue;
            const parsed: DesktopIcalCalendarSource = {
                type: "ical",
                id:
                    stringValue(source.id) ??
                    `ical-${Math.abs(hashString(normalizedUrl)).toString(36)}`,
                name: stringValue(source.name) ?? url,
                url,
                color,
            };
            const calendarId = externalCalendarId(parsed);
            if (!ids.has(calendarId)) {
                ids.add(calendarId);
                result.push(parsed);
            }
            continue;
        }

        if (type === "auto") {
            const id = stringValue(source.id);
            const name = stringValue(source.name);
            if (!id || !name || !Array.isArray(source.rules)) continue;
            const rules: HolidayRule[] = [];
            for (const rawRule of source.rules) {
                const parsedRule = holidayRuleSchema.safeParse(rawRule);
                if (parsedRule.success) rules.push(parsedRule.data);
            }
            if (!rules.length) continue;
            const parsed: DesktopAutoCalendarSource = {
                type: "auto",
                id,
                country: stringValue(source.country) ?? undefined,
                name,
                icon: stringValue(source.icon) ?? "flag",
                color,
                rules,
            };
            const calendarId = externalCalendarId(parsed);
            if (!ids.has(calendarId)) {
                ids.add(calendarId);
                result.push(parsed);
            }
        }
    }
    return result;
}

function hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return hash;
}

function slug(value: string): string {
    const normalized = value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .toLowerCase();
    return normalized || "event";
}

export function buildAutoCalendarEvents(
    source: DesktopAutoCalendarSource,
    currentYear: number
): NeoEvent[] {
    const holidays = expandRules(source.rules, currentYear - 5, currentYear + 10);
    const used = new Map<string, number>();
    return holidays.map(({ date, name }) => {
        const base = `auto-${source.id}-${date}-${slug(name)}`;
        const occurrence = used.get(base) ?? 0;
        used.set(base, occurrence + 1);
        return {
            id: occurrence === 0 ? base : `${base}-${occurrence}`,
            title: name,
            type: "single",
            date,
            endDate: null,
            allDay: true,
        } as NeoEvent;
    });
}

export function parseIcalCalendarEvents(text: string): NeoEvent[] {
    return getEventsFromICS(text);
}

export function cloneFranceHolidaySource(): DesktopAutoCalendarSource {
    return {
        ...FRANCE_HOLIDAY_SOURCE,
        rules: FRANCE_HOLIDAY_SOURCE.rules.map((rule) => ({ ...rule })),
    };
}
