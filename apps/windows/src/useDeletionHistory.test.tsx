/** @jest-environment jsdom */
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import React from "react";
import { useDeletionHistory } from "./useDeletionHistory";

interface Record {
    id: string;
    calendarId: string;
    calendarPath: string;
    relativePath: string;
    fileName: string;
    contents: string;
}

const record = (overrides: Partial<Record> = {}): Record => ({
    id: "r1",
    calendarId: "cal",
    calendarPath: "Études",
    relativePath: "Études/note.md",
    fileName: "note.md",
    contents: "---\ntitle: Note\n---\n",
    ...overrides,
});

/** Monte le hook dans un vrai arbre React, pour tester `busy` pendant une
    vraie promesse pendante plutôt qu'un mock synchrone. */
function mountHistory(
    restore: jest.Mock,
    remove: jest.Mock
): {
    history: ReturnType<typeof useDeletionHistory<Record>>;
    unmount: () => void;
} {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let latest!: ReturnType<typeof useDeletionHistory<Record>>;
    function Harness() {
        latest = useDeletionHistory<Record>({ restore, remove });
        return null;
    }
    act(() => {
        ReactDOM.render(<Harness />, container);
    });
    return {
        get history() {
            return latest;
        },
        unmount: () => {
            act(() => {
                ReactDOM.unmountComponentAtNode(container);
            });
            container.remove();
        },
    } as unknown as {
        history: ReturnType<typeof useDeletionHistory<Record>>;
        unmount: () => void;
    };
}

describe("useDeletionHistory", () => {
    test("un lot annoncé peut être annulé puis rétabli", async () => {
        const restore = jest.fn().mockResolvedValue(undefined);
        const remove = jest.fn().mockResolvedValue(undefined);
        const harness = mountHistory(restore, remove);
        const target = record();

        act(() => {
            harness.history.rememberDeleted([target]);
        });
        expect(harness.history.canUndo).toBe(true);
        expect(harness.history.canRedo).toBe(false);

        await act(async () => {
            await harness.history.undo();
        });
        expect(restore).toHaveBeenCalledWith([target]);
        expect(harness.history.canUndo).toBe(false);
        expect(harness.history.canRedo).toBe(true);

        await act(async () => {
            await harness.history.redo();
        });
        expect(remove).toHaveBeenCalledWith([target]);
        expect(harness.history.canUndo).toBe(true);
        expect(harness.history.canRedo).toBe(false);

        harness.unmount();
    });

    test("rien à annuler tant qu'aucune suppression n'a été retenue", () => {
        const harness = mountHistory(jest.fn(), jest.fn());
        expect(harness.history.canUndo).toBe(false);
        expect(harness.history.canRedo).toBe(false);
        harness.unmount();
    });

    test("un restore en échec laisse l'opération réessayable", async () => {
        const restore = jest
            .fn()
            .mockRejectedValueOnce(new Error("disque plein"))
            .mockResolvedValueOnce(undefined);
        const remove = jest.fn().mockResolvedValue(undefined);
        const harness = mountHistory(restore, remove);
        const target = record();

        act(() => {
            harness.history.rememberDeleted([target]);
        });

        await act(async () => {
            await expect(harness.history.undo()).rejects.toThrow(
                "disque plein"
            );
        });
        // Le lot n'a pas été consommé par la tentative ratée : encore annulable.
        expect(harness.history.canUndo).toBe(true);
        expect(harness.history.canRedo).toBe(false);
        expect(harness.history.busy).toBe(false);

        await act(async () => {
            await harness.history.undo();
        });
        expect(restore).toHaveBeenCalledTimes(2);
        expect(harness.history.canRedo).toBe(true);

        harness.unmount();
    });

    test("un remove en échec pendant redo laisse l'opération réessayable", async () => {
        const restore = jest.fn().mockResolvedValue(undefined);
        const remove = jest
            .fn()
            .mockRejectedValueOnce(new Error("verrouillé"))
            .mockResolvedValueOnce(undefined);
        const harness = mountHistory(restore, remove);
        const target = record();

        act(() => {
            harness.history.rememberDeleted([target]);
        });
        await act(async () => {
            await harness.history.undo();
        });

        await act(async () => {
            await expect(harness.history.redo()).rejects.toThrow("verrouillé");
        });
        expect(harness.history.canRedo).toBe(true);
        expect(harness.history.busy).toBe(false);

        await act(async () => {
            await harness.history.redo();
        });
        expect(remove).toHaveBeenCalledTimes(2);
        expect(harness.history.canUndo).toBe(true);

        harness.unmount();
    });

    test("un double appel pendant une promesse pendante ne relance pas d'écriture", async () => {
        let resolveRestore: (() => void) | null = null;
        const restore = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveRestore = resolve;
                })
        );
        const remove = jest.fn().mockResolvedValue(undefined);
        const harness = mountHistory(restore, remove);
        const target = record();

        act(() => {
            harness.history.rememberDeleted([target]);
        });

        let firstCall: Promise<void> | null = null;
        let secondCall: Promise<void> | null = null;
        act(() => {
            firstCall = harness.history.undo();
            secondCall = harness.history.undo();
        });
        expect(harness.history.busy).toBe(true);
        expect(restore).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveRestore?.();
            await firstCall;
            await secondCall;
        });
        expect(restore).toHaveBeenCalledTimes(1);
        expect(harness.history.busy).toBe(false);

        harness.unmount();
    });

    test("un nouveau lot supprimé invalide le rétablissement en attente", async () => {
        const restore = jest.fn().mockResolvedValue(undefined);
        const remove = jest.fn().mockResolvedValue(undefined);
        const harness = mountHistory(restore, remove);
        const first = record({ id: "a" });
        const second = record({ id: "b" });

        act(() => {
            harness.history.rememberDeleted([first]);
        });
        await act(async () => {
            await harness.history.undo();
        });
        expect(harness.history.canRedo).toBe(true);

        act(() => {
            harness.history.rememberDeleted([second]);
        });
        expect(harness.history.canRedo).toBe(false);
        expect(harness.history.canUndo).toBe(true);

        await act(async () => {
            await harness.history.undo();
        });
        expect(restore).toHaveBeenLastCalledWith([second]);

        harness.unmount();
    });

    test("invalidateRedo efface un rétablissement en attente sans y toucher autrement", async () => {
        const restore = jest.fn().mockResolvedValue(undefined);
        const remove = jest.fn().mockResolvedValue(undefined);
        const harness = mountHistory(restore, remove);
        const target = record();

        act(() => {
            harness.history.rememberDeleted([target]);
        });
        await act(async () => {
            await harness.history.undo();
        });
        expect(harness.history.canRedo).toBe(true);

        act(() => {
            harness.history.invalidateRedo();
        });
        expect(harness.history.canRedo).toBe(false);
        expect(harness.history.canUndo).toBe(false);

        harness.unmount();
    });

    test("une restauration partielle ratée peut être reprise sans doublon", async () => {
        // `restore` reçoit toujours le lot ENTIER : c'est à `restoreDeletedRecords`
        // (Step 3) de savoir reprendre sans doublon en interne. Le hook, lui,
        // ne doit rien avoir écrit deux fois côté état si le premier essai a
        // échoué à mi-chemin.
        const restore = jest
            .fn()
            .mockRejectedValueOnce(new Error("moitié écrite"))
            .mockResolvedValueOnce(undefined);
        const remove = jest.fn().mockResolvedValue(undefined);
        const harness = mountHistory(restore, remove);
        const batch = [record({ id: "a" }), record({ id: "b" })];

        act(() => {
            harness.history.rememberDeleted(batch);
        });
        await act(async () => {
            await expect(harness.history.undo()).rejects.toThrow();
        });

        await act(async () => {
            await harness.history.undo();
        });
        expect(restore).toHaveBeenNthCalledWith(1, batch);
        expect(restore).toHaveBeenNthCalledWith(2, batch);
        expect(restore).toHaveBeenCalledTimes(2);

        harness.unmount();
    });
});
