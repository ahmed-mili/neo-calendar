import { NeoEvent } from "../../../src/types";

jest.mock("./platform/tauriSettingsStore", () => ({
    loadDeviceWorkspacePreferences: jest.fn(),
    saveDeviceWorkspacePreferences: jest.fn(),
}));

jest.mock("./DesktopCalendar.css", () => ({}));

import {
    canPersistDesktopTaskCompletion,
    replaceRecord,
    revertRecord,
} from "./DesktopCalendar";

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

/*
 * Cocher une tâche répond tout de suite.
 *
 * L'écriture allait au disque avant que la case ne bascule : sur téléphone, où
 * le fichier passe par le pont natif et le stockage partagé, la coche restait
 * vide une bonne seconde et l'appui semblait perdu. On montre donc la décision
 * aussitôt, et on la retire si l'écriture échoue.
 */
describe("un enregistrement qu'on montre avant de l'écrire", () => {
    const record = (over: Record<string, unknown> = {}) =>
        ({
            id: "r1",
            calendarId: "cal",
            calendarPath: "Études",
            relativePath: "Études/note.md",
            fileName: "note.md",
            contents: "---\ntitle: Note\n---\n",
            event: task(),
            ...over,
        } as never);

    it("replaces the record it names, and leaves the others alone", () => {
        const a = record({ id: "a" });
        const b = record({ id: "b" });
        const nextB = record({ id: "b", contents: "coché" });

        expect(replaceRecord([a, b], "b", nextB)).toEqual([a, nextB]);
    });

    it("puts the old one back when the write fails", () => {
        const before = record({ contents: "avant" });
        const shown = record({ contents: "montré" });

        expect(revertRecord([shown], shown, before)).toEqual([before]);
    });

    it("keeps out of the way when something newer has landed since", () => {
        // Deux appuis coup sur coup : l'echec du premier ne doit pas effacer
        // ce que le second a deja ecrit.
        const before = record({ contents: "avant" });
        const shown = record({ contents: "montré" });
        const newer = record({ contents: "plus récent" });

        expect(revertRecord([newer], shown, before)).toEqual([newer]);
    });

    it("keeps out of the way when the record is gone", () => {
        const before = record({ contents: "avant" });
        const shown = record({ contents: "montré" });

        expect(revertRecord([], shown, before)).toEqual([]);
    });
});
