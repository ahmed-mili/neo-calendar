import { NeoEvent } from "../../../src/types";

jest.mock("./platform/tauriSettingsStore", () => ({
    loadDeviceWorkspacePreferences: jest.fn(),
    saveDeviceWorkspacePreferences: jest.fn(),
}));

jest.mock("./DesktopCalendar.css", () => ({}));

import { canPersistDesktopTaskCompletion } from "./DesktopCalendar";

const task = (overrides: Partial<NeoEvent> = {}): NeoEvent =>
    ({
        title: "Write report",
        allDay: true,
        type: "someday",
        completed: false,
        ...overrides,
    } as NeoEvent);

describe("desktop task completion guard", () => {
    it("rejects completing an undated task on Windows", () => {
        expect(canPersistDesktopTaskCompletion(task(), true, false)).toBe(
            false
        );
    });

    it("allows completing a dated or deadline task on Windows", () => {
        expect(
            canPersistDesktopTaskCompletion(
                task({ type: "single", date: "2026-09-02", endDate: null }),
                true,
                false
            )
        ).toBe(true);
        expect(
            canPersistDesktopTaskCompletion(
                task({ due: "2026-09-02" }),
                true,
                false
            )
        ).toBe(true);
    });

    it("preserves Android behavior", () => {
        expect(canPersistDesktopTaskCompletion(task(), true, true)).toBe(true);
    });
});
