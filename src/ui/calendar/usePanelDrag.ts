import * as React from "react";
import { DisplayEvent } from "../types";
import { DropSlot, projectPanelDrop, readGridGeometry } from "./dragProjection";
import { panelTouchGestureOwner } from "./panelTouchGesture";
import {
    SCHEDULED_DROP_DURATION_MS,
    canScheduleByDrag,
} from "./eventScheduling";

/** Distance a parcourir avant qu'un appui devienne un drag. Meme valeur que
    l'activationConstraint du PointerSensor de la grille : au-dessous, le geste
    reste un clic et ouvre l'evenement. */
const DRAG_THRESHOLD_PX = 5;

/** Ou tomberait un lacher a l'instant present. `null` = nulle part de valide. */
export type PanelDropTarget = DropSlot | null;

export interface PanelDragState {
    event: DisplayEvent;
    /** Position du ghost en coordonnees viewport (coin haut gauche). */
    ghostX: number;
    ghostY: number;
    /** Largeur figee au demarrage, pour que le ghost garde la taille de la carte. */
    ghostWidth: number;
    target: PanelDropTarget;
}

interface Options {
    onDrop: (
        event: DisplayEvent,
        start: Date,
        end: Date,
        allDay: boolean
    ) => void;
    onTargetChange?: (
        event: DisplayEvent | null,
        target: PanelDropTarget
    ) => void;
}

/** Ou est la grille horaire dans le document. Le panneau est un frere de la
    vue, il n'a pas de ref vers elle ; le selecteur est la meme convention que
    celle deja utilisee dans useTimeGridDrag pour .nc-days-row et
    .nc-allday-row. */
const findGrid = () =>
    document.querySelector(".nc-timegrid-wrapper") as HTMLElement | null;

/** Lit la geometrie et delegue toute la decision a la couche pure. */
const projectTarget = (pointerX: number, pointerY: number): PanelDropTarget =>
    projectPanelDrop(
        readGridGeometry(findGrid()),
        pointerX,
        pointerY,
        SCHEDULED_DROP_DURATION_MS
    );

export function usePanelDrag({ onDrop, onTargetChange }: Options) {
    const [dragState, setDragState] = React.useState<PanelDragState | null>(
        null
    );
    // Le geste vit dans des refs : les handlers natifs sont poses une fois et
    // ne doivent pas dependre d'un state qui change a chaque pixel.
    const gesture = React.useRef<{
        event: DisplayEvent;
        pointerId: number;
        pointerType: string;
        originX: number;
        originY: number;
        offsetX: number;
        offsetY: number;
        width: number;
        armed: boolean;
        target: PanelDropTarget;
    } | null>(null);

    const notify = React.useCallback(
        (event: DisplayEvent | null, target: PanelDropTarget) => {
            onTargetChange?.(event, target);
        },
        [onTargetChange]
    );

    // La carte est un <button> : le navigateur emet un click au relachement,
    // qui ouvrirait l'evenement qu'on vient de deplacer ou d'annuler. Ce
    // drapeau, consomme par le onClick de la carte, avale ce clic-la. Il ne
    // peut pas etre un minuteur : sur le chemin Escape le geste est annule au
    // keydown, mais le clic n'arrive qu'au relachement du bouton, arbitrairement
    // plus tard. Il vit donc jusqu'au clic suivant, et un pointerdown le remet a
    // zero au cas ou aucun clic ne suivrait (pointercancel).
    const justDragged = React.useRef(false);

    const finish = React.useCallback(
        (commit: boolean) => {
            const g = gesture.current;
            gesture.current = null;
            setDragState(null);
            notify(null, null);
            if (!g || !g.armed) return;
            justDragged.current = true;
            if (commit && g.target) {
                onDrop(g.event, g.target.start, g.target.end, g.target.allDay);
            }
        },
        [notify, onDrop]
    );

    /** A appeler depuis le onClick de la carte : true quand ce clic est celui
        qui clot un drag, et doit donc etre ignore. */
    const consumeDragClick = React.useCallback(() => {
        const dragged = justDragged.current;
        justDragged.current = false;
        return dragged;
    }, []);

    const startDrag = React.useCallback(
        (e: React.PointerEvent, event: DisplayEvent) => {
            // Nouveau geste : le drapeau anti-clic d'un geste precedent n'a plus
            // de raison de vivre (un pointercancel a pu le laisser arme sans
            // qu'aucun clic ne vienne le consommer).
            justDragged.current = false;
            // Bouton principal seulement, et seulement une carte que ce geste a
            // le droit de planifier : glisser une serie ou un evenement deja
            // date detruirait ou mutilerait la note (voir canScheduleByDrag).
            // Une carte non eligible ne demarre aucun drag et garde son clic.
            if (e.button !== 0 || !canScheduleByDrag(event)) return;
            const card = e.currentTarget as HTMLElement;
            const rect = card.getBoundingClientRect();
            gesture.current = {
                event,
                pointerId: e.pointerId,
                pointerType: e.pointerType,
                originX: e.clientX,
                originY: e.clientY,
                // Offset de saisie conserve : le ghost ne se recentre pas sous
                // le curseur, il garde la prise de l'utilisateur (Notion).
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
                width: rect.width,
                armed: false,
                target: null,
            };
            card.setPointerCapture(e.pointerId);
        },
        []
    );

    React.useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const g = gesture.current;
            if (!g || e.pointerId !== g.pointerId) return;
            if (!g.armed) {
                const dx = e.clientX - g.originX;
                const dy = e.clientY - g.originY;
                // Touch gestures have three owners: vertical motion scrolls
                // the list, rightward motion closes the panel, and only a
                // leftward horizontal motion drags an event onto the grid.
                // Mouse/pen behavior is unchanged.
                if (
                    g.pointerType === "touch" &&
                    panelTouchGestureOwner(dx, dy) !== "event-drag"
                ) {
                    gesture.current = null;
                    return;
                }
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                g.armed = true;
            }
            g.target = projectTarget(e.clientX, e.clientY);
            notify(g.event, g.target);
            setDragState({
                event: g.event,
                ghostX: e.clientX - g.offsetX,
                ghostY: e.clientY - g.offsetY,
                ghostWidth: g.width,
                target: g.target,
            });
        };
        const onUp = (e: PointerEvent) => {
            if (!gesture.current || e.pointerId !== gesture.current.pointerId)
                return;
            finish(true);
        };
        const onCancel = () => finish(false);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && gesture.current) finish(false);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onCancel);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onCancel);
            document.removeEventListener("keydown", onKey);
        };
    }, [finish, notify]);

    return { dragState, startDrag, consumeDragClick };
}
