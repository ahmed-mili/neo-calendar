import { useCallback, useMemo, useRef, useState } from "react";

export interface UseDeletionHistoryOptions<T> {
    /** Réécrit le lot passé ; rejette si l'écriture échoue, pour que le hook
        ne prétende jamais un succès qui n'a pas eu lieu. */
    restore: (records: readonly T[]) => Promise<void>;
    /** Supprime le lot passé ; mêmes règles de rejet que `restore`. */
    remove: (records: readonly T[]) => Promise<void>;
}

export interface UseDeletionHistory<T> {
    /** À appeler uniquement après une suppression réussie : c'est ce lot que
        l'Annuler restaurera. Un nouveau lot remplace le précédent et efface
        tout Rétablir en attente. */
    rememberDeleted: (records: readonly T[]) => void;
    /** Réécrit le dernier lot supprimé. Rejette si `restore` rejette, et
        laisse alors l'opération réessayable. */
    undo: () => Promise<void>;
    /** Supprime à nouveau le lot qu'Annuler venait de restaurer. Rejette si
        `remove` rejette, et laisse alors l'opération réessayable. */
    redo: () => Promise<void>;
    /** Efface un Rétablir en attente sans y toucher autrement — pour la note
        qui a changé depuis Annuler, ou une mutation externe du lot restauré. */
    invalidateRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    /** Une écriture est en cours : un second appel pendant celle-ci ne
        relance rien. */
    busy: boolean;
}

type HistoryState<T> =
    | { kind: "idle" }
    | { kind: "deleted"; records: readonly T[] }
    | { kind: "restored"; records: readonly T[] };

/**
 * Historique de suppression à un seul niveau : un Annuler, un Rétablir, pas
 * de pile. `rememberDeleted` retient le lot ; `undo` le restaure ; `redo` le
 * supprime à nouveau. Chaque nouveau lot remplace l'ancien.
 */
export function useDeletionHistory<T>(
    options: UseDeletionHistoryOptions<T>
): UseDeletionHistory<T> {
    const [state, setState] = useState<HistoryState<T>>({ kind: "idle" });
    const [busy, setBusy] = useState(false);
    // `busy` en state redéclenche un rendu ; cette ref, lue de façon
    // synchrone, empêche un second appel pendant une promesse pendante avant
    // même que ce rendu n'ait eu lieu.
    const busyRef = useRef(false);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const rememberDeleted = useCallback((records: readonly T[]) => {
        setState({ kind: "deleted", records });
    }, []);

    const invalidateRedo = useCallback(() => {
        setState((current) =>
            current.kind === "restored" ? { kind: "idle" } : current
        );
    }, []);

    const undo = useCallback(async () => {
        if (busyRef.current) return;
        if (state.kind !== "deleted") return;
        const records = state.records;
        busyRef.current = true;
        setBusy(true);
        try {
            await optionsRef.current.restore(records);
            setState({ kind: "restored", records });
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [state]);

    const redo = useCallback(async () => {
        if (busyRef.current) return;
        if (state.kind !== "restored") return;
        const records = state.records;
        busyRef.current = true;
        setBusy(true);
        try {
            await optionsRef.current.remove(records);
            setState({ kind: "deleted", records });
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [state]);

    const canUndo = state.kind === "deleted";
    const canRedo = state.kind === "restored";

    // Une identité stable tant que rien n'a changé : sinon tout effet qui la
    // prend en dépendance (le routeur clavier, par exemple) se ré-abonnerait
    // à chaque rendu.
    return useMemo(
        () => ({
            rememberDeleted,
            undo,
            redo,
            invalidateRedo,
            canUndo,
            canRedo,
            busy,
        }),
        [rememberDeleted, undo, redo, invalidateRedo, canUndo, canRedo, busy]
    );
}
