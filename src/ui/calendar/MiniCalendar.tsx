import * as React from "react";
import { useState, useEffect } from "react";
import {
    DAYS_MIN,
    isToday,
    isSameDay,
    addDays,
    getWeekStart,
    getWeekDays,
    getISOWeek,
    formatMonthTitleFull,
} from "./CalendarUtils";
import { ChevronUpIcon, ChevronDownNavIcon, GoTodayIcon } from "./Icons";
import { t } from "../i18n";

interface MiniCalendarProps {
    currentDate: Date;
    firstDay: number;
    onDateSelect: (date: Date) => void;
    showWeekNumbers?: boolean;
}

export default function MiniCalendar(props: MiniCalendarProps) {
    const { currentDate, firstDay, onDateSelect, showWeekNumbers } = props;
    const [viewMonth, setViewMonth] = useState(new Date());

    // Sync mini calendar with the main view when currentDate changes
    useEffect(() => {
        setViewMonth(
            new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        );
    }, [currentDate.getFullYear(), currentDate.getMonth()]);

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const weekStart = getWeekStart(firstDayOfMonth, firstDay);
    const days = Array.from({ length: 42 }, (_, i) => addDays(weekStart, i));

    const goPrevMonth = () => {
        setViewMonth(new Date(year, month - 1, 1));
    };

    const goNextMonth = () => {
        setViewMonth(new Date(year, month + 1, 1));
    };

    // "Go back to today": only offered when the browsed month isn't today's.
    const today = new Date();
    const isViewingTodayMonth =
        year === today.getFullYear() && month === today.getMonth();

    const goToToday = () => {
        // Reset the local browse AND jump the main view to today. Resetting
        // viewMonth explicitly is required: if the main view's currentDate is
        // already in today's month, onDateSelect won't change its month and the
        // sync effect wouldn't fire to pull the browse back on its own.
        setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        onDateSelect(today);
    };

    // Start of the week containing today — used to draw the current-week band.
    const todayWeekStart = getWeekStart(today, firstDay);

    return (
        <div className="nc-mini-calendar">
            <div className="nc-mini-cal-header">
                <span className="nc-mini-cal-title">
                    {formatMonthTitleFull(viewMonth)}
                </span>
                <div className="nc-mini-cal-nav">
                    {!isViewingTodayMonth && (
                        <button
                            className="nc-btn nc-btn-icon nc-btn-sm nc-mini-cal-today-btn"
                            onClick={goToToday}
                            title={t("Go back to today")}
                            aria-label={t("Go back to today")}
                        >
                            <GoTodayIcon />
                        </button>
                    )}
                    <button
                        className="nc-btn nc-btn-icon nc-btn-sm"
                        onClick={goPrevMonth}
                        title={t("Previous month")}
                    >
                        <ChevronUpIcon />
                    </button>
                    <button
                        className="nc-btn nc-btn-icon nc-btn-sm"
                        onClick={goNextMonth}
                        title={t("Next month")}
                    >
                        <ChevronDownNavIcon />
                    </button>
                </div>
            </div>
            <div
                className={`nc-mini-cal-grid ${
                    showWeekNumbers ? "nc-with-week-numbers" : ""
                }`}
            >
                {/* Empty corner above the week-numbers column */}
                {showWeekNumbers && <div className="nc-mini-cal-week-corner" />}
                {/* Day headers */}
                {getWeekDays(getWeekStart(new Date(), firstDay)).map((d, i) => (
                    <div
                        key={i}
                        className={`nc-mini-cal-day-header ${
                            d.getDay() === 0 || d.getDay() === 6
                                ? "nc-weekend"
                                : ""
                        }`}
                    >
                        {DAYS_MIN[d.getDay()]}
                    </div>
                ))}
                {/* Day cells, one week (row) at a time so an optional
                    week-number cell can lead each row. */}
                {Array.from({ length: 6 }, (_, w) => {
                    const week = days.slice(w * 7, w * 7 + 7);
                    const thursday =
                        week.find((d) => d.getDay() === 4) ?? week[0];
                    return (
                        <React.Fragment key={w}>
                            {showWeekNumbers && (
                                <div className="nc-mini-cal-week">
                                    {getISOWeek(thursday)}
                                </div>
                            )}
                            {week.map((day, j) => {
                                const i = w * 7 + j;
                                const isCurrentMonth = day.getMonth() === month;
                                const isTodayDate = isToday(day);
                                const isSelected = isSameDay(day, currentDate);
                                const isCurrentWeek = isSameDay(
                                    getWeekStart(day, firstDay),
                                    todayWeekStart
                                );
                                const posInWeek = j;

                                return (
                                    <button
                                        key={i}
                                        className={`nc-mini-cal-day ${
                                            !isCurrentMonth
                                                ? "nc-other-month"
                                                : ""
                                        } ${isTodayDate ? "nc-today" : ""} ${
                                            isSelected ? "nc-selected" : ""
                                        } ${
                                            isCurrentWeek
                                                ? "nc-current-week"
                                                : ""
                                        } ${
                                            isCurrentWeek && posInWeek === 0
                                                ? "nc-week-first"
                                                : ""
                                        } ${
                                            isCurrentWeek && posInWeek === 6
                                                ? "nc-week-last"
                                                : ""
                                        }`}
                                        onClick={() => onDateSelect(day)}
                                    >
                                        {day.getDate()}
                                    </button>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
