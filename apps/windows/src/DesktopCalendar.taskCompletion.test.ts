/** @jest-environment jsdom */
import React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { NeoEvent } from "../../../src/types";
import { useDeletionHistory } from "./useDeletionHistory";

jest.mock("./platform/tauriSettingsStore", () => ({
    loadDeviceWorkspacePreferences: jest.fn(),
    saveDeviceWorkspacePreferences: jest.fn(),
}));

jest.mock("./DesktopCalendar.css", () => ({}));

import {
    canPersistDesktopTaskCompletion,
    replaceRecord,
    revertRecord,
    shouldRememberDeletedBatch,
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

/*
 * Régression : Android tenait déjà l'Annuler d'une suppression avant la
 * Tâche 4 (`setDeletedBatch` n'était conditionné que par `remember`, jamais
 * par la plateforme). Un premier passage de cette tâche avait ajouté
 * `&& !isAndroid` à cette garde en suivant le brief au pied de la lettre —
 * cassant l'Annuler sur un Xiaomi avec clavier Bluetooth. `deleteEvents`
 * (DesktopCalendar.tsx) n'appelle plus qu'un `if`, mais passe TOUJOURS par
 * `shouldRememberDeletedBatch`, qui n'a délibérément aucun paramètre de
 * plateforme : ce test verrouille à la fois cette fonction et sa composition
 * avec `useDeletionHistory`, pour qu'un futur `&& !isAndroid` glissé ici la
 * fasse échouer plutôt que de repasser inaperçu.
 */
describe("shouldRememberDeletedBatch — l'Annuler ne connaît pas la plateforme", () => {
    it("dit oui quand l'appelant le demande, sans paramètre de plateforme à côté duquel glisser un `isAndroid`", () => {
        expect(shouldRememberDeletedBatch(true)).toBe(true);
        expect(shouldRememberDeletedBatch(false)).toBe(false);
    });

    it("composé avec useDeletionHistory (le chemin réel de deleteEvents) : une suppression mémorisée rend canUndo vrai — y compris \"sur Android\"", () => {
        // Rejoue exactement ce que `deleteEvents` fait après une suppression
        // réussie, sans jamais lire `isAndroid` : si ce chemin le faisait, ce
        // test resterait vert par accident. C'est précisément la garde qui a
        // régressé lors du premier passage de cette tâche.
        const container = document.createElement("div");
        document.body.appendChild(container);
        const restore = jest.fn().mockResolvedValue(undefined);
        const remove = jest.fn().mockResolvedValue(undefined);
        let history!: ReturnType<typeof useDeletionHistory>;
        function Harness() {
            history = useDeletionHistory({ restore, remove });
            return null;
        }
        act(() => {
            ReactDOM.render(React.createElement(Harness), container);
        });

        const deleted = [
            {
                id: "android-delete",
                calendarId: "cal",
                calendarPath: "Études",
                relativePath: "Études/note.md",
                fileName: "note.md",
                contents: "---\ntitle: Note\n---\n",
                event: task(),
            } as never,
        ];
        act(() => {
            if (shouldRememberDeletedBatch(true)) {
                history.rememberDeleted(deleted);
            }
        });

        expect(history.canUndo).toBe(true);

        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });
});
