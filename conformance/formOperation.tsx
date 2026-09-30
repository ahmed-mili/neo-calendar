import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { NeoEvent } from "../src/types";
import { validateEvent } from "../src/types/schema";
import { useEventFormState } from "../src/ui/calendar/useEventFormState";
import type { DraftInfo } from "../src/ui/calendar/EventPanel";

/*
 * L'opération `form.payload` du corpus : la fiche d'évènement rendue pour de
 * bon (le hook `useEventFormState`, sous jsdom), quelques champs modifiés par
 * ses propres modificateurs, puis ce qu'elle lit (les valeurs du formulaire) et
 * ce qu'elle écrirait (`buildPayload`). Elle vit à part de operations.ts parce
 * qu'elle a besoin d'un DOM : voir formRunner.test.tsx.
 */

type FormState = ReturnType<typeof useEventFormState>;

export interface FormInput {
    /** Les évènements passent par la validation, comme ceux que l'app lit sur le disque. */
    event?: unknown;
    eventId?: string;
    /** Une ébauche : début et fin en heure locale (`2026-08-28T14:15`). */
    draft?: { start: string; end: string; allDay: boolean; defaultAsTask: boolean };
    calendars?: { id: string; name: string; type: string }[];
    currentCalendarId?: string;
    /** Des modificateurs du formulaire, appliqués dans l'ordre : [nom, valeur]. */
    edits?: [string, unknown][];
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Une date de fin de tâche est l'instant de l'écriture : elle ne se compare pas, sa présence oui. */
const maskInstants = (value: unknown): unknown => {
    if (typeof value === "string" && ISO_INSTANT.test(value)) return "<horodatage>";
    if (Array.isArray(value)) return value.map(maskInstants);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskInstants(v)]));
    }
    return value;
};

export function formPayload(input: FormInput): unknown {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let state: FormState | null = null;
    const Harness = ({ args }: { args: Parameters<typeof useEventFormState>[0] }) => {
        state = useEventFormState(args);
        return null;
    };

    const calendars = input.calendars ?? [{ id: "cal", name: "Calendar", type: "local" }];
    const event = input.event ? (validateEvent(input.event) as NeoEvent) : null;
    const draft: DraftInfo | null = input.draft
        ? {
              start: new Date(input.draft.start),
              end: new Date(input.draft.end),
              allDay: input.draft.allDay,
              defaultAsTask: input.draft.defaultAsTask,
          }
        : null;
    const args = {
        eventId: event ? input.eventId ?? "event.md" : null,
        event,
        draft,
        editableCalendars: calendars,
        currentCalendarId: input.currentCalendarId ?? calendars[0].id,
    };

    try {
        act(() => {
            ReactDOM.render(<Harness args={args} />, host);
        });
        for (const [name, value] of input.edits ?? []) {
            act(() => {
                const setter = (state as unknown as Record<string, (v: unknown) => void>)[name];
                if (typeof setter !== "function") throw new Error(`modificateur inconnu : ${name}`);
                // JSON ne porte pas `undefined` : un cas l'écrit { "$undefined": true }.
                const revived = value && typeof value === "object" && (value as { $undefined?: boolean }).$undefined ? undefined : value;
                setter(revived);
            });
        }
        const form = state as unknown as FormState;
        return maskInstants({
            values: {
                title: form.title,
                description: form.description,
                location: form.location,
                date: form.date,
                endDate: form.endDate,
                startTime: form.startTime,
                endTime: form.endTime,
                allDay: form.allDay,
                isRecurring: form.isRecurring,
                // Sans date, la répétition par défaut part d'aujourd'hui : elle ne se compare pas.
                recurrence: event && event.type === "someday" ? "<auj>" : form.recurrence,
                calendarIndex: form.calendarIndex,
                taskStatus: form.taskStatus,
                due: form.due,
                reminders: form.reminders,
            },
            payload: form.buildPayload(),
        });
    } finally {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    }
}
