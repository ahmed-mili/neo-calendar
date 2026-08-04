import { useState, useCallback, useRef } from "react";

interface SettingsLike {
    hiddenCalendars: string[];
}

interface PluginLike {
    saveData: (data: any) => void;
    settings: any;
}

export type CalendarVisibilityTransition = "entering" | "exiting";

export function diffCalendarVisibility(
    previousHidden: Set<string>,
    nextHidden: Set<string>
): Map<string, CalendarVisibilityTransition> {
    const changes = new Map<string, CalendarVisibilityTransition>();
    const ids = new Set([...previousHidden, ...nextHidden]);
    for (const id of ids) {
        const wasHidden = previousHidden.has(id);
        const isHidden = nextHidden.has(id);
        if (wasHidden === isHidden) continue;
        changes.set(id, isHidden ? "exiting" : "entering");
    }
    return changes;
}

export function useCalendarVisibility(
    settings: SettingsLike,
    plugin: PluginLike
) {
    const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(
        () => new Set(settings.hiddenCalendars || [])
    );
    const [calendarVisibilityTransitions, setCalendarVisibilityTransitions] =
        useState<Map<string, CalendarVisibilityTransition>>(new Map());
    const [soloCalendarId, setSoloCalendarId] = useState<string | null>(null);
    // Remembers the visibility state from before "show only this calendar",
    // so we can restore exactly what was visible before.
    const prevHiddenRef = useRef<string[] | null>(null);

    const persist = useCallback(
        (next: Set<string>) => {
            settings.hiddenCalendars = Array.from(next);
            plugin.saveData(plugin.settings);
        },
        [settings, plugin]
    );

    const applyVisibility = useCallback(
        (next: Set<string>) => {
            const changes = diffCalendarVisibility(hiddenCalendars, next);
            if (changes.size > 0) {
                setCalendarVisibilityTransitions((current) => {
                    const updated = new Map(current);
                    changes.forEach((state, id) => updated.set(id, state));
                    return updated;
                });
            }
            setHiddenCalendars(next);
            persist(next);
        },
        [hiddenCalendars, persist]
    );

    const handleToggleCalendar = useCallback(
        (calendarId: string) => {
            const next = new Set(hiddenCalendars);
            if (next.has(calendarId)) next.delete(calendarId);
            else next.add(calendarId);
            applyVisibility(next);
            // A manual toggle ends any "show only" session.
            setSoloCalendarId(null);
            prevHiddenRef.current = null;
        },
        [hiddenCalendars, applyVisibility]
    );

    const handleShowOnly = useCallback(
        (calendarId: string, allCalendarIds: string[]) => {
            const isSolo = soloCalendarId === calendarId;
            if (isSolo && prevHiddenRef.current) {
                applyVisibility(new Set(prevHiddenRef.current));
                setSoloCalendarId(null);
                prevHiddenRef.current = null;
                return;
            }

            prevHiddenRef.current = Array.from(hiddenCalendars);
            applyVisibility(
                new Set(allCalendarIds.filter((id) => id !== calendarId))
            );
            setSoloCalendarId(calendarId);
        },
        [soloCalendarId, hiddenCalendars, applyVisibility]
    );

    const finishCalendarVisibilityTransition = useCallback(
        (calendarId: string, expected: CalendarVisibilityTransition) => {
            setCalendarVisibilityTransitions((current) => {
                if (current.get(calendarId) !== expected) return current;
                const next = new Map(current);
                next.delete(calendarId);
                return next;
            });
        },
        []
    );

    return {
        hiddenCalendars,
        setHiddenCalendars,
        handleToggleCalendar,
        soloCalendarId,
        handleShowOnly,
        calendarVisibilityTransitions,
        finishCalendarVisibilityTransition,
    };
}
