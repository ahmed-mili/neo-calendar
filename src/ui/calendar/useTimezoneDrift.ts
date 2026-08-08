import { useCallback, useEffect, useState } from "react";

import {
    acceptTimezoneChange,
    currentSystemTimezone,
    declineTimezoneChange,
    detectTimezoneDrift,
    holdShownTimezone,
} from "./timezoneDrift";

/** Ce que le calendrier retient d'un fuseau tranché. */
export interface TimezoneUpdate {
    /** Absent : la grille garde le fuseau qu'elle avait. */
    primaryTimezone?: string;
    lastSeenSystemTimezone: string;
}

interface UseTimezoneDriftOptions {
    /** Le fuseau de la colonne des heures, tel qu'il est réglé. */
    primaryTimezone?: string;
    /** Le fuseau système retenu au dernier passage. */
    lastSeenSystemTimezone?: string;
    /** Écrit le résultat dans les réglages, et redessine la grille. */
    onResolve: (update: TimezoneUpdate) => void;
}

/**
 * Surveille le fuseau du système et pose la question quand il a bougé.
 *
 * On regarde à l'ouverture, puis à chaque retour au premier plan : un vol se
 * passe précisément pendant que l'application dort, et c'est en la rouvrant à
 * l'arrivée que la question doit se poser.
 */
export function useTimezoneDrift({
    primaryTimezone,
    lastSeenSystemTimezone,
    onResolve,
}: UseTimezoneDriftOptions) {
    const [pending, setPending] = useState<{ from: string; to: string } | null>(
        null
    );

    const check = useCallback(() => {
        // Une question déjà posée attend sa réponse ; en reposer une par-dessus
        // ferait clignoter la grille entre deux fuseaux.
        if (pending) return;

        const drift = detectTimezoneDrift({
            systemZone: currentSystemTimezone(),
            primaryTimezone,
            lastSeenSystemTimezone,
        });

        if (drift.kind === "settled") return;

        if (drift.kind === "remember") {
            onResolve({ lastSeenSystemTimezone: drift.systemZone });
            return;
        }

        // Geler l'affichage avant de demander : la grille doit encore montrer
        // le fuseau que la personne connaît pendant qu'elle lit la question.
        onResolve(holdShownTimezone(drift));
        setPending({ from: drift.from, to: drift.to });
    }, [pending, primaryTimezone, lastSeenSystemTimezone, onResolve]);

    useEffect(() => {
        check();

        const onVisibility = () => {
            if (document.visibilityState === "visible") check();
        };

        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", check);

        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", check);
        };
    }, [check]);

    const accept = useCallback(() => {
        if (!pending) return;
        onResolve(acceptTimezoneChange(pending));
        setPending(null);
    }, [pending, onResolve]);

    const decline = useCallback(() => {
        if (!pending) return;
        onResolve(declineTimezoneChange(pending));
        setPending(null);
    }, [pending, onResolve]);

    return { pendingSystemZone: pending?.to ?? null, accept, decline };
}
