import { useEffect as useNeoAndroidDraftEffect } from "react";
import { useState, useCallback } from "react";
import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import { DraftRange } from "./TimeGrid.types";

interface DraftSlot {
    start: Date;
    end: Date;
    allDay: boolean;
    calendarId: string;
}

/** Le calendrier ou atterrit un brouillon : le calendrier par defaut quand il
    fait partie des editables, sinon le premier editable en dernier recours.
    L'ordre de `cache.calendars` est celui des sources dans data.json, il ne dit
    rien du choix de l'utilisateur : s'en servir comme substitut du calendrier par
    defaut creait l'evenement sur le mauvais calendrier et peignait la selection
    de la mauvaise couleur. */
export function pickDraftCalendar<T extends { id: string }>(
    editableCalendars: T[],
    defaultCalendarId: string | undefined
): T | null {
    return (
        editableCalendars.find((cal) => cal.id === defaultCalendarId) ??
        editableCalendars[0] ??
        null
    );
}

export function useDraftEvent({
    cache,
    settings,
    clearPanelEventId,
    setDraftAnchor,
    fallbackSelectRange,
    getDefaultCalendarId,
}: {
    cache: any;
    settings: { defaultEventsAsTasks: boolean };
    clearPanelEventId: () => void;
    setDraftAnchor: () => void;
    fallbackSelectRange?: (start: Date, end: Date, allDay: boolean) => void;
    /** Lu au moment de la selection, pas au montage : l'appelant peut declarer
        le calendrier par defaut apres ce hook dans son corps de composant. */
    getDefaultCalendarId?: () => string;
}) {
    const [draftSlot, setDraftSlot] = useState<DraftSlot | null>(null);

    // NEO_ANDROID_DRAFT_BRIDGE_START
    useNeoAndroidDraftEffect(() => {
        const androidWindow = window as Window & {
            __neoCalendarAndroidDraftState?: {
                startMs: number;
                endMs: number;
                allDay: boolean;
            } | null;
        };

        androidWindow.__neoCalendarAndroidDraftState = draftSlot
            ? {
                  startMs: draftSlot.start.getTime(),
                  endMs: draftSlot.end.getTime(),
                  allDay: draftSlot.allDay,
              }
            : null;
    }, [draftSlot]);

    // NEO_ANDROID_DRAFT_BRIDGE_END
    // A window CustomEvent used to carry draft resizes when no callback was
    // wired. Both ends are gone: the grid now always calls onResizeDraft, and
    // every caller provides it, so the bridge only duplicated resizeDraft.

    const handleSelectRange = useCallback(
        (start: Date, end: Date, allDay: boolean) => {
            const editableCalendars = Array.from(
                cache.calendars.values()
            ).filter(
                (cal): cal is EditableCalendar =>
                    cal instanceof EditableCalendar
            );
            if (editableCalendars.length === 0) {
                fallbackSelectRange?.(start, end, allDay);
                return;
            }
            const calendar = pickDraftCalendar(
                editableCalendars,
                getDefaultCalendarId?.()
            ) as any;
            clearPanelEventId();
            setDraftSlot({ start, end, allDay, calendarId: calendar.id });
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setDraftAnchor();
                });
            });
        },
        [
            cache,
            clearPanelEventId,
            setDraftAnchor,
            fallbackSelectRange,
            getDefaultCalendarId,
        ]
    );

    const commitDraft = useCallback(
        async (
            title: string,
            updates?: Partial<NeoEvent>,
            calendarId?: string
        ): Promise<string | null> => {
            if (!draftSlot) return null;
            const startDate = DateTime.fromJSDate(draftSlot.start).toISODate();
            if (!startDate) return null;
            const newEvent: any = {
                title,
                date: startDate,
                type: "single",
                allDay: draftSlot.allDay,
            };
            if (!draftSlot.allDay) {
                newEvent.startTime = DateTime.fromJSDate(
                    draftSlot.start
                ).toISOTime({
                    includeOffset: false,
                    suppressMilliseconds: true,
                    suppressSeconds: true,
                    includePrefix: false,
                });
                newEvent.endTime = DateTime.fromJSDate(draftSlot.end).toISOTime(
                    {
                        includeOffset: false,
                        suppressMilliseconds: true,
                        suppressSeconds: true,
                        includePrefix: false,
                    }
                );
                // Cross-day timed selection (Notion-style): when the drag ends on
                // a later day, carry the end day so it becomes a multi-day event
                // instead of a same-day one whose end time wraps past midnight.
                const endDay = DateTime.fromJSDate(draftSlot.end).toISODate();
                if (endDay && endDay !== startDate) newEvent.endDate = endDay;
            } else {
                const endDate = DateTime.fromJSDate(draftSlot.end)
                    .minus({ days: 1 })
                    .toISODate();
                // Only set endDate for a genuine multi-day span (end strictly
                // after start). A single-day all-day selection must NOT write an
                // endDate one day before date ("fin avant début").
                if (endDate && endDate > startDate) newEvent.endDate = endDate;
            }
            if (settings.defaultEventsAsTasks) {
                newEvent.completed = false;
            }
            if (updates) Object.assign(newEvent, updates);
            const targetCalendarId = calendarId || draftSlot.calendarId;
            try {
                const id = await cache.addEvent(targetCalendarId, newEvent);
                return id;
            } catch {
                return null;
            }
        },
        [cache, draftSlot, settings]
    );

    const resizeDraft = useCallback((range: DraftRange) => {
        setDraftSlot((previous) =>
            previous
                ? {
                      ...previous,
                      start: range.start,
                      end: range.end,
                  }
                : previous
        );
    }, []);

    const discardDraft = useCallback(() => {
        setDraftSlot(null);
    }, []);

    return {
        draftSlot,
        handleSelectRange,
        commitDraft,
        resizeDraft,
        discardDraft,
    };
}
