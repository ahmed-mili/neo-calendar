import * as React from "react";
import { DisplayEvent, CalendarSource, ViewType } from "../types";
import { NeoEvent, CalendarInfo } from "../../types";
import { formatMonthTitle, isAndroidRuntime } from "./CalendarUtils";
import CalendarHeader from "./CalendarHeader";
import CalendarSidebar from "./CalendarSidebar";
import CalendarEventsPanel from "./CalendarEventsPanel";
import DayView from "./DayView";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import ListView from "./ListView";
import ThreeDayView from "./ThreeDayView";
import { PlusIcon } from "./Icons";
import { useDrawerSwipe } from "./useDrawerSwipe";
import { t } from "../i18n";

interface CalendarLayoutProps {
    currentDate: Date;
    viewType: ViewType;
    onViewTypeChange: (view: ViewType) => void;
    dayCount: number;
    onSetDayCount: (n: number) => void;
    showWeekNumbers: boolean;
    onToggleWeekNumbers: () => void;
    onGoPrev: () => void;
    onGoNext: () => void;
    onGoToday: () => void;
    onOpenSettings: () => void;
    onShiftDays: (days: number) => void;
    onShiftMonths: (months: number) => void;
    onNewEvent: () => void;
    events: DisplayEvent[];
    calendarSources: CalendarSource[];
    visibleDates: Date[];
    firstDay: number;
    timeFormat24h: boolean;
    sidebarVisible: boolean;
    onToggleSidebar: () => void;
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
    onMonthDayClick: (date: Date) => void;
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    onEmptyContextMenu?: (date: Date, mouseEvent: MouseEvent) => void;
    onDateSelect: (date: Date) => void;
    hiddenCalendars: Set<string>;
    onToggleCalendar: (calendarId: string) => void;
    defaultCalendarId: string;
    soloCalendarId: string | null;
    onSetDefaultCalendar: (calendarId: string) => void;
    onShowOnly: (calendarId: string) => void;
    somedayEvents: DisplayEvent[];
    onAddSomeday: () => void;
    onQuickAdd: (partialEvent: Partial<NeoEvent>) => void;
    onOpenSearch: () => void;
    onAddCalendar: () => void;
    onRenameCalendar: (calendarId: string, newName: string) => Promise<void>;
    onEditCalendarLink: (calendarId: string) => void;
    onDeleteCalendar: (calendarId: string) => void;
    onColorChange: (calendarId: string, color: string) => void;
    onReorderCalendars: (orderedIds: string[]) => void;
    onOpenCalendarFolder: (calendarId: string) => void;
    onOpenRootFolder: () => void;
    onCalendarClick: (calendarId: string) => void;
    selectedCalendar: {
        id: string;
        name: string;
        color: string;
        type: CalendarInfo["type"];
        editable: boolean;
    } | null;
    panelEvents: DisplayEvent[];
    onAddPanelEvent: (calendarId: string) => void;
    onCloseEventsPanel: () => void;
    onPanelEventClick: (eventId: string) => void;
    secondaryTimezones?: string[];
    onAddTimezone: (tz: string) => void;
    onRemoveTimezone: (tz: string) => void;
    allDayCollapsed: boolean;
    onToggleAllDayCollapsed: () => void;
    draftSlot?: {
        start: Date;
        end: Date;
        allDay: boolean;
    } | null;
    draftColor?: string;
    onResizeDraft?: (range: import("./TimeGrid.types").DraftRange) => void;
    contextLine?: { date: Date; top: number } | null;
    panelPreview: import("./TimeGrid.types").DragPreview | null;
    onPanelDragTarget: (
        event: DisplayEvent | null,
        target: import("./usePanelDrag").PanelDropTarget
    ) => void;
    onPanelDrop: (
        event: DisplayEvent,
        start: Date,
        end: Date,
        allDay: boolean
    ) => void;
    onEventUnschedule?: (eventId: string) => Promise<boolean>;
}

export default function CalendarLayout(props: CalendarLayoutProps) {
    const {
        currentDate,
        viewType,
        onViewTypeChange,
        dayCount,
        onSetDayCount,
        showWeekNumbers,
        onToggleWeekNumbers,
        onGoPrev,
        onGoNext,
        onGoToday,
        onOpenSettings,
        onShiftDays,
        onShiftMonths,
        onNewEvent,
        events,
        calendarSources,
        visibleDates,
        firstDay,
        timeFormat24h,
        sidebarVisible,
        onToggleSidebar,
        onEventClick,
        onEventDrag,
        onEventResize,
        onSelectRange,
        onMonthDayClick,
        onContextMenu,
        onToggleTask,
        onEmptyContextMenu,
        onDateSelect,
        hiddenCalendars,
        onToggleCalendar,
        defaultCalendarId,
        soloCalendarId,
        onSetDefaultCalendar,
        onShowOnly,
        somedayEvents,
        onAddSomeday,
        onQuickAdd,
        onOpenSearch,
        onAddCalendar,
        onRenameCalendar,
        onEditCalendarLink,
        onDeleteCalendar,
        onColorChange,
        onReorderCalendars,
        onOpenCalendarFolder,
        onOpenRootFolder,
        onCalendarClick,
        selectedCalendar,
        panelEvents,
        onAddPanelEvent,
        onCloseEventsPanel,
        onPanelEventClick,
        secondaryTimezones,
        onAddTimezone,
        onRemoveTimezone,
        allDayCollapsed,
        onToggleAllDayCollapsed,
        draftSlot,
        draftColor,
        onResizeDraft,
        contextLine,
        panelPreview,
        onPanelDragTarget,
        onPanelDrop,
        onEventUnschedule,
    } = props;

    // â”€â”€ Events-panel slide transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Keep the panel mounted through its close animation: `panelOpen` drives the
    // CSS slide/width transition, `panelMounted` controls actual mount/unmount,
    // and the refs hold the last calendar+events so the panel still has content
    // to render while it slides out (after selectedCalendar is already null).
    const [panelMounted, setPanelMounted] = React.useState<boolean>(
        !!selectedCalendar
    );
    const [panelOpen, setPanelOpen] = React.useState<boolean>(
        !!selectedCalendar
    );
    const lastCalendarRef = React.useRef(selectedCalendar);
    const lastEventsRef = React.useRef(panelEvents);
    const [panelPinned, setPanelPinned] = React.useState(false);
    React.useEffect(() => {
        if (selectedCalendar) lastEventsRef.current = panelEvents;
    }, [selectedCalendar, panelEvents]);
    React.useEffect(() => {
        if (selectedCalendar) {
            lastCalendarRef.current = selectedCalendar;
            setPanelMounted(true);
            // Next frame so the enter transition runs from the closed state.
            const id = requestAnimationFrame(() => setPanelOpen(true));
            return () => cancelAnimationFrame(id);
        }
        setPanelOpen(false);
        // Unmount only after the slide-out transition (transform is 280ms).
        const t = window.setTimeout(() => setPanelMounted(false), 320);
        return () => window.clearTimeout(t);
    }, [selectedCalendar]);

    const viewProps = {
        events,
        visibleDates,
        firstDay,
        timeFormat24h,
        secondaryTimezones,
        onAddTimezone,
        onRemoveTimezone,
        allDayCollapsed,
        onToggleAllDayCollapsed,
        onEventClick,
        onEventDrag,
        onEventResize,
        onSelectRange,
        onContextMenu,
        onToggleTask,
        onEmptyContextMenu,
        draftSlot,
        draftColor,
        onResizeDraft,
        contextLine,
        externalPreview: panelPreview,
        onEventUnschedule,
    };

    const renderView = () => {
        switch (viewType) {
            case "day":
                return <DayView {...viewProps} onShiftDays={onShiftDays} />;
            case "week":
                return <WeekView {...viewProps} onShiftDays={onShiftDays} />;
            case "3days":
                return (
                    <ThreeDayView {...viewProps} onShiftDays={onShiftDays} />
                );
            case "days":
                // Custom "Number of days" span: the generic multi-day grid
                // (WeekView renders exactly visibleDates.length columns).
                return <WeekView {...viewProps} onShiftDays={onShiftDays} />;
            case "month":
                return (
                    <MonthView
                        {...viewProps}
                        onDayClick={onMonthDayClick}
                        onShiftMonths={onShiftMonths}
                    />
                );
            case "list":
                return <ListView {...viewProps} />;
            default:
                return <WeekView {...viewProps} onShiftDays={onShiftDays} />;
        }
    };

    // Pulled up into a panel (Notion-style): collapsed it announces the next
    // event, expanded it lists what is left today. State is per session on
    // purpose — the bar always starts collapsed, over the grid.
    const [agendaExpanded, setAgendaExpanded] = React.useState(false);

    const remainingToday = React.useMemo(() => {
        const now = Date.now();
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        return events
            .filter(
                (event) =>
                    !event.isSomeday &&
                    event.end.getTime() >= now &&
                    event.start.getTime() <= endOfDay.getTime()
            )
            .sort(
                (left, right) => left.start.getTime() - right.start.getTime()
            );
    }, [events]);

    // On Android the drawer follows the finger, and closing it plays the
    // opening backwards instead of cutting to nothing.
    const drawerSwipe = useDrawerSwipe({
        enabled: isAndroidRuntime(),
        isOpen: sidebarVisible,
        onOpenChange: (open) => {
            if (open !== sidebarVisible) onToggleSidebar();
        },
    });

    const nextUpcomingEvent = React.useMemo(() => {
        const now = Date.now();
        return (
            events
                .filter(
                    (event) => !event.isSomeday && event.end.getTime() >= now
                )
                .sort(
                    (left, right) =>
                        left.start.getTime() - right.start.getTime()
                )[0] ?? null
        );
    }, [events]);

    const nextEventTime = nextUpcomingEvent
        ? nextUpcomingEvent.start.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
          })
        : null;

    return (
        <div
            className={`nc-layout${
                sidebarVisible ? " nc-layout--sidebar-open" : ""
            }${agendaExpanded ? " nc-layout--agenda-open" : ""}`}
        >
            {sidebarVisible && (
                <button
                    type="button"
                    className="nc-mobile-sidebar-scrim"
                    aria-label={t("Close calendars")}
                    onClick={drawerSwipe.requestClose}
                />
            )}
            <CalendarSidebar
                sidebarVisible={sidebarVisible}
                currentDate={currentDate}
                viewType={viewType}
                onViewTypeChange={onViewTypeChange}
                dayCount={dayCount}
                onSetDayCount={onSetDayCount}
                calendarSources={calendarSources}
                firstDay={firstDay}
                showWeekNumbers={showWeekNumbers}
                onDateSelect={onDateSelect}
                hiddenCalendars={hiddenCalendars}
                onToggleCalendar={onToggleCalendar}
                defaultCalendarId={defaultCalendarId}
                soloCalendarId={soloCalendarId}
                onSetDefaultCalendar={onSetDefaultCalendar}
                onShowOnly={onShowOnly}
                somedayEvents={somedayEvents}
                onEventClick={onEventClick}
                onAddSomeday={onAddSomeday}
                onToggleTask={onToggleTask}
                onAddCalendar={onAddCalendar}
                onRenameCalendar={onRenameCalendar}
                onEditCalendarLink={onEditCalendarLink}
                onDeleteCalendar={onDeleteCalendar}
                onColorChange={onColorChange}
                onReorderCalendars={onReorderCalendars}
                onOpenCalendarFolder={onOpenCalendarFolder}
                onOpenRootFolder={onOpenRootFolder}
                onCalendarClick={onCalendarClick}
                selectedCalendarId={selectedCalendar?.id ?? null}
                onToggleSidebar={onToggleSidebar}
                onOpenSearch={onOpenSearch}
                onOpenSettings={onOpenSettings}
                onNewEvent={onNewEvent}
            />
            {panelMounted && (lastCalendarRef.current || selectedCalendar) && (
                <CalendarEventsPanel
                    calendar={(selectedCalendar || lastCalendarRef.current)!}
                    events={
                        selectedCalendar ? panelEvents : lastEventsRef.current
                    }
                    timeFormat24h={timeFormat24h}
                    defaultCalendarId={defaultCalendarId}
                    pinned={panelPinned}
                    onEventClick={onPanelEventClick}
                    onClose={onCloseEventsPanel}
                    onTogglePinned={() => setPanelPinned((value) => !value)}
                    onAddEvent={onAddPanelEvent}
                    onSetDefault={onSetDefaultCalendar}
                    onShowOnly={onShowOnly}
                    onRemove={onDeleteCalendar}
                    onColorChange={onColorChange}
                    open={panelOpen}
                    onPanelDragTarget={onPanelDragTarget}
                    onPanelDrop={onPanelDrop}
                />
            )}
            <div className="nc-main">
                <CalendarHeader
                    currentDate={currentDate}
                    firstDay={firstDay}
                    onDateSelect={onDateSelect}
                    viewType={viewType}
                    onViewTypeChange={onViewTypeChange}
                    dayCount={dayCount}
                    onSetDayCount={onSetDayCount}
                    showWeekNumbers={showWeekNumbers}
                    onToggleWeekNumbers={onToggleWeekNumbers}
                    onGoPrev={onGoPrev}
                    onGoNext={onGoNext}
                    onGoToday={onGoToday}
                    onOpenSettings={onOpenSettings}
                    onOpenSearch={onOpenSearch}
                    onToggleSidebar={onToggleSidebar}
                    visibleDates={visibleDates}
                />
                <div className="nc-month-title">
                    {formatMonthTitle(currentDate)}
                </div>
                <div className="nc-content">{renderView()}</div>
                <div
                    className={`nc-mobile-agenda-bar${
                        agendaExpanded ? " nc-mobile-agenda-bar--open" : ""
                    }`}
                >
                    <button
                        type="button"
                        className="nc-mobile-agenda-handle"
                        aria-expanded={agendaExpanded}
                        aria-label={
                            agendaExpanded
                                ? "Collapse today's agenda"
                                : "Expand today's agenda"
                        }
                        onClick={() => setAgendaExpanded((value) => !value)}
                    >
                        <span
                            className="nc-mobile-agenda-grip"
                            aria-hidden="true"
                        />
                    </button>

                    <div className="nc-mobile-agenda-head">
                        <div className="nc-mobile-agenda-copy" role="status">
                            <strong>
                                {nextUpcomingEvent
                                    ? nextUpcomingEvent.title
                                    : "No upcoming meeting"}
                            </strong>
                            {nextUpcomingEvent && (
                                <small>
                                    {nextEventTime} ·{" "}
                                    {nextUpcomingEvent.calendarName}
                                </small>
                            )}
                        </div>
                        <button
                            type="button"
                            className="nc-mobile-agenda-add"
                            aria-label={t("Create a new event")}
                            title={t("New event")}
                            onClick={onNewEvent}
                        >
                            <PlusIcon size={25} />
                        </button>
                    </div>

                    {agendaExpanded && (
                        <ul className="nc-mobile-agenda-list">
                            {remainingToday.length === 0 && (
                                <li className="nc-mobile-agenda-empty">
                                    Nothing left today
                                </li>
                            )}
                            {remainingToday.map((event) => (
                                <li key={event.id}>
                                    <button
                                        type="button"
                                        className="nc-mobile-agenda-item"
                                        onClick={() => onEventClick(event.id)}
                                    >
                                        <span
                                            className="nc-mobile-agenda-dot"
                                            style={{ background: event.color }}
                                            aria-hidden="true"
                                        />
                                        <span className="nc-mobile-agenda-item-copy">
                                            <strong>{event.title}</strong>
                                            <small>
                                                {event.allDay
                                                    ? "All day"
                                                    : event.start.toLocaleTimeString(
                                                          [],
                                                          {
                                                              hour: "2-digit",
                                                              minute: "2-digit",
                                                          }
                                                      )}{" "}
                                                · {event.calendarName}
                                            </small>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <div id="nc-android-overlay-root" />
            <button
                type="button"
                className="nc-mobile-new-event"
                aria-label={t("Create a new event")}
                title={t("New event")}
                onClick={onNewEvent}
            >
                <PlusIcon size={24} />
            </button>
        </div>
    );
}
