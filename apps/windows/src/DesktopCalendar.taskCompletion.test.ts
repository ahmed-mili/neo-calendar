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
    deleteReentrant,
    pendingDeletions,
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

/*
 * Régression : `useDeletionHistory` rappelle `remove` avec le lot ENTIER à
 * chaque tentative de Rétablir — y compris après un échec à mi-lot. Le
 * `remove` réel (`deleteEventFiles`) doit donc être réentrant : ne retenter
 * que ce qui est encore présent sur "le disque" (ici, `liveRecords`), sinon
 * un second Rétablir redemande la suppression d'un fichier déjà parti, qui
 * échoue à son tour, et le lot devient impossible à rétablir pour de bon.
 */
describe("deleteReentrant / pendingDeletions — Rétablir reprend ce qu'il reste", () => {
    const two = [
        { id: "a", readOnly: false },
        { id: "b", readOnly: false },
    ];

    it("un second Rétablir ne retente pas ce qu'un essai précédent a déjà supprimé", async () => {
        // `liveRecords` représente `recordsRef.current` : ce que
        // `deleteEventFiles` considère encore présent. `deleteOne` échoue une
        // fois sur "b", puis réussit — et échouerait AUSSI sur "a" si on le
        // rappelait dessus, pour que ce test échoue franchement si la
        // reprise redemande sa suppression au lieu de la sauter.
        // Vide au départ : le lot commence dans l'état "deleted" (déjà
        // supprimé), `undo()` le remet en vie via `restore` juste en dessous.
        let liveRecords: { id: string; readOnly?: boolean }[] = [];
        let bAttempts = 0;
        const deleteOne = jest.fn(async (record: { id: string }) => {
            if (record.id === "a") return; // toujours permis, jamais retenté ici
            bAttempts += 1;
            if (record.id === "b" && bAttempts === 1) {
                throw new Error("verrouillé");
            }
        });
        const remove = async (records: readonly { id: string; readOnly?: boolean }[]) => {
            const present = new Set(liveRecords.map((r) => r.id));
            const pending = pendingDeletions(records, present);
            await deleteReentrant(pending, deleteOne, (id) => {
                liveRecords = liveRecords.filter((r) => r.id !== id);
            });
        };
        const restore = jest.fn(async (records: readonly { id: string }[]) => {
            liveRecords = [...liveRecords, ...records];
        });

        const container = document.createElement("div");
        document.body.appendChild(container);
        let history!: ReturnType<
            typeof useDeletionHistory<{ id: string; readOnly?: boolean }>
        >;
        function Harness() {
            history = useDeletionHistory({ restore, remove });
            return null;
        }
        act(() => {
            ReactDOM.render(React.createElement(Harness), container);
        });

        // Point de départ : le lot est "restauré" (canRedo), comme après un
        // Annuler réussi.
        act(() => {
            history.rememberDeleted(two);
        });
        await act(async () => {
            await history.undo();
        });
        expect(history.canRedo).toBe(true);

        // Premier Rétablir : "a" part, "b" échoue.
        await act(async () => {
            await expect(history.redo()).rejects.toThrow("verrouillé");
        });
        expect(history.canRedo).toBe(true);
        expect(liveRecords.map((r) => r.id)).toEqual(["b"]);

        // Second Rétablir : ne doit retenter QUE "b".
        await act(async () => {
            await history.redo();
        });
        expect(history.canRedo).toBe(false);
        expect(history.canUndo).toBe(true);
        expect(liveRecords).toEqual([]);
        expect(deleteOne).toHaveBeenCalledTimes(3); // "a" une fois, "b" deux fois
        expect(
            deleteOne.mock.calls.filter(([r]) => r.id === "a")
        ).toHaveLength(1);

        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });

    it("un lot entièrement déjà absent est un succès immédiat, pas une erreur", async () => {
        const pending = pendingDeletions(two, new Set());
        expect(pending).toEqual([]);

        const deleteOne = jest.fn();
        await expect(
            deleteReentrant(pending, deleteOne, jest.fn())
        ).resolves.toBeUndefined();
        expect(deleteOne).not.toHaveBeenCalled();
    });

    it("comportement nominal inchangé : tout le lot est présent, tout est supprimé", async () => {
        let liveRecords = [...two];
        const deleteOne = jest.fn(async () => {});
        const present = new Set(liveRecords.map((r) => r.id));
        const pending = pendingDeletions(two, present);

        await deleteReentrant(pending, deleteOne, (id) => {
            liveRecords = liveRecords.filter((r) => r.id !== id);
        });

        expect(deleteOne).toHaveBeenCalledTimes(2);
        expect(liveRecords).toEqual([]);
    });
});
