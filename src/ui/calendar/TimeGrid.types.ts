import { DisplayEvent } from "../types";

/** Cadre d'atterrissage affiche pendant un drag. Partage par le drag interne
    de la grille et par le drag venu du panneau. */
export interface DragPreview {
    dayKey: string;
    event: DisplayEvent;
    newStart: Date;
    newEnd: Date;
}

/** New bounds of the draft after dragging one of its resize handles.
 *
 *  Named fields on purpose: the callback used to take two positional dates and
 *  one consumer read the first one as the END, so dragging the bottom handle
 *  assigned start to end and the draft collapsed to zero length. With an object
 *  a mismatched consumer no longer compiles. */
export interface DraftRange {
    start: Date;
    end: Date;
}

/**
 * Un trait d'horaire de prière, posé dans la grille comme la ligne de l'heure
 * qu'il est.
 *
 * Aucun évènement, aucun fichier : un horaire de prière n'est pas quelque chose
 * qu'on déplace ou qu'on annote, c'est une heure de la journée. Le trait la
 * montre et n'occupe pas la place d'un rendez-vous.
 */
export interface PrayerLine {
    /** Le jour où il se pose — la prochaine prière peut être le Fajr de demain. */
    date: Date;
    /** L'heure, en heures décimales, pour suivre le zoom comme le reste. */
    hours: number;
    /** Celui de la prochaine prière : plein, quand les autres sont estompés. */
    next: boolean;
}

export interface TimeGridProps {
    dates: Date[];
    events: DisplayEvent[];
    timeFormat24h: boolean;
    /** Les traits d'horaires de prière à poser, s'il y en a. */
    prayerLines?: PrayerLine[];
    /** La couleur du calendrier auquel ils appartiennent : ce sont ses traits,
     *  ils suivent sa couleur et disparaissent avec lui. */
    prayerColor?: string;
    /** Let the day grid come to rest between two days instead of on whole ones. */
    freeScroll?: boolean;
    secondaryTimezones?: string[];
    onAddTimezone?: (tz: string) => void;
    onRemoveTimezone?: (tz: string) => void;
    allDayCollapsed?: boolean;
    onToggleAllDayCollapsed?: () => void;
    onEventClick: (eventId: string) => void;
    onEventDrag: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>;
    onEventResize: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    allDayEvents?: DisplayEvent[];
    onEmptyContextMenu?: (date: Date, mouseEvent: MouseEvent) => void;
    draftSlot?: { start: Date; end: Date; allDay: boolean } | null;
    draftColor?: string;
    onResizeDraft?: (range: DraftRange) => void;
    onShiftDays?: (days: number) => void;
    contextLine?: { date: Date; top: number } | null;
    /** Cadre d'atterrissage pilote de l'exterieur (drag venu du panneau). */
    externalPreview?: DragPreview | null;
    /** Deplanifie un evenement depose sur le panneau (sens inverse du drag
        panneau -> grille). Absent = le panneau n'est pas cible de depot. */
    onEventUnschedule?: (eventId: string) => Promise<boolean>;
}

export interface ResizeState {
    eventId: string;
    startY: number;
    /** Which edge is being dragged: "top" moves the start, "bottom" the end. */
    edge: "top" | "bottom";
    originalStart: Date;
    originalEnd: Date;
    dayDate: Date;
}

export interface SelectionState {
    startDate: Date;
    endDate: Date;
    dayIndex: number;
}
