import { useEffect, useState } from "react";

/** Une heure : assez fin pour qu'un horizon de trente jours glisse sans qu'on
    le remarque, assez large pour ne rien recalculer pour rien. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * Un nombre qui change toutes les heures, a mettre dans les dependances de ce
 * qui lit l'heure courante sans que React puisse le savoir.
 *
 * `reminderEvents` ecrit `new Date()` dans un `useMemo` dont les dependances
 * sont des evenements : son maintenant est donc fige au dernier changement de
 * calendrier. C'etait sans consequence tant qu'on fermait l'application le
 * soir. Elle reside desormais dans la zone de notification, et sans ce
 * compteur son horizon cesse d'avancer : les evenements qui y entrent jour
 * apres jour n'auraient plus de rappel.
 */
export function useHourlyEpoch(): number {
    const [epoch, setEpoch] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(
            () => setEpoch((count) => count + 1),
            HOUR_MS
        );
        return () => window.clearInterval(timer);
    }, []);

    return epoch;
}
