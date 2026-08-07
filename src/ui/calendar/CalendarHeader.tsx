import * as React from "react";
import { ViewType } from "../types";
import { getISOWeek, isAndroidRuntime, todayBadgeState } from "./CalendarUtils";
import MiniCalendar from "./MiniCalendar";
import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    SettingsIcon,
    CheckIcon,
    SidebarToggleIcon,
    SearchIcon,
} from "./Icons";

interface CalendarHeaderProps {
    currentDate: Date;
    firstDay: number;
    onDateSelect: (date: Date) => void;
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
    onOpenSearch: () => void;
    onToggleSidebar: () => void;
    /** The days the grid is showing, used to decide how the date badge reads. */
    visibleDates: Date[];
}

const VIEW_OPTIONS: { value: ViewType; label: string }[] = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

const DAY_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function viewLabel(viewType: ViewType, dayCount: number): string {
    if (viewType === "days") {
        return dayCount === 1 ? "1 day" : `${dayCount} days`;
    }
    return (
        (
            {
                day: "Day",
                week: "Week",
                month: "Month",
                list: "List",
                "3days": "3 Days",
            } as Record<string, string>
        )[viewType] ?? "Week"
    );
}

export default function CalendarHeader(props: CalendarHeaderProps) {
    const {
        currentDate,
        firstDay,
        onDateSelect,
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
        onOpenSearch,
        onToggleSidebar,
        visibleDates,
    } = props;

    const isAndroid = isAndroidRuntime();
    const [viewMenuOpen, setViewMenuOpen] = React.useState(false);
    const [monthPanelOpen, setMonthPanelOpen] = React.useState(false);
    const [openSubmenu, setOpenSubmenu] = React.useState<
        null | "days" | "settings"
    >(null);
    const [otherMode, setOtherMode] = React.useState(false);
    const viewMenuRef = React.useRef<HTMLDivElement>(null);
    const otherInputRef = React.useRef<HTMLInputElement>(null);

    const closeAll = React.useCallback(() => {
        setViewMenuOpen(false);
        setOpenSubmenu(null);
        setOtherMode(false);
    }, []);

    React.useEffect(() => {
        if (!viewMenuOpen) return;
        const handleClickOutside = (event: PointerEvent) => {
            if (
                viewMenuRef.current &&
                !viewMenuRef.current.contains(event.target as Node)
            ) {
                closeAll();
            }
        };
        document.addEventListener("pointerdown", handleClickOutside);
        return () =>
            document.removeEventListener("pointerdown", handleClickOutside);
    }, [viewMenuOpen, closeAll]);

    React.useEffect(() => {
        if (otherMode) otherInputRef.current?.focus();
    }, [otherMode]);

    React.useEffect(() => {
        setMonthPanelOpen(false);
    }, [currentDate.getFullYear(), currentDate.getMonth()]);

    const applyOther = () => {
        const raw = otherInputRef.current?.value ?? "";
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 60) {
            onSetDayCount(n);
            closeAll();
        }
    };

    if (isAndroid) {
        const monthName = currentDate.toLocaleDateString(undefined, {
            month: "long",
        });
        const weekLabel = `${
            navigator.language?.startsWith("fr") ? "Semaine" : "Week"
        } ${getISOWeek(currentDate)}`;

        return (
            <header className="nc-header nc-header--android">
                <div className="nc-android-appbar">
                    {/* Kept as a second way in beside the edge drag. It steps
                        aside once the drawer is open (see V10 in mobile.css),
                        where closing is the drag's job. */}
                    <button
                        type="button"
                        className="nc-btn nc-btn-icon nc-btn-sidebar-toggle nc-android-menu-btn"
                        onClick={onToggleSidebar}
                        title="Calendars"
                        aria-label="Open calendars"
                    >
                        <SidebarToggleIcon />
                    </button>

                    <button
                        type="button"
                        className={`nc-android-month-button${
                            monthPanelOpen ? " nc-open" : ""
                        }`}
                        aria-expanded={monthPanelOpen}
                        onClick={() => setMonthPanelOpen((value) => !value)}
                    >
                        <span>{monthName}</span>
                        <ChevronDownIcon />
                    </button>

                    {/* Which week is on screen — the one piece of context the
                        month name alone does not give. */}
                    <span className="nc-android-week-label">{weekLabel}</span>

                    <div className="nc-android-appbar-spacer" />

                    <button
                        type="button"
                        className="nc-btn nc-btn-icon nc-android-search-btn"
                        onClick={onOpenSearch}
                        title="Search"
                        aria-label="Search"
                    >
                        <SearchIcon />
                    </button>
                    {/* Always today's number, never the day being looked at:
                        the badge is what takes you back to today. */}
                    <button
                        type="button"
                        className="nc-android-date-badge"
                        data-today-state={todayBadgeState(
                            visibleDates,
                            new Date()
                        )}
                        onClick={onGoToday}
                        title="Go to today"
                        aria-label="Go to today"
                    >
                        {new Date().getDate()}
                    </button>
                </div>

                {monthPanelOpen && (
                    <div className="nc-android-month-sheet">
                        <MiniCalendar
                            currentDate={currentDate}
                            firstDay={firstDay}
                            showWeekNumbers={showWeekNumbers}
                            onDateSelect={(date) => {
                                onDateSelect(date);
                                setMonthPanelOpen(false);
                            }}
                        />
                    </div>
                )}
            </header>
        );
    }

    const currentViewLabel = viewLabel(viewType, dayCount);

    return (
        <div className="nc-header">
            <div className="nc-header-left">
                <button
                    className="nc-btn nc-btn-icon nc-btn-sidebar-toggle"
                    onClick={onToggleSidebar}
                    title="Calendars"
                    aria-label="Calendars"
                >
                    <SidebarToggleIcon />
                </button>
            </div>
            <div className="nc-header-right">
                <button
                    className="nc-btn nc-btn-icon nc-btn-settings"
                    onClick={onOpenSettings}
                    title="Settings"
                    aria-label="Settings"
                >
                    <SettingsIcon size={15} />
                </button>
                <div className="nc-view-dropdown" ref={viewMenuRef}>
                    <button
                        className="nc-btn nc-view-dropdown-btn"
                        onClick={() =>
                            setViewMenuOpen((value) => {
                                if (value) {
                                    setOpenSubmenu(null);
                                    setOtherMode(false);
                                }
                                return !value;
                            })
                        }
                    >
                        <span>{currentViewLabel}</span>
                        <ChevronDownIcon />
                    </button>
                    {viewMenuOpen && (
                        <div className="nc-view-dropdown-menu">
                            {VIEW_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    role="menuitemradio"
                                    aria-checked={viewType === option.value}
                                    className={`nc-view-dropdown-item ${
                                        viewType === option.value
                                            ? "nc-active"
                                            : ""
                                    }`}
                                    onMouseEnter={() => setOpenSubmenu(null)}
                                    onClick={() => {
                                        onViewTypeChange(option.value);
                                        closeAll();
                                    }}
                                >
                                    <span className="nc-view-dropdown-check">
                                        {viewType === option.value && (
                                            <CheckIcon size={14} />
                                        )}
                                    </span>
                                    <span>{option.label}</span>
                                </button>
                            ))}

                            <div
                                className="nc-view-submenu-anchor"
                                onMouseEnter={() => setOpenSubmenu("days")}
                            >
                                <button
                                    className={`nc-view-dropdown-item nc-has-submenu ${
                                        viewType === "days" ? "nc-active" : ""
                                    }`}
                                    aria-haspopup="menu"
                                    aria-expanded={openSubmenu === "days"}
                                    onClick={() =>
                                        setOpenSubmenu((value) =>
                                            value === "days" ? null : "days"
                                        )
                                    }
                                >
                                    <span className="nc-view-dropdown-check">
                                        {viewType === "days" && (
                                            <CheckIcon size={14} />
                                        )}
                                    </span>
                                    <span>Number of days</span>
                                    <span className="nc-submenu-chevron">
                                        <ChevronRightIcon />
                                    </span>
                                </button>
                                {openSubmenu === "days" && (
                                    <div
                                        className="nc-view-submenu"
                                        role="menu"
                                    >
                                        {DAY_COUNTS.map((n) => {
                                            const active =
                                                viewType === "days" &&
                                                dayCount === n;
                                            return (
                                                <button
                                                    key={n}
                                                    role="menuitemradio"
                                                    aria-checked={active}
                                                    className={`nc-view-dropdown-item ${
                                                        active
                                                            ? "nc-active"
                                                            : ""
                                                    }`}
                                                    onClick={() => {
                                                        onSetDayCount(n);
                                                        closeAll();
                                                    }}
                                                >
                                                    <span className="nc-view-dropdown-check">
                                                        {active && (
                                                            <CheckIcon
                                                                size={14}
                                                            />
                                                        )}
                                                    </span>
                                                    <span>
                                                        {n === 1
                                                            ? "1 day"
                                                            : `${n} days`}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        <div className="nc-view-dropdown-sep" />
                                        {otherMode ? (
                                            <div className="nc-view-other-row">
                                                <input
                                                    ref={otherInputRef}
                                                    className="nc-view-other-input"
                                                    type="number"
                                                    min={1}
                                                    max={60}
                                                    placeholder="Daysâ€¦"
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                            "Enter"
                                                        ) {
                                                            event.preventDefault();
                                                            applyOther();
                                                        } else if (
                                                            event.key ===
                                                            "Escape"
                                                        ) {
                                                            setOtherMode(false);
                                                        }
                                                    }}
                                                    onBlur={applyOther}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                className="nc-view-dropdown-item"
                                                onClick={() =>
                                                    setOtherMode(true)
                                                }
                                            >
                                                <span className="nc-view-dropdown-check" />
                                                <span>Otherâ€¦</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div
                                className="nc-view-submenu-anchor"
                                onMouseEnter={() => setOpenSubmenu("settings")}
                            >
                                <button
                                    className="nc-view-dropdown-item nc-has-submenu"
                                    aria-haspopup="menu"
                                    aria-expanded={openSubmenu === "settings"}
                                    onClick={() =>
                                        setOpenSubmenu((value) =>
                                            value === "settings"
                                                ? null
                                                : "settings"
                                        )
                                    }
                                >
                                    <span className="nc-view-dropdown-check" />
                                    <span>View settings</span>
                                    <span className="nc-submenu-chevron">
                                        <ChevronRightIcon />
                                    </span>
                                </button>
                                {openSubmenu === "settings" && (
                                    <div
                                        className="nc-view-submenu"
                                        role="menu"
                                    >
                                        <button
                                            role="menuitemcheckbox"
                                            aria-checked={showWeekNumbers}
                                            className={`nc-view-dropdown-item ${
                                                showWeekNumbers
                                                    ? "nc-active"
                                                    : ""
                                            }`}
                                            onClick={onToggleWeekNumbers}
                                        >
                                            <span className="nc-view-dropdown-check">
                                                {showWeekNumbers && (
                                                    <CheckIcon size={14} />
                                                )}
                                            </span>
                                            <span>Week numbers</span>
                                        </button>
                                        <div className="nc-view-dropdown-sep" />
                                        <button
                                            className="nc-view-dropdown-item"
                                            onClick={() => {
                                                closeAll();
                                                onOpenSettings();
                                            }}
                                        >
                                            <span className="nc-view-dropdown-check" />
                                            <span>General settings</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <button className="nc-btn nc-btn-today" onClick={onGoToday}>
                    Today
                </button>
                <div className="nc-header-nav">
                    <button
                        className="nc-btn nc-btn-icon"
                        onClick={onGoPrev}
                        title="Previous"
                    >
                        <ChevronLeftIcon />
                    </button>
                    <button
                        className="nc-btn nc-btn-icon"
                        onClick={onGoNext}
                        title="Next"
                    >
                        <ChevronRightIcon />
                    </button>
                </div>
            </div>
        </div>
    );
}
