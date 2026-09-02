import * as React from "react";
import { useState, useRef, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { DisplayEvent } from "../types";
import { formatTime } from "./CalendarUtils";
import { readableTextColor, withAlpha } from "../../utils/color";
import { TaskCheckbox } from "./TaskCheckbox";
import { ChevronRightIcon } from "./Icons";
import { t } from "../i18n";
import { useIsSyncing } from "./SyncingFeeds";

interface EventBlockProps {
    event: DisplayEvent;
    style?: React.CSSProperties;
    onEventClick: (eventId: string, additive?: boolean) => void;
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    onResizeStart?: (
        eventId: string,
        startY: number,
        edge: "top" | "bottom"
    ) => void;
    isResizing?: boolean;
    previewStart?: Date;
    previewEnd?: Date;
    compact?: boolean;
    timeFormat24h?: boolean;
}

export default function EventBlock({
    event,
    style,
    onEventClick,
    onContextMenu,
    onToggleTask,
    onResizeStart,
    isResizing = false,
    previewStart,
    previewEnd,
    compact = false,
    timeFormat24h = false,
}: EventBlockProps) {
    const [isHovered, setIsHovered] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null);
    const didResizeRef = useRef(false);

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `event-${event.id}`,
        data: { event },
        disabled: !event.editable,
    });

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            onContextMenu(event.id, e.nativeEvent);
        },
        [event.id, onContextMenu]
    );

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (didResizeRef.current) {
                didResizeRef.current = false;
                return;
            }
            // Ctrl/Cmd+click toggles multi-selection instead of opening the
            // single-event panel.
            onEventClick(event.id, e.ctrlKey || e.metaKey);
        },
        [event.id, onEventClick]
    );

    const handleToggleTask = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            const nextDone = event.taskStatus !== "complete";
            onToggleTask(event.id, nextDone);
        },
        [event.id, event.taskStatus, onToggleTask]
    );

    const handleResizeMouseDown = useCallback(
        (e: React.MouseEvent, edge: "top" | "bottom") => {
            e.stopPropagation();
            e.preventDefault();
            didResizeRef.current = true;
            if (onResizeStart) {
                onResizeStart(event.id, e.clientY, edge);
            }
        },
        [event.id, onResizeStart]
    );

    const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
        // Prevent dnd-kit drag from starting when grabbing the resize handle
        e.stopPropagation();
    }, []);

    const isCompleted = event.isTask && event.taskStatus === "complete";

    const isPast = event.end.getTime() < Date.now();

    // While this event is being dragged, fade it in place to mark the origin
    // (Notion-style) — the snapped drop-preview shows where it will land.
    // Opacity is driven by the `.nc-dragging` CSS class.
    const dragStyle: React.CSSProperties = isDragging
        ? { pointerEvents: "none" }
        : {};

    const isSelected = !!event.selected;
    const tint = withAlpha(event.color, 0.15);
    // Selected: fill the whole block with its ribbon color, with a readable
    // text color picked from the background luminance.
    const eventColorBg = isSelected
        ? event.color
        : `linear-gradient(${tint}, ${tint}), var(--background-primary)`;
    const eventColorBorder = event.color;
    /*
     * L'encre du bloc rempli, passee en variable plutot qu'en `color`.
     * Le titre et l'heure fixent chacun leur couleur dans la feuille de style,
     * si bien qu'une couleur posee sur le bloc ne les atteignait jamais : le
     * nom restait dans le texte pale du theme, sur un fond qui pouvait etre
     * clair. Les deux regles lisent cette variable, avec le theme en repli.
     */
    const selectedTextColor = isSelected
        ? readableTextColor(event.color)
        : undefined;
    const inkVariables: Record<string, string> = selectedTextColor
        ? {
              "--nc-event-ink": selectedTextColor,
              "--nc-event-ink-muted": withAlpha(selectedTextColor, 0.75),
          }
        : {};
    const displayEnd = previewEnd ?? event.end;

    // Event blocks show the time RANGE (start – end), like Notion Calendar.
    // The end reflects a live resize via displayEnd/previewEnd; the start
    // likewise reflects a top-edge resize via previewStart. Continuations
    // (next-day part of a cross-midnight event) keep the original start time
    // via labelStart.
    const labelStart = previewStart ?? event.labelStart ?? event.start;

    // Use the inline (one-row) layout when there's little vertical room: either
    // a short event, OR one starting late enough that its visible portion
    // before midnight is small (e.g. a cross-midnight event at 23:20+, clipped
    // by the day's bottom edge). Based on the room ON THIS DAY, not the full
    // duration — a 23:30→01:45 event has only 30 min of room on its start day.
    const durationMin = (displayEnd.getTime() - event.start.getTime()) / 60000;
    const minutesToMidnight =
        24 * 60 - (event.start.getHours() * 60 + event.start.getMinutes());
    const onDayMinutes = Math.min(durationMin, minutesToMidnight);
    const isShort = !compact && !event.allDay && onDayMinutes <= 40;
    // Every event in the all-day band is a compact, single-line bar. Keeping
    // true all-day events out of this layout let their pre-wrapped title paint
    // the top of a second line below the bar.
    const inlineLayout = isShort || compact;

    // Ce que le lien a deja ecrit reste lisible pendant qu'il se rafraichit ;
    // le battement dit seulement que la reponse n'est pas encore arrivee. Rien
    // n'est retire de la grille en attendant : une case vide se lit comme une
    // journee libre, ce qu'elle n'est pas.
    const isSyncing = useIsSyncing(event.icsFeedId);

    return (
        <div
            ref={setNodeRef}
            className={`nc-event-block ${isDragging ? "nc-dragging" : ""} ${
                isCompleted ? "nc-task-completed" : ""
            } ${isHovered ? "nc-hovered" : ""} ${
                isPast ? "nc-past-event" : ""
            } ${isResizing ? "nc-resizing" : ""} ${
                isSelected ? "nc-selected" : ""
            } ${isSyncing ? "nc-event-syncing" : ""}`}
            style={
                {
                    background: eventColorBg,
                    // The calendar's colour, read by the strip down the left
                    // edge (see .nc-event-block::before). It is a variable and
                    // not a border because a border bends around the block's
                    // rounded corners and reads as a parenthesis.
                    "--nc-event-accent": eventColorBorder,
                    ...inkVariables,
                    color: selectedTextColor,
                    ...style,
                    ...dragStyle,
                } as React.CSSProperties
            }
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            data-event-id={event.id}
            data-calendar-id={event.calendarId}
            data-visibility-state={event.visibilityState}
            {...attributes}
            {...(event.editable ? listeners : {})}
        >
            <div className="nc-event-content">
                {event.isTask && (
                    <button
                        className="nc-task-checkbox"
                        onClick={handleToggleTask}
                    >
                        <TaskCheckbox completed={isCompleted} />
                    </button>
                )}
                {event.isSeriesStart && (
                    /* Deleting the first occurrences moves where the series
                       begins, so the one it begins on now says so. Worked out
                       at display time; nothing of it is written down. */
                    <span
                        className="nc-event-series-start"
                        title={t("Start of the series")}
                        aria-label={t("Start of the series")}
                    >
                        <ChevronRightIcon size={11} />
                    </span>
                )}
                <div
                    className={`nc-event-text ${
                        inlineLayout ? "nc-event-text-inline" : ""
                    }`}
                >
                    <span className="nc-event-title">{event.title}</span>
                    {!event.allDay && (
                        <span className="nc-event-time">
                            {formatTime(labelStart, timeFormat24h)} –{" "}
                            {formatTime(displayEnd, timeFormat24h)}
                        </span>
                    )}
                </div>
            </div>
            {!compact && !event.allDay && event.editable && (
                <>
                    {/* Top edge: drag to move the START time (Notion-style). */}
                    <div
                        className="nc-event-resize-handle-top"
                        onPointerDown={handleResizePointerDown}
                        onMouseDown={(e) => handleResizeMouseDown(e, "top")}
                    />
                    {/* Bottom edge: drag to move the END time. */}
                    <div
                        ref={resizeRef}
                        className="nc-event-resize-handle"
                        onPointerDown={handleResizePointerDown}
                        onMouseDown={(e) => handleResizeMouseDown(e, "bottom")}
                    />
                </>
            )}
        </div>
    );
}
