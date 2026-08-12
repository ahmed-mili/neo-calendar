import { DateTime } from "luxon";
import { NeoEvent, KEYS_DROPPED_WHEN_ABSENT } from "../../types";
import { DisplayEvent } from "../types";

/** Duree du bloc cree quand un evenement non planifie est depose sur la
    grille. Meme valeur que ALLDAY_DRAG_DURATION_MS (useTimeGridDrag), et meme
    valeur que Notion. */
export const SCHEDULED_DROP_DURATION_MS = 30 * 60 * 1000;

/** Quand un evenement change de type, le payload reconstruit ne porte plus les
    champs de l'ancien type. Fusionner ce payload par-dessus l'evenement
    d'origine ferait survivre les champs perimes (une date sur un someday, par
    exemple), laissant la note contradictoire. On retire donc les cles
    discriminantes de la base avant la fusion ; le writer de frontmatter
    supprime ensuite les lignes correspondantes. Le jeu de cles vient du schema,
    source de verite unique partagee avec FullNoteCalendar. La liste des
    sous-taches suit la meme regle : quand le formulaire n'en porte plus aucune,
    c'est que la derniere a ete supprimee, et la base ne doit pas les ressusciter
    par la fusion. */
export function mergeForSave(base: NeoEvent, payload: NeoEvent): NeoEvent {
    const stripped = { ...base } as Record<string, unknown>;
    for (const key of KEYS_DROPPED_WHEN_ABSENT) delete stripped[key];
    const merged = { ...stripped, ...payload } as Record<string, unknown>;
    // Invariant : un evenement all-day ne porte AUCUNE heure. Le payload
    // all-day omet startTime/endTime, mais la fusion les rapporterait depuis la
    // base ; le garde all-day du writer ne supprime qu'une ligne encore
    // presente, pas une ligne que cette fusion vient de re-ajouter.
    if (merged.allDay === true) {
        delete merged.startTime;
        delete merged.endTime;
    }
    return merged as NeoEvent;
}

const toISODate = (d: Date) => DateTime.fromJSDate(d).toISODate();

const toISOTime = (d: Date) =>
    DateTime.fromJSDate(d).toISOTime({
        includeOffset: false,
        suppressMilliseconds: true,
        suppressSeconds: true,
        includePrefix: false,
    });

/** `completed` est une cle discriminante : `mergeForSave` la retire de la base,
    donc un payload qui l'omet supprime la ligne de frontmatter d'une vraie
    tache. Mais `isTask` est derive de la seule PRESENCE de la cle : la reporter
    a `false` sur un evenement ordinaire le transformerait en tache "to do". On
    ne la reporte donc que si la base la portait, valeur inchangee. */
const carryCompleted = (base: NeoEvent): Record<string, unknown> => {
    const completed = (base as Record<string, unknown>).completed;
    return completed !== undefined ? { completed } : {};
};

/** Payload qui donne une date (et eventuellement des heures) a un evenement.
    Utilise pour un someday depose sur la grille ; le champ `completed` de la
    base est conserve, c'est aussi une cle du type `single`. */
export function buildScheduledPayload(
    base: NeoEvent,
    start: Date,
    end: Date,
    allDay: boolean
): NeoEvent {
    const date = toISODate(start);
    const timed = allDay
        ? { allDay: true as const }
        : {
              allDay: false as const,
              startTime: toISOTime(start) ?? "",
              endTime: toISOTime(end) ?? "",
          };
    return {
        ...(base as Record<string, unknown>),
        ...timed,
        type: "single",
        date,
        // Un evenement d'un seul jour n'a pas de endDate. Ecrire null plutot
        // que d'omettre la cle : la persistance fusionne, une valeur perimee
        // survivrait et donnerait une fin avant le debut.
        endDate: null,
        ...carryCompleted(base),
    } as unknown as NeoEvent;
}

/** Payload qui retire la date et les heures : l'evenement redevient someday. */
export function buildUnscheduledPayload(base: NeoEvent): NeoEvent {
    const out = { ...(base as Record<string, unknown>) };
    delete out.date;
    delete out.endDate;
    delete out.startTime;
    delete out.endTime;
    return {
        ...out,
        type: "someday",
        // Un someday est sans heure : le schema force allDay a true.
        allDay: true,
        ...carryCompleted(base),
    } as unknown as NeoEvent;
}

/** Seuls les evenements uniques deja planifies peuvent etre deplanifies par un
    glisser. Deplanifier un recurrent ou une rrule detruirait la serie entiere,
    ce qu'un geste de souris ne doit jamais faire. */
export function canUnschedule(base: NeoEvent): boolean {
    return (base as Record<string, unknown>).type === "single";
}

/** Reciproque de `canUnschedule` : seule une carte NON planifiee du panneau
    peut recevoir une date par un glisser, et seulement sur un calendrier
    editable. Le panneau liste tous les evenements du calendrier, occurrences de
    series comprises ; glisser l'une d'elles remplacerait la note de la serie par
    un evenement unique (rrule, daysOfWeek, skipDates perdus), et glisser un
    evenement deja date le tronquerait a la duree de depot ou l'effondrerait sur
    un seul jour. Un geste de 6 px ne doit jamais faire ca. */
export function canScheduleByDrag(event: DisplayEvent): boolean {
    return event.isSomeday && event.editable;
}
