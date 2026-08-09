import * as React from "react";
import * as ReactDOM from "react-dom";
import { DisplayEvent } from "../types";
import { CalendarInfo } from "../../types";
import { formatTime, addDays, isAndroidRuntime } from "./CalendarUtils";
import ColorPicker from "./ColorPicker";
import { usePanelDrag, PanelDropTarget } from "./usePanelDrag";
import {
    PanelDateFilter,
    PanelPeriod,
    PanelStatusFilter,
    filterPanelEvents,
    formatCardDate,
    formatPanelPeriod,
    formatTotalMinutes,
    getCalendarColorName,
    getDisplayTitle,
    summarizePanelEvents,
} from "./CalendarEventsPanel.helpers";
import {
    MoreHorizontalIcon,
    SlidersIcon,
    PlusIcon,
    PinIcon,
    ChevronsLeftIcon,
    CalendarGlyphIcon,
    FileTextIcon,
    CheckIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    EyeIcon,
    ListXIcon,
    SearchIcon,
    XIcon,
    ChartColumnIcon,
} from "./Icons";
import { t } from "../i18n";

interface CalendarEventsPanelProps {
    calendar: {
        id: string;
        name: string;
        color: string;
        type: CalendarInfo["type"];
        editable: boolean;
    };
    events: DisplayEvent[];
    timeFormat24h: boolean;
    defaultCalendarId: string;
    pinned: boolean;
    onEventClick: (eventId: string) => void;
    onClose: () => void;
    onTogglePinned: () => void;
    onAddEvent: (calendarId: string) => void;
    onSetDefault: (calendarId: string) => void;
    onShowOnly: (calendarId: string) => void;
    onRemove: (calendarId: string) => void;
    onColorChange: (calendarId: string, color: string) => void;
    open: boolean;
    onPanelDragTarget: (
        event: DisplayEvent | null,
        target: PanelDropTarget
    ) => void;
    onPanelDrop: (
        event: DisplayEvent,
        start: Date,
        end: Date,
        allDay: boolean
    ) => void;
}

/** Corps de carte partage par la carte du panneau et par le ghost qui la suit
    pendant un drag : les deux doivent toujours afficher exactement la meme
    chose (titre, date, badge de tache), donc une seule source de rendu. */
function PanelCardBody({
    event,
    calendarColor,
    timeFormat24h,
}: {
    event: DisplayEvent;
    calendarColor: string;
    timeFormat24h: boolean;
}) {
    return (
        <>
            <div className="nc-cep-card-title-row">
                <span className="nc-cep-card-icon">
                    <FileTextIcon size={14} />
                </span>
                <span className="nc-cep-card-title">
                    {getDisplayTitle(event.title)}
                </span>
            </div>
            <div className="nc-cep-card-date" style={{ color: calendarColor }}>
                {event.isSomeday
                    ? "Add date"
                    : formatCardDate(event, timeFormat24h, formatTime, addDays)}
            </div>
            {event.isTask && (
                <span
                    className={`nc-cep-badge nc-cep-badge-${event.taskStatus}`}
                >
                    <span className="nc-cep-badge-dot" />
                    {event.taskStatus === "complete"
                        ? t("Complete")
                        : t("To do")}
                </span>
            )}
        </>
    );
}

function toLocalISODate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function currentMonthPeriod(): PanelPeriod {
    const now = new Date();
    return {
        start: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
}

type OpenMenu = "more" | "settings" | null;
type SettingsPage = "root" | "status" | "date" | "period";

const STATUS_OPTIONS: { value: PanelStatusFilter; label: string }[] = [
    { value: "all", label: t("All") },
    { value: "todo", label: t("To do") },
    { value: "complete", label: t("Complete") },
];

const DATE_OPTIONS: { value: PanelDateFilter; label: string }[] = [
    { value: "all", label: t("All") },
    { value: "scheduled", label: t("Scheduled") },
    { value: "unscheduled", label: t("Unscheduled") },
];

export default function CalendarEventsPanel({
    calendar,
    events,
    timeFormat24h,
    defaultCalendarId,
    pinned,
    onEventClick,
    onClose,
    onTogglePinned,
    onAddEvent,
    onSetDefault,
    onShowOnly,
    onRemove,
    onColorChange,
    open,
    onPanelDragTarget,
    onPanelDrop,
}: CalendarEventsPanelProps) {
    const { dragState, startDrag, consumeDragClick } = usePanelDrag({
        onDrop: onPanelDrop,
        onTargetChange: onPanelDragTarget,
    });
    const panelRef = React.useRef<HTMLDivElement>(null);
    // On a phone this slides in from the right over the calendar, the same
    // movement it makes on a desktop — just covering rather than sharing.
    const onPhone = isAndroidRuntime();
    const colorRowRef = React.useRef<HTMLButtonElement>(null);
    const [openMenu, setOpenMenu] = React.useState<OpenMenu>(null);
    const [settingsPage, setSettingsPage] =
        React.useState<SettingsPage>("root");
    const [statusFilter, setStatusFilter] =
        React.useState<PanelStatusFilter>("all");
    const [dateFilter, setDateFilter] = React.useState<PanelDateFilter>("all");
    const [period, setPeriod] = React.useState<PanelPeriod | null>(null);
    const [draftPeriod, setDraftPeriod] =
        React.useState<PanelPeriod>(currentMonthPeriod);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [showTotals, setShowTotals] = React.useState(false);
    const [colorAnchor, setColorAnchor] = React.useState<DOMRect | null>(null);

    React.useEffect(() => {
        if (!openMenu) return;
        const close = (event: Event) => {
            if (!panelRef.current?.contains(event.target as Node)) {
                setOpenMenu(null);
                setSettingsPage("root");
            }
        };
        // Pointer events, not mouse events: the grid cancels its `pointerdown`,
        // which suppresses the compatibility mouse events, so a press on the
        // calendar never produces a `mousedown` to dismiss on.
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [openMenu]);

    React.useEffect(() => {
        setOpenMenu(null);
        setSettingsPage("root");
        setStatusFilter("all");
        setDateFilter("all");
        setPeriod(null);
        setDraftPeriod(currentMonthPeriod());
        setSearchQuery("");
    }, [calendar.id]);

    const filteredEvents = React.useMemo(
        () =>
            filterPanelEvents(
                events,
                statusFilter,
                dateFilter,
                searchQuery,
                period
            ),
        [events, statusFilter, dateFilter, searchQuery, period]
    );
    const summary = React.useMemo(
        () => summarizePanelEvents(filteredEvents),
        [filteredEvents]
    );
    const periodLabel = React.useMemo(
        () => formatPanelPeriod(dateFilter, period),
        [dateFilter, period]
    );

    const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
        setOpenMenu((current) => (current === menu ? null : menu));
        setSettingsPage("root");
    };

    const chooseStatus = (value: PanelStatusFilter) => {
        setStatusFilter(value);
        setSettingsPage("root");
    };

    const chooseDate = (value: PanelDateFilter) => {
        setDateFilter(value);
        setSettingsPage("root");
    };

    const openPeriodSettings = () => {
        setDraftPeriod(period ?? currentMonthPeriod());
        setSettingsPage("period");
    };

    const validDraftPeriod =
        !!draftPeriod.start &&
        !!draftPeriod.end &&
        draftPeriod.start <= draftPeriod.end;

    const settingsTitle =
        settingsPage === "root"
            ? "Filters"
            : settingsPage === "status"
            ? "Status"
            : settingsPage === "date"
            ? "Date"
            : "Custom period";

    return (
        <div
            className={`nc-cep-slot${open ? " nc-cep-open" : ""}${
                pinned ? " nc-cep-pinned" : ""
            }`}
        >
            {/* This panel was switched off on Android because its close button
                ended up under the status bar, leaving a list with no way out.
                It keeps a strip of calendar visible beside it, exactly as the
                drawer does on the other edge, and that strip closes it — so
                there are two ways out even if the button ever misbehaves. */}
            {onPhone && (
                <div
                    className="nc-cep-backdrop"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}
            <div className="nc-cep" ref={panelRef}>
                <div className="nc-cep-header">
                    <div className="nc-cep-header-title">
                        <span
                            className="nc-cep-header-icon"
                            style={{ color: calendar.color }}
                        >
                            <CalendarGlyphIcon size={16} />
                        </span>
                        <span
                            className="nc-cep-header-name"
                            title={calendar.name}
                        >
                            {calendar.name}
                        </span>
                    </div>
                    <div className="nc-cep-header-actions">
                        <button
                            type="button"
                            className={`nc-cep-icon-btn${
                                openMenu === "more" ? " nc-active" : ""
                            }`}
                            title={t("More options")}
                            aria-expanded={openMenu === "more"}
                            onClick={() => toggleMenu("more")}
                        >
                            <MoreHorizontalIcon />
                        </button>
                        <button
                            type="button"
                            className={`nc-cep-icon-btn${
                                openMenu === "settings" ? " nc-active" : ""
                            }`}
                            title={t("Filters")}
                            aria-expanded={openMenu === "settings"}
                            onClick={() => toggleMenu("settings")}
                        >
                            <SlidersIcon />
                        </button>
                        <button
                            type="button"
                            className="nc-cep-icon-btn"
                            title={t("Add event")}
                            disabled={!calendar.editable}
                            onClick={() => onAddEvent(calendar.id)}
                        >
                            <PlusIcon size={16} />
                        </button>
                        <button
                            type="button"
                            className={`nc-cep-icon-btn${
                                pinned ? " nc-active" : ""
                            }`}
                            title={pinned ? t("Unpin panel") : t("Pin panel")}
                            aria-pressed={pinned}
                            onClick={onTogglePinned}
                        >
                            <PinIcon />
                        </button>
                        <button
                            type="button"
                            className="nc-cep-icon-btn"
                            title={t("Collapse")}
                            onClick={onClose}
                        >
                            <ChevronsLeftIcon />
                        </button>
                    </div>
                </div>

                <div className="nc-cep-search">
                    <span className="nc-cep-search-icon">
                        <SearchIcon />
                    </span>
                    <input
                        type="search"
                        value={searchQuery}
                        placeholder={t("Search events")}
                        aria-label={t("Search events")}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="nc-cep-search-clear"
                            title={t("Clear search")}
                            onClick={() => setSearchQuery("")}
                        >
                            <XIcon size={12} />
                        </button>
                    )}
                </div>

                {showTotals && (
                    <div
                        className="nc-cep-summary"
                        aria-label={t("Event totals")}
                    >
                        <div className="nc-cep-summary-metric">
                            <span>{t("Total time")}</span>
                            <strong>
                                {formatTotalMinutes(summary.totalMinutes)}
                            </strong>
                        </div>
                        <div className="nc-cep-summary-metric">
                            <span>{t("Tasks")}</span>
                            <strong>{summary.taskCount}</strong>
                        </div>
                        <div className="nc-cep-summary-period">
                            <CalendarGlyphIcon size={14} />
                            <span>{t("Period")}</span>
                            <strong title={periodLabel}>{periodLabel}</strong>
                        </div>
                    </div>
                )}

                {openMenu === "more" && (
                    <div className="nc-cep-popover" role="menu">
                        <button
                            ref={colorRowRef}
                            type="button"
                            className="nc-cep-menu-row"
                            onClick={() => {
                                const rect =
                                    colorRowRef.current?.getBoundingClientRect();
                                if (rect) setColorAnchor(rect);
                            }}
                        >
                            <span
                                className="nc-cep-menu-swatch"
                                style={{ backgroundColor: calendar.color }}
                            />
                            <span className="nc-cep-menu-label">
                                {t("Color")}
                            </span>
                            <span className="nc-cep-menu-value">
                                {getCalendarColorName(calendar.color)}
                            </span>
                            <ChevronRightIcon size={14} />
                        </button>
                        <button
                            type="button"
                            className="nc-cep-menu-row"
                            disabled={
                                !calendar.editable ||
                                calendar.id === defaultCalendarId
                            }
                            onClick={() => {
                                onSetDefault(calendar.id);
                                setOpenMenu(null);
                            }}
                        >
                            <CalendarGlyphIcon size={15} />
                            <span className="nc-cep-menu-label">
                                Make default calendar
                            </span>
                        </button>
                        <button
                            type="button"
                            className="nc-cep-menu-row"
                            onClick={() => {
                                onShowOnly(calendar.id);
                                setOpenMenu(null);
                            }}
                        >
                            <EyeIcon size={15} />
                            <span className="nc-cep-menu-label">
                                {t("Show only this view")}
                            </span>
                        </button>
                        <button
                            type="button"
                            className="nc-cep-menu-row"
                            aria-pressed={showTotals}
                            onClick={() => {
                                setShowTotals((value) => !value);
                                setOpenMenu(null);
                            }}
                        >
                            <ChartColumnIcon size={15} />
                            <span className="nc-cep-menu-label">
                                {t("Show totals")}
                            </span>
                            <span className="nc-cep-menu-check">
                                {showTotals && <CheckIcon size={14} />}
                            </span>
                        </button>
                        <div className="nc-cep-menu-separator" />
                        <button
                            type="button"
                            className="nc-cep-menu-row nc-cep-menu-danger"
                            onClick={() => {
                                setOpenMenu(null);
                                onRemove(calendar.id);
                            }}
                        >
                            <ListXIcon size={15} />
                            <span className="nc-cep-menu-label">
                                {t("Remove view from list")}
                            </span>
                        </button>
                    </div>
                )}

                {openMenu === "settings" && (
                    <div className="nc-cep-popover" role="menu">
                        <div className="nc-cep-popover-title">
                            {settingsPage !== "root" && (
                                <button
                                    type="button"
                                    className="nc-cep-popover-back"
                                    onClick={() =>
                                        setSettingsPage(
                                            settingsPage === "period"
                                                ? "date"
                                                : "root"
                                        )
                                    }
                                    title={t("Back")}
                                >
                                    <ChevronLeftIcon size={14} />
                                </button>
                            )}
                            {settingsTitle}
                        </div>

                        {settingsPage === "root" && (
                            <>
                                <button
                                    type="button"
                                    className="nc-cep-menu-row"
                                    onClick={() => setSettingsPage("status")}
                                >
                                    <SlidersIcon size={15} />
                                    <span className="nc-cep-menu-label">
                                        {t("Status")}
                                    </span>
                                    <span className="nc-cep-menu-value">
                                        {STATUS_OPTIONS.find(
                                            (option) =>
                                                option.value === statusFilter
                                        )?.label ?? "All"}
                                    </span>
                                    <ChevronRightIcon size={14} />
                                </button>
                                <button
                                    type="button"
                                    className="nc-cep-menu-row"
                                    onClick={() => setSettingsPage("date")}
                                >
                                    <CalendarGlyphIcon size={15} />
                                    <span className="nc-cep-menu-label">
                                        Date
                                    </span>
                                    <span className="nc-cep-menu-value">
                                        {dateFilter === "period"
                                            ? "Period"
                                            : DATE_OPTIONS.find(
                                                  (option) =>
                                                      option.value ===
                                                      dateFilter
                                              )?.label ?? "All"}
                                    </span>
                                    <ChevronRightIcon size={14} />
                                </button>
                            </>
                        )}

                        {settingsPage === "status" &&
                            STATUS_OPTIONS.map((option) => (
                                <button
                                    type="button"
                                    className="nc-cep-menu-row"
                                    key={option.value}
                                    onClick={() => chooseStatus(option.value)}
                                >
                                    <span className="nc-cep-menu-check">
                                        {statusFilter === option.value && (
                                            <CheckIcon size={14} />
                                        )}
                                    </span>
                                    <span className="nc-cep-menu-label">
                                        {option.label}
                                    </span>
                                </button>
                            ))}

                        {settingsPage === "date" && (
                            <>
                                {DATE_OPTIONS.map((option) => (
                                    <button
                                        type="button"
                                        className="nc-cep-menu-row"
                                        key={option.value}
                                        onClick={() => chooseDate(option.value)}
                                    >
                                        <span className="nc-cep-menu-check">
                                            {dateFilter === option.value && (
                                                <CheckIcon size={14} />
                                            )}
                                        </span>
                                        <span className="nc-cep-menu-label">
                                            {option.label}
                                        </span>
                                    </button>
                                ))}
                                <div className="nc-cep-menu-separator" />
                                <button
                                    type="button"
                                    className="nc-cep-menu-row"
                                    onClick={openPeriodSettings}
                                >
                                    <span className="nc-cep-menu-check">
                                        {dateFilter === "period" && (
                                            <CheckIcon size={14} />
                                        )}
                                    </span>
                                    <span className="nc-cep-menu-label">
                                        Custom period
                                    </span>
                                    <ChevronRightIcon size={14} />
                                </button>
                            </>
                        )}

                        {settingsPage === "period" && (
                            <div className="nc-cep-period-editor">
                                <label>
                                    <span>{t("From")}</span>
                                    <input
                                        type="date"
                                        value={draftPeriod.start}
                                        max={draftPeriod.end || undefined}
                                        onChange={(event) =>
                                            setDraftPeriod((current) => ({
                                                ...current,
                                                start: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <label>
                                    <span>To</span>
                                    <input
                                        type="date"
                                        value={draftPeriod.end}
                                        min={draftPeriod.start || undefined}
                                        onChange={(event) =>
                                            setDraftPeriod((current) => ({
                                                ...current,
                                                end: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <div className="nc-cep-period-actions">
                                    <button
                                        type="button"
                                        className="nc-cep-period-clear"
                                        onClick={() => {
                                            setPeriod(null);
                                            setDateFilter("all");
                                            setSettingsPage("root");
                                        }}
                                    >
                                        Clear
                                    </button>
                                    <button
                                        type="button"
                                        className="nc-cep-period-apply"
                                        disabled={!validDraftPeriod}
                                        onClick={() => {
                                            if (!validDraftPeriod) return;
                                            setPeriod(draftPeriod);
                                            setDateFilter("period");
                                            setSettingsPage("root");
                                        }}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="nc-cep-body">
                    {filteredEvents.length === 0 ? (
                        <div className="nc-cep-empty">
                            {searchQuery ||
                            statusFilter !== "all" ||
                            dateFilter !== "all"
                                ? "No matching events"
                                : "No events"}
                        </div>
                    ) : (
                        filteredEvents.map((event) => (
                            <button
                                type="button"
                                key={`${event.id}-${event.start.getTime()}`}
                                onClick={() => {
                                    // Le clic qui clot un drag (commit comme
                                    // Escape) ne doit pas ouvrir l'evenement.
                                    if (consumeDragClick()) return;
                                    onEventClick(event.id);
                                }}
                                onPointerDown={(e) => startDrag(e, event)}
                                className={`nc-cep-card${
                                    dragState?.event.id === event.id
                                        ? " nc-cep-card-dragging"
                                        : ""
                                }`}
                            >
                                <PanelCardBody
                                    event={event}
                                    calendarColor={calendar.color}
                                    timeFormat24h={timeFormat24h}
                                />
                            </button>
                        ))
                    )}
                </div>
            </div>
            {colorAnchor && (
                <ColorPicker
                    color={calendar.color}
                    anchorRect={colorAnchor}
                    onChange={(color) => onColorChange(calendar.id, color)}
                    onClose={() => setColorAnchor(null)}
                />
            )}
            {dragState &&
                ReactDOM.createPortal(
                    // Portaile sur le body : Obsidian pose `contain: strict` sur
                    // .workspace-leaf, qui devient alors le bloc conteneur des
                    // position:fixed descendants et decalerait le ghost.
                    <div
                        className="nc-cep-card nc-cep-card-ghost"
                        style={{
                            left: dragState.ghostX,
                            top: dragState.ghostY,
                            width: dragState.ghostWidth,
                        }}
                    >
                        <PanelCardBody
                            event={dragState.event}
                            calendarColor={calendar.color}
                            timeFormat24h={timeFormat24h}
                        />
                    </div>,
                    document.body
                )}
            {dragState &&
                ReactDOM.createPortal(
                    <div className="nc-panel-drag-hint">
                        Drag onto the grid to add a date
                    </div>,
                    document.body
                )}
        </div>
    );
}
