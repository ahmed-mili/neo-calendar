import { useState, useCallback, useMemo, useRef } from "react";
import {
    DragStartEvent,
    DragMoveEvent,
    DragEndEvent,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { isMultiDayTimed } from "./CalendarUtils";
import { DisplayEvent } from "../types";
import {
    readGridGeometry,
    isOverPanel as overPanel,
    projectGridDrag,
    gridDragDayShift,
    dayPositionUnderPointer,
    DayPosition,
} from "./dragProjection";

/** Un evenement n'est deplanifiable que s'il est unique et editable : une
    serie (recurring, rrule) perdrait toutes ses occurrences, et une
    continuation de lendemain n'est pas une vraie source. Le panneau ne
    s'allume donc pas pour eux. */
const canDropOnPanel = (event: DisplayEvent): boolean =>
    event.editable && !event.isRecurring && !event.isSomeday;

// Le pointeur au moment courant du drag = là où il a saisi, plus ce qu'il a
// parcouru. Seule source de vérité pour « où a-t-on lâché », insensible à la
// boîte mal mesurée de l'élément déplacé (une barre all-day peut annoncer la
// hauteur de toute la grille).
//
// Les coordonnées de la saisie sont lues par `getEventCoordinates`, et pas sur
// l'événement lui-même : un `TouchEvent` ne porte pas de `clientX`, il le range
// dans `touches[0]`. Le téléphone n'avait donc AUCUN pointeur — tout ce qui se
// lit sous le doigt (la colonne survolée, la bande all-day, le panneau) était
// mort là-bas, et le jour visé ne pouvait venir que du delta en pixels.
function pointerFrom(
    activatorEvent: Event | null,
    delta: { x: number; y: number }
): { x: number | null; y: number | null } {
    const at = activatorEvent ? getEventCoordinates(activatorEvent) : null;
    if (!at) return { x: null, y: null };
    return { x: at.x + delta.x, y: at.y + delta.y };
}

export function useTimeGridDrag(
    onEventDrag: (
        eventId: string,
        newStart: Date,
        newEnd: Date,
        allDay?: boolean
    ) => Promise<boolean>,
    gridRef: React.RefObject<HTMLDivElement | null>,
    /** Returns the current multi-selection (events flagged `selected`). When the
        dragged event is part of it, the same drag delta is applied to all of
        them so the whole group moves together. */
    getDragGroup?: () => DisplayEvent[],
    onEventUnschedule?: (eventId: string) => Promise<boolean>
) {
    const [activeEvent, setActiveEvent] = useState<DisplayEvent | null>(null);
    type Preview = {
        event: DisplayEvent;
        newStart: Date;
        newEnd: Date;
        dayKey: string;
    };
    const [dragPreview, setDragPreview] = useState<Preview | null>(null);
    // Drop-previews for EVERY event being moved (the dragged one + the rest of
    // the multi-selection), so the blue landing frame shows for all of them.
    const [dragPreviews, setDragPreviews] = useState<Preview[]>([]);
    const [dragWidth, setDragWidth] = useState<number>(0);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            // Souris : le drag part des qu'on a franchi 5 px, sans attente.
            activationConstraint: { distance: 5 },
        }),
        useSensor(TouchSensor, {
            // Doigt : appui long, PAS distance — configuration recommandee par
            // dnd-kit quand le meme element doit servir au scroll ET au drag.
            // Une contrainte en distance y cohabite mal : le navigateur decide
            // que le geste est un scroll et emet `pointercancel`, si bien que le
            // drag ne s'arme jamais et que le glissement se termine en `click`
            // (l'evenement s'ouvre au lieu de bouger). Avec un delai, dnd-kit
            // garde la main si le doigt reste pose et rend le geste au scroll
            // natif s'il bouge avant.
            //
            // A VALIDER SUR APPAREIL REEL : l'injection d'entrees par CDP ne
            // traverse pas le pipeline d'entree d'Electron (verifie : une
            // molette synthetisee ne scrolle pas non plus, alors qu'affecter
            // scrollTop fonctionne), donc ni ce comportement ni le precedent
            // n'ont pu etre observes de bout en bout ici.
            activationConstraint: { delay: 220, tolerance: 8 },
        })
    );

    /** Où le geste a commencé, mesuré en jours, et où la grille en était. Les
        deux sont relevés au moment de la saisie et lus jusqu'au lâcher. */
    const anchorRef = useRef<DayPosition | null>(null);
    const scrollOriginRef = useRef<{ left: number; top: number } | null>(null);

    // La geometrie est relue a chaque appel : la grille scrolle pendant le drag.
    const geometry = useCallback(
        () => readGridGeometry(gridRef.current),
        [gridRef]
    );

    const scroller = useCallback(
        () =>
            (gridRef.current?.querySelector(
                ".nc-main-scroller"
            ) as HTMLElement | null) ?? null,
        [gridRef]
    );

    /**
     * Où le doigt est VRAIMENT, à l'écran.
     *
     * dnd-kit ajoute à son delta le défilement survenu depuis le début du geste,
     * pour que l'élément déplacé — qui vit dans la grille et part avec elle —
     * reste sous le doigt. C'est ce qu'il faut à l'écran et l'inverse de ce
     * qu'il faut ici : ajouté au point de saisie, ce delta-là désigne un point
     * que le doigt n'a jamais visité, d'autant plus loin que la grille a tourné
     * de pages. C'est pour cette raison que l'auto-défilement de dnd-kit avait
     * été coupé : l'événement atterrissait à 00:00, très loin du pointeur.
     *
     * On le retranche donc, mesuré sur le même défileur et de la même façon —
     * une différence de `scrollLeft` — si bien que le re-basage des dates, qui
     * fausse les deux, s'annule entre les deux.
     */
    const viewportPointer = useCallback(
        (
            activatorEvent: Event | null,
            delta: { x: number; y: number }
        ): { x: number | null; y: number | null } => {
            const el = scroller();
            const origin = scrollOriginRef.current;
            if (!el || !origin) return pointerFrom(activatorEvent, delta);
            return pointerFrom(activatorEvent, {
                x: delta.x - (el.scrollLeft - origin.left),
                y: delta.y - (el.scrollTop - origin.top),
            });
        },
        [scroller]
    );

    // Meme definition que celle utilisee par le drag venu du panneau : les deux
    // sens du drag partagent le rect du panneau au lieu de s'accorder par
    // convention.
    const isOverPanel = useCallback(
        (pointerX: number | null, pointerY: number | null) =>
            overPanel(geometry(), pointerX, pointerY),
        [geometry]
    );

    // Projection unique, partagee par l'apercu en direct ET par l'ecriture au
    // lacher : ce qu'on voit est ce qu'on obtient. Toute la regle vit dans
    // projectGridDrag, la couche pure et testee.
    const projectDrag = useCallback(
        (
            ev: DisplayEvent,
            delta: { x: number; y: number },
            pointerX: number | null,
            pointerY: number | null,
            dayShift?: number
        ): { newStart: Date; newEnd: Date; allDay: boolean } => {
            const slot = projectGridDrag(
                geometry(),
                ev,
                delta,
                pointerX,
                pointerY,
                { dayShift, anchor: anchorRef.current }
            );
            return {
                newStart: slot.start,
                newEnd: slot.end,
                allDay: slot.allDay,
            };
        },
        [geometry]
    );

    /** Les evenements a deplacer ensemble, et le decalage de jours a leur
        appliquer. Les membres d'une multi-selection n'ont PAS ete attrapes : ils
        partagent le pointeur de l'evenement saisi, et lire la colonne sous ce
        pointeur pour chacun les ferait tous atterrir empiles sur un seul jour.
        On calcule donc le decalage UNE fois, sur l'evenement saisi, et on
        l'impose a tout le groupe. */
    const dragTargets = useCallback(
        (
            grabbed: DisplayEvent,
            delta: { x: number; y: number },
            pointerX: number | null
        ): { members: DisplayEvent[]; shift: number | undefined } => {
            const group = getDragGroup?.() ?? [];
            const inGroup =
                group.some((e) => e.id === grabbed.id) && group.length > 1;
            if (!inGroup) return { members: [grabbed], shift: undefined };
            return {
                members: group,
                shift: gridDragDayShift(
                    geometry(),
                    grabbed,
                    delta,
                    pointerX,
                    anchorRef.current
                ),
            };
        },
        [getDragGroup, geometry]
    );

    // Build a drop-preview frame for one event from the shared projection. The
    // preview's allDay flag decides WHERE it renders: an all-day frame in the
    // band, or a timed block in a day column — matching exactly where it lands.
    const buildPreview = useCallback(
        (
            ev: DisplayEvent,
            delta: { x: number; y: number },
            pointerX: number | null,
            pointerY: number | null,
            dayShift?: number
        ): Preview => {
            const { newStart, newEnd, allDay } = projectDrag(
                ev,
                delta,
                pointerX,
                pointerY,
                dayShift
            );
            return {
                event: ev.allDay === allDay ? ev : { ...ev, allDay },
                newStart,
                newEnd,
                dayKey: newStart.toDateString(),
            };
        },
        [projectDrag]
    );

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            const displayEvent = event.active.data.current
                ?.event as DisplayEvent;
            setActiveEvent(displayEvent || null);
            // Dit à la grille qu'elle n'est plus ce que le doigt déplace. Posé
            // en direct comme la classe du panneau plus bas : le défilement
            // tactile vit hors de React et lit l'élément, pas un state.
            if (gridRef.current) gridRef.current.dataset.ncDragging = "true";
            // D'où la grille part : tout ce qui suit se mesure par rapport à
            // ces deux nombres, et le glissement au bord les fera bouger.
            const el = scroller();
            scrollOriginRef.current = el
                ? { left: el.scrollLeft, top: el.scrollTop }
                : null;
            const rect = event.active.rect.current.initial;
            if (rect) {
                setDragWidth(rect.width);
            }
            if (displayEvent) {
                const { x: pointerX, y: pointerY } = pointerFrom(
                    event.activatorEvent,
                    { x: 0, y: 0 }
                );
                // La saisie, exprimée en jours : la colonne sous le doigt et
                // l'endroit de cette colonne. C'est à elle que tout le reste du
                // geste se compare, et elle est la seule mesure que le
                // défilement ne périme pas.
                anchorRef.current = dayPositionUnderPointer(
                    geometry(),
                    pointerX
                );
                setDragPreview(
                    buildPreview(
                        displayEvent,
                        { x: 0, y: 0 },
                        pointerX,
                        pointerY
                    )
                );
                const { members, shift } = dragTargets(
                    displayEvent,
                    { x: 0, y: 0 },
                    pointerX
                );
                setDragPreviews(
                    members.map((ev) =>
                        buildPreview(
                            ev,
                            { x: 0, y: 0 },
                            pointerX,
                            pointerY,
                            shift
                        )
                    )
                );
            }
        },
        [buildPreview, dragTargets, geometry, gridRef, scroller]
    );

    const handleDragMove = useCallback(
        (event: DragMoveEvent) => {
            const displayEvent = event.active.data.current
                ?.event as DisplayEvent;
            if (!displayEvent) return;
            const { x: pointerX, y: pointerY } = viewportPointer(
                event.activatorEvent,
                event.delta
            );

            // Signale le panneau comme cible de depot. Classe posee en direct
            // plutot que par un state : le panneau est hors de l'arbre React de
            // la grille, et un re-render par pixel serait du gaspillage.
            const panel = document.querySelector(
                ".nc-cep"
            ) as HTMLElement | null;
            panel?.classList.toggle(
                "nc-cep-drop-active",
                !!onEventUnschedule &&
                    canDropOnPanel(displayEvent) &&
                    isOverPanel(pointerX, pointerY)
            );

            const next = buildPreview(
                displayEvent,
                event.delta,
                pointerX,
                pointerY
            );
            setDragPreview((prev) => {
                if (
                    prev &&
                    prev.event.id === next.event.id &&
                    prev.event.allDay === next.event.allDay &&
                    prev.newStart.getTime() === next.newStart.getTime() &&
                    prev.newEnd.getTime() === next.newEnd.getTime()
                ) {
                    return prev;
                }
                return next;
            });

            // Project every group member by the same day shift for their previews.
            const { members, shift } = dragTargets(
                displayEvent,
                event.delta,
                pointerX
            );
            setDragPreviews(
                members.map((ev) =>
                    buildPreview(ev, event.delta, pointerX, pointerY, shift)
                )
            );
        },
        [
            buildPreview,
            dragTargets,
            onEventUnschedule,
            isOverPanel,
            viewportPointer,
        ]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            if (gridRef.current) delete gridRef.current.dataset.ncDragging;
            setActiveEvent(null);
            setDragPreview(null);
            setDragPreviews([]);
            setDragWidth(0);
            document
                .querySelector(".nc-cep")
                ?.classList.remove("nc-cep-drop-active");
            const displayEvent = event.active.data.current
                ?.event as DisplayEvent;
            if (!displayEvent) return;

            const { x: pointerX, y: pointerY } = viewportPointer(
                event.activatorEvent,
                event.delta
            );

            // Lacher sur le panneau : l'evenement perd sa date. Le panneau
            // absorbe le geste meme quand l'evenement n'est pas deplanifiable
            // (serie, non editable), sinon la projection de la grille
            // repartirait sur le dayOffset du delta et deplacerait l'evenement
            // de plusieurs jours vers la gauche.
            if (onEventUnschedule && isOverPanel(pointerX, pointerY)) {
                if (canDropOnPanel(displayEvent)) {
                    void onEventUnschedule(displayEvent.id);
                }
                return;
            }

            // Same projection the preview used, so the drop matches what was
            // shown. converting = the event changed type (all-day ↔ timed).
            const primary = projectDrag(
                displayEvent,
                event.delta,
                pointerX,
                pointerY
            );
            const converting = primary.allDay !== displayEvent.allDay;
            // A band-sourced event (all-day or multi-day timed) always collapses
            // to a 30-min event on drop, so it's never a no-op.
            const bandSourced =
                displayEvent.allDay || isMultiDayTimed(displayEvent);

            // No-op only when the shared projection lands the event exactly
            // where it already is. This has to be read off the projected result
            // rather than measured again on the raw delta: the projection snaps
            // to the nearest 15-min slot, so it already shows a one-slot move
            // half a slot in (7.5px at HOUR_HEIGHT=60). A separate threshold on
            // the raw delta disagreed with it between 7.5px and 15px and threw
            // away a move the preview was visibly committed to.
            if (
                !bandSourced &&
                !converting &&
                primary.newStart.getTime() === displayEvent.start.getTime() &&
                primary.newEnd.getTime() === displayEvent.end.getTime()
            ) {
                return;
            }

            // If the dragged event belongs to a multi-selection, move every
            // selected event by the same DAY SHIFT — read once off the grabbed
            // event, never re-read per member from the shared pointer.
            const { members, shift } = dragTargets(
                displayEvent,
                event.delta,
                pointerX
            );
            // Sequential to avoid concurrent cache writes racing each other.
            void (async () => {
                for (const ev of members) {
                    const { newStart, newEnd, allDay } = projectDrag(
                        ev,
                        event.delta,
                        pointerX,
                        pointerY,
                        shift
                    );
                    await onEventDrag(ev.id, newStart, newEnd, allDay);
                }
            })();
        },
        // computeDragProjection n'est plus une dependance : le garde-fou "no-op"
        // se lit desormais sur le resultat de projectDrag, pas sur le delta brut.
        [
            onEventDrag,
            onEventUnschedule,
            projectDrag,
            dragTargets,
            isOverPanel,
            gridRef,
            viewportPointer,
        ]
    );

    const handleDragCancel = useCallback(() => {
        if (gridRef.current) delete gridRef.current.dataset.ncDragging;
        setActiveEvent(null);
        setDragPreview(null);
        setDragPreviews([]);
        setDragWidth(0);
        document
            .querySelector(".nc-cep")
            ?.classList.remove("nc-cep-drop-active");
    }, [gridRef]);

    return {
        activeEvent,
        dragPreview,
        dragPreviews,
        dragWidth,
        sensors,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleDragCancel,
    };
}
