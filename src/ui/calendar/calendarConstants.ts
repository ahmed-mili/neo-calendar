// Layout constants for the calendar time grid
export const HOUR_HEIGHT = 60; // px per hour
export const SLOT_HEIGHT = 30; // px per 30-min slot
export const OVERLAP_COL_GAP = 16; // px right-trim on every event
export const EVENT_VGAP = 4; // px vertical gap between back-to-back events

// All-day section: each all-day event occupies one stacked "lane" row. The
// section grows up to ALLDAY_MAX_ROWS rows, then scrolls internally (Notion-
// style). ALLDAY_ROW_HEIGHT must match the .nc-allday-lane-bar height math in
// CalendarOverlays.css.
export const ALLDAY_ROW_HEIGHT = 24; // px per all-day lane row
export const ALLDAY_MAX_ROWS = 4; // visible rows before the section scrolls

// Day/month names, in the language the calendar is set to. Written out in the
// dictionary rather than taken from toLocaleDateString so the grid reads the
// same whatever locale the machine happens to be set to.
import { tList } from "../i18n";

export const DAYS_SHORT = tList("days.short", [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
]);
export const DAYS_MIN = tList("days.min", [
    "Su",
    "Mo",
    "Tu",
    "We",
    "Th",
    "Fr",
    "Sa",
]);
export const MONTHS_SHORT = tList("months.short", [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]);
export const MONTHS = tList("months.long", [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]);
