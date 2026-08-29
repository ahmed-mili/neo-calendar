/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { NeoEvent } from "../../types";
import { DraftInfo } from "./EventPanel";
import { useEventFormState } from "./useEventFormState";

type FormState = ReturnType<typeof useEventFormState>;
type HookArgs = Parameters<typeof useEventFormState>[0];

describe("multi-day form state", () => {
    let host: HTMLDivElement;
    let state: FormState | null;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
        state = null;
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    function Harness({ args }: { args: HookArgs }) {
        state = useEventFormState(args);
        return null;
    }

    function renderForm(args: HookArgs): FormState {
        act(() => {
            ReactDOM.render(<Harness args={args} />, host);
        });
        if (!state) throw new Error("form state was not rendered");
        return state;
    }

    const calendars = [{ id: "cal", name: "Calendar", type: "local" }];

    it("keeps the real endDate when an existing timed event spans Friday through Monday", () => {
        const event = {
            type: "single",
            title: "Multi-day",
            date: "2026-08-28",
            endDate: "2026-08-31",
            allDay: false,
            startTime: "14:15",
            endTime: "15:15",
        } as NeoEvent;

        const form = renderForm({
            eventId: "event.md",
            event,
            draft: null,
            editableCalendars: calendars,
            currentCalendarId: "cal",
        });

        expect(form.date).toBe("2026-08-28");
        expect(form.endDate).toBe("2026-08-31");
        expect(form.buildPayload()).toMatchObject({
            type: "single",
            date: "2026-08-28",
            endDate: "2026-08-31",
            startTime: "14:15",
            endTime: "15:15",
        });
    });

    it("derives and persists the endDate for a new timed multi-day draft", () => {
        const draft: DraftInfo = {
            start: new Date(2026, 7, 28, 14, 15),
            end: new Date(2026, 7, 31, 15, 15),
            allDay: false,
            defaultAsTask: false,
        };

        const form = renderForm({
            eventId: null,
            event: null,
            draft,
            editableCalendars: calendars,
            currentCalendarId: "cal",
        });

        expect(form.date).toBe("2026-08-28");
        expect(form.endDate).toBe("2026-08-31");
        expect(form.buildPayload()).toMatchObject({
            type: "single",
            date: "2026-08-28",
            endDate: "2026-08-31",
        });
    });

    it("converts the exclusive grid end of a new all-day draft to the visible inclusive end date", () => {
        const draft: DraftInfo = {
            start: new Date(2026, 7, 28, 0, 0),
            end: new Date(2026, 8, 1, 0, 0),
            allDay: true,
            defaultAsTask: false,
        };

        const form = renderForm({
            eventId: null,
            event: null,
            draft,
            editableCalendars: calendars,
            currentCalendarId: "cal",
        });

        expect(form.date).toBe("2026-08-28");
        expect(form.endDate).toBe("2026-08-31");
        expect(form.buildPayload()).toMatchObject({
            type: "single",
            date: "2026-08-28",
            endDate: "2026-08-31",
            allDay: true,
        });
    });
});
