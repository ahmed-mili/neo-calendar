import * as React from "react";
import * as ReactDOM from "react-dom";
import { TaskStatus } from "../tasks";
import { CalendarInfo } from "../../types";
import { DAY_MAP, formatDateLong } from "./EventPanel.helpers";
import { placeFlyout } from "./flyoutPlacement";
import {
    RecurrenceState,
    Freq,
    PresetKey,
    DayCode,
    presetToRecurrence,
    matchPreset,
    recurrenceSummary,
    orderedDayCodes,
    dayCodeOf,
} from "./recurrence";
import {
    ChevronDownIcon,
    LinkIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    CheckIcon as CheckMarkIcon,
    CopyIcon,
    DuplicateIcon,
    TrashIcon,
    FileTextIcon as NoteIcon,
} from "./Icons";
import {
    addDays,
    getWeekStart,
    isToday,
    isSameDay,
    DAYS_MIN,
    MONTHS_SHORT,
} from "./CalendarUtils";
import { urlMarkdown } from "./linkInput";
import { LinkKind, linkKind } from "./linkKind";
import { pageTitleFrom, safeLabel, withDeadline } from "./linkTitle";
import { BrandIcon } from "./BrandIcons";
import {
    ClockIcon,
    CalendarIcon,
    CheckIcon,
    DocIcon,
    LinesIcon,
    RepeatIcon,
    DotsIcon,
    XIcon,
    FileTextIcon,
    ArrowRightIcon,
    GlobeIcon,
    MailIcon,
    PhoneIcon,
} from "./EventPanelIcons";
import { t } from "../i18n";
import { isAndroidRuntime } from "./CalendarUtils";
import { swallowNextClick } from "./swallowNextClick";

function getEventPanelPortalTarget(): HTMLElement {
    const isAndroid =
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body.classList.contains(
            "nc-platform-android"
        ) ||
        document.documentElement.dataset.neoCalendarPlatform ===
            "android";

    return isAndroid
        ? document.getElementById(
              "nc-android-overlay-root"
          ) ?? document.body
        : document.body;
}
function ObsidianColorIcon() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M9.643 14.012c.615-.183 1.605-.465 2.745-.534-.684-1.725-.849-3.235-.716-4.579.153-1.552.7-2.847 1.234-3.95.114-.235.223-.454.328-.664.149-.297.289-.577.42-.86.217-.47.378-.885.46-1.27.08-.38.08-.719-.014-1.044-.095-.325-.297-.675-.681-1.06a1.6 1.6 0 00-1.475.36l-4.95 4.453a1.602 1.602 0 00-.512.952l-.427 2.83c.67.592 2.327 2.317 3.335 4.71.09.213.174.432.253.656zM5.855 9.937c-.024.1-.057.197-.099.29L3.14 16.058a1.602 1.602 0 00.313 1.772l4.117 4.24c2.102-3.102 1.795-6.02.835-8.3-.728-1.73-1.832-3.083-2.55-3.833z"
                fill="#A88BFA"
            />
            <path
                d="M8.52 22.57c.073.01.146.018.22.02.781.023 2.095.091 3.16.288.87.16 2.593.642 4.011 1.056 1.082.316 2.197-.548 2.354-1.664.115-.814.33-1.735.725-2.58l-.009.004c-.67-1.87-1.523-3.077-2.417-3.847a5.294 5.294 0 00-2.777-1.258c-1.541-.216-2.952.189-3.841.45.532 2.218.368 4.828-1.425 7.53z"
                fill="#A88BFA"
            />
            <path
                d="M19.676 18.538a69.072 69.072 0 001.858-2.952.811.811 0 00-.061-.901c-.516-.684-1.504-2.075-2.042-3.362-.554-1.323-.636-3.378-.64-4.378a1.708 1.708 0 00-.359-1.051L15.235 1.83a3.757 3.757 0 01-.076.545c-.107.503-.307 1.004-.536 1.498-.135.29-.29.601-.446.915-.105.21-.21.42-.31.626-.517 1.068-.998 2.227-1.132 3.59-.125 1.262.046 2.73.814 4.484.128.01.257.025.386.043a6.364 6.364 0 013.327 1.506c.916.79 1.743 1.921 2.414 3.5z"
                fill="#A88BFA"
            />
        </svg>
    );
}

// ── Header ──────────────────────────────────────────────────

interface PanelHeaderProps {
    isDraft: boolean;
    editable: boolean;
    eventId: string | null;
    menuOpen: boolean;
    menuRef: React.RefObject<HTMLDivElement>;
    onHeaderMouseDown: (e: React.MouseEvent) => void;
    onToggleMenu: () => void;
    onOpenFile: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onDeleteClick: () => void;
    onClose: () => void;
    /** The grab area on a touch screen — see useSheetDrag. */
    headerRef?: React.RefObject<HTMLDivElement>;
}

export function PanelHeader({
    isDraft,
    editable,
    eventId,
    menuOpen,
    menuRef,
    headerRef,
    onHeaderMouseDown,
    onToggleMenu,
    onOpenFile,
    onDuplicate,
    onDeleteClick,
    onClose,
}: PanelHeaderProps) {
    const android = isAndroidRuntime();
    return (
        <div
            className="nc-panel-header"
            ref={headerRef}
            onMouseDown={onHeaderMouseDown}
        >
            <span className="nc-panel-header-label">{t("Event")}</span>
            <div className="nc-panel-header-actions">
                <div className="nc-panel-menu-wrap" ref={menuRef}>
                    <button
                        type="button"
                        className="nc-panel-icon-btn"
                        title={t("More")}
                        onClick={onToggleMenu}
                    >
                        <DotsIcon />
                    </button>
                    {menuOpen && (
                        <div className="nc-panel-menu">
                            {/* The sheet already carries a "View note" button at
                                its foot on a phone, and opening the note is not
                                what the menu gets used for there. The slot goes
                                to duplicating instead, which has no other way in
                                without a keyboard or a right click. */}
                            {!isDraft && eventId && !android && (
                                <button
                                    type="button"
                                    className="nc-panel-menu-item"
                                    onClick={() => onOpenFile(eventId)}
                                >
                                    <NoteIcon size={15} />
                                    <span>{t("Open note")}</span>
                                </button>
                            )}
                            {!isDraft &&
                                editable &&
                                eventId &&
                                android &&
                                onDuplicate && (
                                    <button
                                        type="button"
                                        className="nc-panel-menu-item"
                                        onClick={() => onDuplicate(eventId)}
                                    >
                                        <DuplicateIcon size={15} />
                                        <span>{t("Duplicate")}</span>
                                    </button>
                                )}
                            {!isDraft && editable && eventId && (
                                <button
                                    type="button"
                                    className="nc-panel-menu-item nc-danger"
                                    onClick={onDeleteClick}
                                >
                                    <TrashIcon size={15} />
                                    <span>{t("Delete event")}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {/*
                  * On a phone this closes on pointer-up rather than on click.
                  *
                  * The first tap on a sheet that has a focused field spends
                  * itself dismissing the keyboard: the layout shifts under the
                  * finger between press and release, the release no longer
                  * lands on the button it started on, and the browser never
                  * synthesises a click. The X needed two taps, and the first
                  * one looked like it had done something else entirely.
                  * Pointer-up is delivered to the element the press began on,
                  * whatever moved in between.
                  *
                  * Closing that early is what makes the guard below necessary:
                  * the sheet is gone by the time the tap's click is delivered,
                  * and the corner it occupied belongs to the calendar's app bar
                  * — the search icon and the today badge sit at exactly these
                  * coordinates. Until the guard, closing the sheet opened the
                  * search bar.
                  */}
                <button
                    type="button"
                    className="nc-panel-icon-btn"
                    title={t("Close")}
                    onPointerUp={
                        isAndroidRuntime()
                            ? (event) => {
                                  event.preventDefault();
                                  swallowNextClick();
                                  onClose();
                              }
                            : undefined
                    }
                    onClick={isAndroidRuntime() ? undefined : onClose}
                >
                    <XIcon />
                </button>
            </div>
        </div>
    );
}

// ── Title row ───────────────────────────────────────────────

interface TitleRowProps {
    title: string;
    editable: boolean;
    inputRef: React.RefObject<HTMLInputElement>;
    onChange: (v: string) => void;
    onCommit: () => void;
}

export function TitleRow({
    title,
    editable,
    inputRef,
    onChange,
    onCommit,
}: TitleRowProps) {
    return (
        <div className="nc-panel-title-row">
            <span className="nc-panel-title-icon">
                <FileTextIcon />
            </span>
            <input
                ref={inputRef}
                type="text"
                className="nc-panel-title-input"
                value={title}
                placeholder={t("Event Name")}
                required
                onChange={(e) => onChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                    }
                }}
                readOnly={!editable}
            />
        </div>
    );
}

// ── Date / time / chips row ────────────────────────────────

interface DateRowProps {
    date: string;
    dateLabel: string;
    /** End-date label, shown only when the event crosses midnight (ends the
        next day) — like Notion's two-date display. Empty otherwise. */
    endDateLabel?: string;
    startTime: string;
    endTime: string;
    duration: string;
    allDay: boolean;
    isRecurring: boolean;
    editable: boolean;
    firstDay: number;
    setDate: (v: string) => void;
    setStartTime: (v: string) => void;
    setEndTime: (v: string) => void;
    toggleAllDay: () => void;
    toggleRecurring: () => void;
    onAutoSave: () => void;
}

// ── Date picker (portaled month grid, Notion-style) ─────────
// Replaces the native <input type="date">, whose calendar popup is OS-drawn
// (square corners, OS color-scheme — a white sheet on a dark app when Windows
// is in light mode) and can't be themed to match the panel. Mirrors the panel's
// other portaled menus: a label trigger + a portaled rounded glass month grid.

/** Parse a yyyy-mm-dd string as a LOCAL date. `new Date("yyyy-mm-dd")` parses
    as UTC midnight, which lands on the previous day west of UTC — so the grid
    would highlight the wrong cell. Fall back to today on a malformed value. */
function parseISODate(s: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return new Date();
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a Date back to yyyy-mm-dd using LOCAL fields (mirror of parseISODate
    — toISOString() would shift the day for the same UTC reason). */
function toISODate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
}

// Estimated popup size, used to decide flip-up / pull-left before it mounts (no
// post-mount measure → no reposition flicker). The grid is fixed-structure:
// header + weekday row + 6 day rows + footer.
const DATEPICKER_W = 252;
const DATEPICKER_H = 300;

/** Notion-style date: a clickable trigger opening a custom themed month grid.
    The same popup serves both the main date row (a borderless label trigger,
    the default) and the recurrence "Ends → On" field (a bordered field trigger,
    via `triggerClassName`) — one date-picker vocabulary, two trigger skins. */
function DateField({
    date,
    label,
    editable,
    firstDay,
    setDate,
    onAutoSave,
    triggerClassName = "nc-panel-date-btn",
}: {
    date: string;
    label: string;
    editable: boolean;
    firstDay: number;
    setDate: (v: string) => void;
    onAutoSave: () => void;
    triggerClassName?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
        null
    );
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const selected = React.useMemo(() => parseISODate(date), [date]);
    // The month shown in the grid; (re)seeded from the selected date on open.
    const [viewMonth, setViewMonth] = React.useState<Date>(
        () => new Date(selected.getFullYear(), selected.getMonth(), 1)
    );

    const openMenu = () => {
        const br = btnRef.current?.getBoundingClientRect();
        if (br) {
            let top = br.bottom + 6;
            // Flip above the trigger when it would overflow the viewport bottom.
            if (top + DATEPICKER_H > window.innerHeight - 8) {
                top = Math.max(8, br.top - DATEPICKER_H - 6);
            }
            // Center the grid under the event panel, not under the date button:
            // the button sits indented past the row icon, so anchoring to its
            // left edge shoves the popup to the right of the panel. Centering on
            // the panel rect gives equal gutters on both sides.
            const panel = btnRef.current?.closest(".nc-event-popup");
            let left;
            if (panel) {
                const pr = panel.getBoundingClientRect();
                left = pr.left + (pr.width - DATEPICKER_W) / 2;
            } else {
                left = br.left;
            }
            // Clamp to the viewport so it never bleeds off either edge.
            left = Math.max(
                8,
                Math.min(left, window.innerWidth - 8 - DATEPICKER_W)
            );
            setPos({ top, left });
        }
        setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
        setOpen(true);
    };

    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t)) return;
            if (menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const gridStart = getWeekStart(new Date(year, month, 1), firstDay);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const weekdays = Array.from(
        { length: 7 },
        (_, i) => DAYS_MIN[(firstDay + i) % 7]
    );

    const pick = (day: Date) => {
        setDate(toISODate(day));
        setOpen(false);
        onAutoSave();
    };

    return (
        <span className="nc-panel-date-field">
            <button
                type="button"
                ref={btnRef}
                className={triggerClassName}
                aria-expanded={open}
                disabled={!editable}
                onClick={() => (open ? setOpen(false) : openMenu())}
            >
                {label || date || t("Add date")}
            </button>
            {open &&
                pos &&
                ReactDOM.createPortal(
                    <div
                        className="nc-datepicker"
                        role="dialog"
                        aria-label={t("Pick a date")}
                        ref={menuRef}
                        style={{ top: pos.top, left: pos.left }}
                    >
                        <div className="nc-datepicker-header">
                            <button
                                type="button"
                                className="nc-datepicker-nav"
                                title={t("Previous month")}
                                onClick={() =>
                                    setViewMonth(new Date(year, month - 1, 1))
                                }
                            >
                                <ChevronLeftIcon />
                            </button>
                            <span className="nc-datepicker-title">
                                {MONTHS_SHORT[month]} {year}
                            </span>
                            <button
                                type="button"
                                className="nc-datepicker-nav"
                                title={t("Next month")}
                                onClick={() =>
                                    setViewMonth(new Date(year, month + 1, 1))
                                }
                            >
                                <ChevronRightIcon />
                            </button>
                        </div>
                        <div className="nc-datepicker-grid">
                            {weekdays.map((w, i) => (
                                <div
                                    key={`wd${i}`}
                                    className="nc-datepicker-weekday"
                                >
                                    {w}
                                </div>
                            ))}
                            {days.map((day, i) => {
                                const out = day.getMonth() !== month;
                                const today = isToday(day);
                                const sel = isSameDay(day, selected);
                                return (
                                    <button
                                        type="button"
                                        key={i}
                                        className={`nc-datepicker-day${
                                            out ? " nc-out" : ""
                                        }${today ? " nc-today" : ""}${
                                            sel ? " nc-selected" : ""
                                        }`}
                                        onClick={() => pick(day)}
                                    >
                                        {day.getDate()}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="nc-datepicker-foot">
                            <button
                                type="button"
                                className="nc-datepicker-today-btn"
                                onClick={() => pick(new Date())}
                            >
                                Today
                            </button>
                        </div>
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </span>
    );
}

export function DateRow({
    date,
    dateLabel,
    endDateLabel,
    startTime,
    endTime,
    duration,
    allDay,
    isRecurring,
    editable,
    firstDay,
    setDate,
    setStartTime,
    setEndTime,
    toggleAllDay,
    toggleRecurring,
    onAutoSave,
}: DateRowProps) {
    return (
        <div className="nc-panel-row">
            <span className="nc-panel-row-icon nc-panel-row-icon-clock">
                {/* A fixed clock icon for the date/time row, whatever the mode.
                   Kept fixed (not swapped per all-day toggle) so it never jumps
                   between states — same icon, position and size throughout. */}
                <ClockIcon />
            </span>
            <div className="nc-panel-row-content">
                {/* Notion layout: the time range on one line (times close to the
                    arrow), the date(s) on the line below.

                    One single markup for both modes so the times/arrow render
                    IDENTICALLY — only the muted effect differs. When all-day,
                    the row's previous times (still in form state right after the
                    toggle) are shown read-only and faded as a memory of what was
                    set; they vanish on the next open because an all-day event
                    persists no times (startTime is then empty, so the row is
                    skipped). Using the same <input type=time> elements in both
                    states — not spans — keeps the glyph rendering pixel-identical;
                    the all-day state just adds opacity and read-only. */}
                {(!allDay || startTime) && (
                    <div
                        className={`nc-panel-time-row${
                            allDay ? " nc-panel-time-row-muted" : ""
                        }`}
                        aria-hidden={allDay ? "true" : undefined}
                    >
                        <input
                            type="time"
                            className="nc-panel-time-input"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            onBlur={onAutoSave}
                            readOnly={!editable || allDay}
                        />
                        <span className="nc-panel-arrow">
                            <ArrowRightIcon />
                        </span>
                        <input
                            type="time"
                            className="nc-panel-time-input"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            onBlur={onAutoSave}
                            readOnly={!editable || allDay}
                        />
                        {duration && (
                            <span className="nc-panel-duration">
                                {duration}
                            </span>
                        )}
                    </div>
                )}
                <div className="nc-panel-date-line">
                    <DateField
                        date={date}
                        label={dateLabel}
                        editable={editable}
                        firstDay={firstDay}
                        setDate={setDate}
                        onAutoSave={onAutoSave}
                    />
                    {endDateLabel && (
                        <>
                            <span className="nc-panel-arrow">
                                <ArrowRightIcon />
                            </span>
                            <span className="nc-panel-date-label">
                                {endDateLabel}
                            </span>
                        </>
                    )}
                </div>
                {editable && (
                    <div className="nc-panel-chips">
                        <button
                            type="button"
                            className={`nc-chip ${allDay ? "nc-active" : ""}`}
                            onClick={toggleAllDay}
                        >
                            {t("All-day")}
                        </button>
                        <button
                            type="button"
                            className={`nc-chip ${
                                isRecurring ? "nc-active" : ""
                            }`}
                            onClick={toggleRecurring}
                        >
                            {t("Repeat")}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Custom select (portaled dropdown, Notion-style) ─────────
// Replaces the native <select>, whose option popup is OS-drawn (square corners,
// flat highlight) and can't be themed to match the panel. Mirrors the calendar
// selector's pattern: a field-styled trigger + a portaled rounded glass menu.

interface NcSelectOption {
    value: string;
    label: React.ReactNode;
}

interface NcSelectProps {
    value: string;
    options: NcSelectOption[];
    onChange: (value: string) => void;
    /** Extra class on the trigger (used for width). */
    className?: string;
}

function NcSelect({ value, options, onChange, className }: NcSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{
        top: number | null;
        bottom: number | null;
        left: number;
        minWidth: number;
        maxHeight: number;
    } | null>(null);
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const openMenu = () => {
        const br = btnRef.current?.getBoundingClientRect();
        if (br) {
            // placeFlyout bascule le menu au-dessus du bouton quand le dessous
            // ne peut plus offrir une hauteur lisible : ouvrir toujours vers le
            // bas faisait sortir les dernieres options de l'ecran des que le
            // bouton etait bas (typiquement clavier virtuel ouvert).
            const p = placeFlyout(br, window.innerHeight, {
                gap: 4,
                margin: 12,
                minHeight: 140,
            });
            setMenuPos({
                top: p.top,
                bottom: p.bottom,
                left: br.left,
                minWidth: br.width,
                maxHeight: p.maxHeight,
            });
        }
        setOpen(true);
    };

    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t)) return;
            if (menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);

    const current = options.find((o) => o.value === value);

    return (
        <div className="nc-select-wrap">
            <button
                type="button"
                ref={btnRef}
                className={`nc-select ${className || ""}`}
                aria-expanded={open}
                onClick={() => (open ? setOpen(false) : openMenu())}
            >
                <span className="nc-select-label">{current?.label}</span>
                <span className="nc-select-chevron">
                    <ChevronDownIcon size={14} />
                </span>
            </button>
            {open &&
                menuPos &&
                ReactDOM.createPortal(
                    <div
                        className="nc-select-menu"
                        role="listbox"
                        ref={menuRef}
                        style={{
                            // Un seul des deux ancrages est pose : `bottom`
                            // quand le menu s'ouvre vers le haut, ce qui evite
                            // d'avoir a connaitre sa hauteur d'avance.
                            top: menuPos.top ?? undefined,
                            bottom: menuPos.bottom ?? undefined,
                            left: menuPos.left,
                            minWidth: menuPos.minWidth,
                            maxHeight: menuPos.maxHeight,
                        }}
                    >
                        {options.map((o) => (
                            <button
                                type="button"
                                key={o.value}
                                role="option"
                                aria-selected={o.value === value}
                                className={`nc-select-option${
                                    o.value === value ? " nc-active" : ""
                                }`}
                                onClick={() => {
                                    onChange(o.value);
                                    setOpen(false);
                                }}
                            >
                                <span className="nc-select-check">
                                    {o.value === value && (
                                        <CheckMarkIcon size={14} />
                                    )}
                                </span>
                                <span className="nc-select-option-label">
                                    {o.label}
                                </span>
                            </button>
                        ))}
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </div>
    );
}

// ── Recurrence row ─────────────────────────────────────────

interface RecurrenceRowProps {
    recurrence: RecurrenceState;
    startDate: string;
    firstDay: number;
    setRecurrence: (r: RecurrenceState) => void;
    onAutoSave: () => void;
}

const PRESETS: { key: PresetKey; label: string }[] = [
    { key: "daily", label: t("Daily") },
    { key: "weekly", label: t("Weekly") },
    { key: "monthly", label: t("Monthly") },
    { key: "yearly", label: t("Yearly") },
    { key: "custom", label: t("Custom") },
];

export function RecurrenceRow({
    recurrence,
    startDate,
    firstDay,
    setRecurrence,
    onAutoSave,
}: RecurrenceRowProps) {
    const [showCustom, setShowCustom] = React.useState(false);
    const preset = matchPreset(recurrence, startDate);
    const isCustomOpen = showCustom || preset === "custom";
    const activeKey = isCustomOpen ? "custom" : preset;
    const update = (patch: Partial<RecurrenceState>) =>
        setRecurrence({ ...recurrence, ...patch });
    const commit = () => onAutoSave();

    const toggleDay = (code: DayCode) => {
        const has = recurrence.byDay.includes(code);
        let next = has
            ? recurrence.byDay.filter((c) => c !== code)
            : [...recurrence.byDay, code];
        if (next.length === 0) next = [dayCodeOf(startDate)]; // guard: never empty
        setRecurrence({ ...recurrence, byDay: next });
    };

    return (
        <div className="nc-panel-row">
            <span className="nc-panel-row-icon">
                <RepeatIcon />
            </span>
            <div className="nc-panel-row-content">
                <div className="nc-recur-summary">
                    {recurrenceSummary(recurrence, startDate)}
                </div>

                <div className="nc-recur-presets">
                    {PRESETS.map((p) => (
                        <button
                            type="button"
                            key={p.key}
                            className={`nc-chip ${
                                activeKey === p.key ? "nc-active" : ""
                            }`}
                            onClick={() => {
                                if (p.key === "custom") {
                                    setShowCustom(true);
                                } else {
                                    setShowCustom(false);
                                    setRecurrence(
                                        presetToRecurrence(p.key, startDate)
                                    );
                                    onAutoSave();
                                }
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {isCustomOpen && (
                    <div className="nc-recur-custom">
                        <div className="nc-recur-interval">
                            <span>{t("Every")}</span>
                            <input
                                type="number"
                                min={1}
                                className="nc-recur-num"
                                value={recurrence.interval}
                                onChange={(e) =>
                                    update({
                                        interval: Math.max(
                                            1,
                                            Number(e.target.value) || 1
                                        ),
                                    })
                                }
                                onBlur={commit}
                            />
                            <NcSelect
                                className="nc-recur-freq"
                                value={recurrence.freq}
                                options={[
                                    { value: "daily", label: t("day(s)") },
                                    { value: "weekly", label: t("week(s)") },
                                    { value: "monthly", label: t("month(s)") },
                                    { value: "yearly", label: t("year(s)") },
                                ]}
                                onChange={(v) => {
                                    const freq = v as Freq;
                                    const byDay =
                                        freq === "weekly"
                                            ? [dayCodeOf(startDate)]
                                            : [];
                                    update({ freq, byDay });
                                    onAutoSave();
                                }}
                            />
                        </div>

                        {recurrence.freq === "weekly" && (
                            <div className="nc-day-picker">
                                {orderedDayCodes(firstDay).map((code) => (
                                    <button
                                        type="button"
                                        key={code}
                                        className={`nc-day-btn ${
                                            recurrence.byDay.includes(code)
                                                ? "nc-active"
                                                : ""
                                        }`}
                                        onClick={() => {
                                            toggleDay(code);
                                            onAutoSave();
                                        }}
                                    >
                                        {DAY_MAP[code]}
                                    </button>
                                ))}
                            </div>
                        )}

                        {recurrence.freq === "monthly" && (
                            <NcSelect
                                className="nc-recur-monthmode"
                                value={recurrence.monthMode}
                                options={[
                                    {
                                        value: "dayOfMonth",
                                        label: `Monthly on day ${Number(
                                            startDate.slice(8, 10)
                                        )}`,
                                    },
                                    {
                                        value: "dayOfWeek",
                                        label: "Monthly on the nth weekday",
                                    },
                                ]}
                                onChange={(v) => {
                                    update({ monthMode: v as any });
                                    onAutoSave();
                                }}
                            />
                        )}

                        <div className="nc-recur-end">
                            <span className="nc-panel-subrow-label">{t("Ends")}</span>
                            <label>
                                <input
                                    type="radio"
                                    name="recur-end"
                                    checked={recurrence.end.kind === "never"}
                                    onChange={() => {
                                        update({ end: { kind: "never" } });
                                        onAutoSave();
                                    }}
                                />
                                Never
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="recur-end"
                                    checked={recurrence.end.kind === "until"}
                                    onChange={() => {
                                        update({
                                            end: {
                                                kind: "until",
                                                date: startDate,
                                            },
                                        });
                                        onAutoSave();
                                    }}
                                />
                                On
                                <DateField
                                    triggerClassName="nc-panel-date-trigger"
                                    date={
                                        recurrence.end.kind === "until"
                                            ? recurrence.end.date
                                            : ""
                                    }
                                    label={
                                        recurrence.end.kind === "until"
                                            ? formatDateLong(
                                                  recurrence.end.date
                                              )
                                            : ""
                                    }
                                    editable={recurrence.end.kind === "until"}
                                    firstDay={firstDay}
                                    setDate={(v) =>
                                        update({
                                            end: { kind: "until", date: v },
                                        })
                                    }
                                    onAutoSave={onAutoSave}
                                />
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="recur-end"
                                    checked={recurrence.end.kind === "count"}
                                    onChange={() => {
                                        update({
                                            end: { kind: "count", count: 13 },
                                        });
                                        onAutoSave();
                                    }}
                                />
                                After
                                <input
                                    type="number"
                                    min={1}
                                    className="nc-recur-num"
                                    disabled={recurrence.end.kind !== "count"}
                                    value={
                                        recurrence.end.kind === "count"
                                            ? recurrence.end.count
                                            : 13
                                    }
                                    onChange={(e) =>
                                        update({
                                            end: {
                                                kind: "count",
                                                count: Math.max(
                                                    1,
                                                    Number(e.target.value) || 1
                                                ),
                                            },
                                        })
                                    }
                                    onBlur={commit}
                                />
                                occurrences
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Calendar select row ────────────────────────────────────

interface CalendarRowProps {
    editableCalendars: {
        id: string;
        name: string;
        color: string;
        type: CalendarInfo["type"];
    }[];
    calendarIndex: number;
    editable: boolean;
    /**
     * The calendar of a read-only event (holiday feed, .ics). It is absent from
     * `editableCalendars`, so without it the row would show an unrelated
     * calendar — the first editable one — as if the event lived there.
     */
    readOnlyCalendar?: { name: string; color: string } | null;
    onChange: (idx: number) => void;
    onAutoSave: () => void;
}

export function CalendarRow({
    editableCalendars,
    calendarIndex,
    readOnlyCalendar,
    editable,
    onChange,
    onAutoSave,
}: CalendarRowProps) {
    const [open, setOpen] = React.useState(false);
    // Menu is portaled to <body> so it floats ABOVE the panel instead of
    // expanding inside it (which would overflow .nc-panel-body and force a
    // scrollbar on the panel). Positioned in viewport coords from the row.
    const [menuPos, setMenuPos] = React.useState<{
        top: number | null;
        left: number;
        width: number;
        maxHeight: number;
        bottom: number | null;
    } | null>(null);
    const rowRef = React.useRef<HTMLDivElement>(null);
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const openMenu = () => {
        const br = btnRef.current?.getBoundingClientRect();
        if (br) {
            // Anchor the menu directly on the trigger button: same left/width as
            // the button's box. The button already carries `margin: -8px`, so it
            // sits with equal 8px gutters inside the row — inheriting its rect
            // makes the menu symmetric (centred) by construction instead of
            // deriving left/width from the row with a fixed min-width that
            // overflowed the panel on the right when the panel was narrow.
            // La hauteur se borne a la place disponible du cote retenu (le menu
            // ne defile donc que si la liste ne tient vraiment pas, comme
            // Notion), et placeFlyout bascule le menu au-dessus du bouton quand
            // le dessous est trop court — sinon les derniers calendriers de la
            // liste sortaient de l'ecran.
            const p = placeFlyout(br, window.innerHeight, {
                gap: 5,
                margin: 12,
                minHeight: 160,
            });
            setMenuPos({
                top: p.top,
                bottom: p.bottom,
                left: br.left,
                width: br.width,
                maxHeight: p.maxHeight,
            });
        }
        setOpen(true);
    };

    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (rowRef.current?.contains(t)) return;
            if (menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);

    type Cal = CalendarRowProps["editableCalendars"][number];
    const nameFor = (cal: Cal) => cal.name || t("Daily notes");
    // The calendar's storage type, shown muted after the name (Notion shows
    // "Table"; ours shows the vault-source kind: a note per event, or a daily
    // note). Mirrors CalendarInfo["type"].
    const typeFor = (cal: Cal) =>
        cal.type === "dailynote" ? t("Daily") : t("Note");
    const editableCurrent =
        editableCalendars[calendarIndex] || editableCalendars[0];
    // A read-only event shows its own calendar, and no storage badge: "Note"
    // would promise a note in the vault that these events don't have.
    const current = readOnlyCalendar ?? editableCurrent;
    const badge = readOnlyCalendar
        ? null
        : editableCurrent && typeFor(editableCurrent);

    return (
        <div className="nc-panel-row nc-panel-row-cal" ref={rowRef}>
            <button
                type="button"
                className="nc-cal-select"
                ref={btnRef}
                aria-expanded={open}
                disabled={!editable}
                onClick={() => editable && (open ? setOpen(false) : openMenu())}
            >
                {current && (
                    <span
                        className="nc-cal-dot"
                        style={{ background: current.color }}
                    />
                )}
                <span className="nc-cal-select-name">
                    {current ? current.name || "Daily notes" : ""}
                </span>
                {badge && <span className="nc-cal-select-type">{badge}</span>}
                {editable && (
                    <span className="nc-cal-select-chevron">
                        <ChevronDownIcon size={14} />
                    </span>
                )}
            </button>
            {open &&
                menuPos &&
                ReactDOM.createPortal(
                    <div
                        className="nc-cal-select-menu"
                        role="menu"
                        ref={menuRef}
                        style={{
                            // Un seul des deux ancrages est pose (voir
                            // placeFlyout) : `bottom` quand le menu s'ouvre vers
                            // le haut.
                            top: menuPos.top ?? undefined,
                            bottom: menuPos.bottom ?? undefined,
                            left: menuPos.left,
                            width: menuPos.width,
                            maxHeight: menuPos.maxHeight,
                        }}
                    >
                        <div className="nc-cal-select-heading">{t("Calendar")}</div>
                        {editableCalendars.map((cal, i) => (
                            <button
                                key={cal.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={i === calendarIndex}
                                className={`nc-cal-select-option${
                                    i === calendarIndex ? " nc-active" : ""
                                }`}
                                onClick={() => {
                                    onChange(i);
                                    setOpen(false);
                                    onAutoSave();
                                }}
                            >
                                <span className="nc-cal-select-check">
                                    {i === calendarIndex && (
                                        <CheckMarkIcon size={14} />
                                    )}
                                </span>
                                <span
                                    className="nc-cal-dot"
                                    style={{ background: cal.color }}
                                />
                                <span className="nc-cal-select-name">
                                    {nameFor(cal)}
                                </span>
                                <span className="nc-cal-select-type">
                                    {typeFor(cal)}
                                </span>
                            </button>
                        ))}
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </div>
    );
}

// ── Deadline row ───────────────────────────────────────────

interface DueRowProps {
    due: string | null;
    editable: boolean;
    firstDay: number;
    /** Suggested day when adding a deadline to a task that has none. */
    fallbackDate: string;
    setDue: (value: string | null) => void;
    onAutoSave: () => void;
}

/**
 * A task's deadline — the day it is owed by, not the day set aside for it.
 *
 * Kept a separate row from Date on purpose. They answer different questions
 * ("when will I do this" vs "when must this be done"), they disagree often, and
 * collapsing them is what forces lateness to be judged from the wrong day. The
 * row only appears once an entry is a task: an event has no deadline, it *is*
 * its date.
 *
 * Optional by design — most tasks never need one, so an unset deadline shows a
 * quiet "add" affordance rather than a date pretending to be meaningful.
 */
export function DueRow({
    due,
    editable,
    firstDay,
    fallbackDate,
    setDue,
    onAutoSave,
}: DueRowProps) {
    return (
        <div className="nc-panel-row nc-panel-row-inline">
            <span className="nc-panel-row-icon">
                <CalendarIcon />
            </span>
            <div className="nc-panel-row-label">{t("Deadline")}</div>
            {due ? (
                <span className="nc-panel-due-value">
                    <DateField
                        date={due}
                        label={formatDateLong(due)}
                        editable={editable}
                        firstDay={firstDay}
                        setDate={(value) => setDue(value)}
                        onAutoSave={onAutoSave}
                    />
                    {editable && (
                        <button
                            type="button"
                            className="nc-panel-due-clear"
                            title={t("Remove deadline")}
                            aria-label={t("Remove deadline")}
                            onClick={() => {
                                setDue(null);
                                onAutoSave();
                            }}
                        >
                            <XIcon />
                        </button>
                    )}
                </span>
            ) : (
                <button
                    type="button"
                    className="nc-panel-due-add"
                    disabled={!editable}
                    onClick={() => {
                        setDue(fallbackDate);
                        onAutoSave();
                    }}
                >
                    {t("Add deadline")}
                </button>
            )}
        </div>
    );
}

// ── Type row ───────────────────────────────────────────────

interface TypeRowProps {
    isTask: boolean;
    editable: boolean;
    setIsTask: (isTask: boolean) => void;
}

/**
 * Event or task — the choice, made explicitly.
 *
 * The two are one object in the schema, told apart only by whether they carry
 * a `completed` field, so this row is simply what switches that field on and
 * off. An event occupies a slot and is over when it has passed; a task is
 * something to get done and keeps a done/not-done state until it is.
 *
 * A recurring series has nowhere to record "done" (the schema gives
 * `completed` to `single` and `someday` only), so the panel hides this row for
 * recurring events rather than offering a choice that cannot be saved.
 */
export function TypeRow({ isTask, editable, setIsTask }: TypeRowProps) {
    return (
        <div className="nc-panel-row nc-panel-row-inline">
            <span className="nc-panel-row-icon">
                <DocIcon />
            </span>
            <div className="nc-panel-row-label">{t("Type")}</div>
            <div className="nc-type-group" role="group">
                <button
                    type="button"
                    className={`nc-type-pill ${!isTask ? "nc-active" : ""}`}
                    onClick={() => editable && setIsTask(false)}
                    disabled={!editable}
                    aria-pressed={!isTask}
                >
                    {t("Event")}
                </button>
                <button
                    type="button"
                    className={`nc-type-pill ${isTask ? "nc-active" : ""}`}
                    onClick={() => editable && setIsTask(true)}
                    disabled={!editable}
                    aria-pressed={isTask}
                >
                    {t("Task")}
                </button>
            </div>
        </div>
    );
}

// ── Status row ─────────────────────────────────────────────

interface StatusRowProps {
    taskStatus: TaskStatus | null;
    editable: boolean;
    setStatus: (s: TaskStatus) => void;
}

export function StatusRow({ taskStatus, editable, setStatus }: StatusRowProps) {
    // Single pill showing the current status, aligned right (Notion-style).
    // Clicking it toggles between the two states.
    const status = taskStatus === "complete" ? "complete" : "todo";
    const next = status === "todo" ? "complete" : "todo";
    return (
        <div className="nc-panel-row nc-panel-row-inline">
            <span className="nc-panel-row-icon">
                <CheckIcon />
            </span>
            <div className="nc-panel-row-label">{t("Status")}</div>
            <button
                type="button"
                className={`nc-status-pill nc-status-${status} nc-active`}
                onClick={() => editable && setStatus(next)}
                disabled={!editable}
            >
                <span className={`nc-status-dot nc-dot-${status}`} />
                {/* Both labels are rendered stacked in one grid cell; the
                    inactive one stays hidden but still reserves width, so the
                    pill keeps a constant size when toggling. */}
                <span className="nc-status-pill-label">
                    <span className={status === "todo" ? "is-on" : ""}>
                        {t("To do")}
                    </span>
                    <span className={status === "complete" ? "is-on" : ""}>
                        {t("Complete")}
                    </span>
                </span>
            </button>
        </div>
    );
}

// ── Links and attachments row ──────────────────────────────

interface LinkVaultOption {
    path: string;
    name: string;
}

interface LinkSearchTarget {
    id: string;
    vaultPath: string;
    vaultName: string;
    title: string;
    relativePath: string;
    detail: string;
    markdown: string;
}

interface LinkedFileItem {
    id: string;
    label: string;
    target: string;
    kind: "note" | "attachment" | "web";
}

/** How long adding a link waits for the page to name itself. */
const TITLE_DEADLINE_MS = 2500;

interface LinksAttachmentsRowProps {
    eventId: string | null;
    /** Fetches a page's source, off the WebView so no site can refuse it for
        being cross-origin. Absent where there is no such way. */
    onFetchPage?: (url: string) => Promise<string>;
    disabled: boolean;
    vaults: LinkVaultOption[];
    items: LinkedFileItem[];
    onOpenNote: () => void;
    onSearch?: (
        query: string,
        vaultPath?: string
    ) => Promise<LinkSearchTarget[]>;
    onAddLink?: (eventId: string, markdown: string) => Promise<void>;
    onRemoveLink?: (eventId: string, target: string) => Promise<void>;
    onOpenLink?: (item: LinkedFileItem) => Promise<void> | void;
    onPickAttachment?: (eventId: string) => Promise<void>;
}

interface LinkPopoverPosition {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

function splitLinkSearchPath(relativePath: string): {
    fileName: string;
    parentPath: string;
} {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts.pop() || normalized || "Untitled";

    // Keep the most useful end of deeply nested paths. The complete path stays
    // available through the row tooltip and accessibility label.
    const visibleParents = parts.length > 3 ? ["…", ...parts.slice(-3)] : parts;

    return {
        fileName,
        parentPath: visibleParents.join("/"),
    };
}

function linkedItemFileName(item: LinkedFileItem): string {
    let path = item.target;

    // Always inspect the target before trusting the stored kind. Older desktop
    // builds sometimes classified obsidian:// links as generic web links,
    // which made the row display the Markdown label (often a parent folder)
    // instead of the actual note filename.
    if (/^obsidian:\/\//i.test(path)) {
        try {
            const url = new URL(path);
            path = url.searchParams.get("file") ?? path;
        } catch {
            // Fall back to the raw target below.
        }
    } else if (item.kind === "web") {
        return item.label;
    }

    try {
        path = decodeURIComponent(path);
    } catch {
        // Keep the original value when it is not valid percent-encoding.
    }

    const normalized = path
        .replace(/\\/g, "/")
        .split(/[?#]/, 1)[0]
        .replace(/\/+$/, "");
    const name = normalized.slice(normalized.lastIndexOf("/") + 1);

    return name || item.label || "Linked file";
}

/**
 * The glyph for where a link goes. See linkKind.ts for the matching.
 *
 * The brands are their real marks (BrandIcons); the three that are not brands —
 * a website, an address, a number — are drawn here, because a globe and an
 * envelope belong to nobody.
 */
const LINK_GLYPHS: Record<LinkKind, () => JSX.Element> = {
    vault: () => <BrandIcon brand="obsidian" />,
    youtube: () => <BrandIcon brand="youtube" />,
    instagram: () => <BrandIcon brand="instagram" />,
    tiktok: () => <BrandIcon brand="tiktok" />,
    x: () => <BrandIcon brand="x" />,
    github: () => <BrandIcon brand="github" />,
    spotify: () => <BrandIcon brand="spotify" />,
    whatsapp: () => <BrandIcon brand="whatsapp" />,
    reddit: () => <BrandIcon brand="reddit" />,
    mail: MailIcon,
    phone: PhoneIcon,
    web: GlobeIcon,
};

function LinkedFileRow({
    item,
    eventId,
    onRemoveLink,
    onOpenLink,
}: {
    item: LinkedFileItem;
    eventId: string | null;
    onRemoveLink?: (eventId: string, target: string) => Promise<void>;
    onOpenLink?: (item: LinkedFileItem) => Promise<void> | void;
}) {
    const rowRef = React.useRef<HTMLDivElement>(null);
    const hideTimerRef = React.useRef<number | null>(null);
    const [tooltip, setTooltip] = React.useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [removing, setRemoving] = React.useState(false);
    const [opening, setOpening] = React.useState(false);
    const [hovered, setHovered] = React.useState(false);
    const displayName = React.useMemo(() => linkedItemFileName(item), [item]);

    const cancelHide = React.useCallback(() => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const showTooltip = React.useCallback(() => {
        cancelHide();
        setHovered(true);
        const rect = rowRef.current?.getBoundingClientRect();
        if (!rect) return;
        const viewportGap = 8;
        const width = Math.min(
            Math.max(rect.width, 420),
            window.innerWidth - viewportGap * 2
        );
        const left = Math.max(
            viewportGap,
            Math.min(rect.left, window.innerWidth - width - viewportGap)
        );
        const top = Math.max(viewportGap, rect.top - 40);
        setTooltip({ top, left, width });
    }, [cancelHide]);

    const scheduleHide = React.useCallback(() => {
        setHovered(false);
        cancelHide();
        hideTimerRef.current = window.setTimeout(() => {
            setTooltip(null);
            setCopied(false);
        }, 120);
    }, [cancelHide]);

    React.useEffect(
        () => () => {
            cancelHide();
        },
        [cancelHide]
    );

    const copyTarget = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        await navigator.clipboard.writeText(item.target);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };

    const remove = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!eventId || !onRemoveLink || removing) return;
        setRemoving(true);
        try {
            await onRemoveLink(eventId, item.target);
            setTooltip(null);
        } finally {
            setRemoving(false);
        }
    };

    const openLinkedItem = async () => {
        if (!onOpenLink || opening) return;
        cancelHide();
        setHovered(false);
        setTooltip(null);
        rowRef.current?.blur();
        setOpening(true);
        try {
            await onOpenLink(item);
        } finally {
            setOpening(false);
        }
    };

    const activateLinkedItem = (
        event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
    ) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) return;
        event.preventDefault();
        event.stopPropagation();
        void openLinkedItem();
    };

    return (
        <>
            <div
                ref={rowRef}
                className={`nc-linked-file${hovered ? " is-hovered" : ""}`}
                data-clickable={onOpenLink ? "true" : "false"}
                role={onOpenLink ? "link" : undefined}
                tabIndex={onOpenLink ? 0 : undefined}
                aria-label={onOpenLink ? `Open ${displayName}` : undefined}
                aria-busy={opening || undefined}
                onPointerEnter={showTooltip}
                onPointerLeave={scheduleHide}
                onPointerCancel={scheduleHide}
                onMouseDown={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (!target?.closest("button")) {
                        // Mouse activation must never leave a sticky focus/hover
                        // appearance behind. Keyboard focus remains available via Tab.
                        event.preventDefault();
                        setHovered(false);
                        setTooltip(null);
                    }
                }}
                onClick={activateLinkedItem}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        activateLinkedItem(event);
                    }
                }}
            >
                <span className="nc-linked-file-icon" aria-hidden="true">
                    {React.createElement(
                        LINK_GLYPHS[linkKind(item.target, item.kind)]
                    )}
                </span>
                <span className="nc-linked-file-name">{displayName}</span>
                {eventId && onRemoveLink && (
                    <button
                        type="button"
                        className="nc-linked-file-remove"
                        aria-label={`Remove ${displayName}`}
                        disabled={removing}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => void remove(event)}
                    >
                        <XIcon />
                    </button>
                )}
            </div>
            {tooltip &&
                ReactDOM.createPortal(
                    <div
                        className="nc-linked-file-tooltip"
                        style={{
                            top: tooltip.top,
                            left: tooltip.left,
                            width: tooltip.width,
                        }}
                        onMouseEnter={cancelHide}
                        onMouseLeave={scheduleHide}
                    >
                        <span className="nc-linked-file-tooltip-target">
                            {item.target}
                        </span>
                        <button
                            type="button"
                            className="nc-linked-file-copy"
                            aria-label={t("Copy link")}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onClick={(event) => void copyTarget(event)}
                        >
                            {copied ? <CheckMarkIcon /> : <CopyIcon />}
                        </button>
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </>
    );
}

export function LinksAttachmentsRow({
    eventId,
    disabled,
    vaults,
    items,
    onOpenNote,
    onSearch,
    onFetchPage,
    onAddLink,
    onRemoveLink,
    onOpenLink,
    onPickAttachment,
}: LinksAttachmentsRowProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<LinkSearchTarget[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);
    const [position, setPosition] = React.useState<LinkPopoverPosition | null>(
        null
    );
    const inputRef = React.useRef<HTMLInputElement>(null);
    const shellRef = React.useRef<HTMLDivElement>(null);
    const popoverRef = React.useRef<HTMLDivElement>(null);
    const supportsPicker = Boolean(onSearch && onAddLink);

    const closePicker = React.useCallback(() => {
        setOpen(false);
        setQuery("");
        setResults([]);
        setError(null);
        setHighlightedIndex(0);
    }, []);

    const updatePosition = React.useCallback(() => {
        const shell = shellRef.current;
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        const viewportGap = 8;
        const preferredWidth = Math.max(rect.width, 500);
        const width = Math.min(preferredWidth, window.innerWidth - viewportGap * 2);
        const left = Math.max(
            viewportGap,
            Math.min(rect.left, window.innerWidth - width - viewportGap)
        );
        const roomBelow = window.innerHeight - rect.bottom - viewportGap;
        const roomAbove = rect.top - viewportGap;
        const maxHeight = Math.max(150, Math.min(300, Math.max(roomBelow, roomAbove)));
        const openAbove = roomBelow < 180 && roomAbove > roomBelow;
        const top = openAbove
            ? Math.max(viewportGap, rect.top - maxHeight - 4)
            : Math.min(window.innerHeight - viewportGap, rect.bottom + 4);
        setPosition({ top, left, width, maxHeight });
    }, []);

    React.useEffect(() => {
        if (!open) return;
        window.setTimeout(() => {
            updatePosition();
            inputRef.current?.focus();
        }, 0);

        const reposition = () => updatePosition();
        window.addEventListener("resize", reposition);
        document.addEventListener("scroll", reposition, true);
        return () => {
            window.removeEventListener("resize", reposition);
            document.removeEventListener("scroll", reposition, true);
        };
    }, [open, updatePosition]);

    React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (shellRef.current?.contains(target)) return;
            if (popoverRef.current?.contains(target)) return;
            closePicker();
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [closePicker, open]);

    React.useEffect(() => {
        if (!open || !onSearch) return;
        let active = true;
        const timer = window.setTimeout(() => {
            setLoading(true);
            setError(null);
            void onSearch(query.trim())
                .then((next) => {
                    if (!active) return;
                    setResults(next);
                    setHighlightedIndex(0);
                    window.requestAnimationFrame(updatePosition);
                })
                .catch((reason) => {
                    if (!active) return;
                    setResults([]);
                    setError(
                        reason instanceof Error ? reason.message : String(reason)
                    );
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }, query.trim() ? 120 : 0);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [open, onSearch, query, updatePosition]);

    /**
     * Names a web link after the page it points at, if the page will say and
     * says so quickly.
     *
     * Read once, here, and written into the note as the link's label, so the
     * row reads the same offline for ever after. Everything about this is
     * optional: no network, a site that refuses, a page with no title, or
     * simply an answer that takes too long, and the link is added with its host
     * as the label exactly as before.
     */
    const titled = React.useCallback(
        async (markdown: string): Promise<string> => {
            if (!onFetchPage) return markdown;

            const target = /\]\(([^)]+)\)\s*$/.exec(markdown)?.[1];
            if (!target || !/^https?:\/\//i.test(target)) return markdown;

            const html = await withDeadline(
                onFetchPage(target),
                TITLE_DEADLINE_MS
            );
            const title = html ? pageTitleFrom(html) : null;
            const label = title ? safeLabel(title) : "";
            return label ? `[${label}](${target})` : markdown;
        },
        [onFetchPage]
    );

    const addMarkdown = React.useCallback(
        async (markdown: string) => {
            if (!eventId || !onAddLink || !markdown.trim() || saving) return;
            setSaving(true);
            setError(null);
            try {
                await onAddLink(eventId, (await titled(markdown.trim())).trim());
                closePicker();
            } catch (reason) {
                setError(
                    reason instanceof Error ? reason.message : String(reason)
                );
            } finally {
                setSaving(false);
            }
        },
        [closePicker, eventId, onAddLink, saving, titled]
    );

    const submitInput = React.useCallback(() => {
        const exact = results[highlightedIndex] ?? results[0];
        if (exact) {
            void addMarkdown(exact.markdown);
            return;
        }
        const markdown = urlMarkdown(query);
        if (markdown) {
            void addMarkdown(markdown);
            return;
        }
        // Saying nothing was the worst part of this: the field kept what you
        // typed, the link never appeared, and there was no way to tell which
        // of the two had happened.
        if (query.trim()) setError(t("That does not look like a link"));
    }, [addMarkdown, highlightedIndex, query, results]);

    const handleTrigger = () => {
        if (disabled || saving) return;
        if (!supportsPicker) {
            onOpenNote();
            return;
        }
        setOpen(true);
    };

    const handleTriggerMouseDown = (
        event: React.MouseEvent<HTMLButtonElement>
    ) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        handleTrigger();
    };

    const attachFile = () => {
        if (!eventId || !onPickAttachment || saving) return;
        setSaving(true);
        setError(null);
        void onPickAttachment(eventId)
            .then(() => {
                closePicker();
            })
            .catch((reason) =>
                setError(reason instanceof Error ? reason.message : String(reason))
            )
            .finally(() => setSaving(false));
    };

    const showWebLink =
        query.trim().length > 0 && results.length === 0 && Boolean(urlMarkdown(query));

    return (
        <div className="nc-links-attachments">
            {items.length > 0 && (
                <div className="nc-linked-files" aria-label={t("Linked files")}>
                    {items.map((item) => (
                        <LinkedFileRow
                            key={item.id}
                            item={item}
                            eventId={eventId}
                            onRemoveLink={onRemoveLink}
                            onOpenLink={onOpenLink}
                        />
                    ))}
                </div>
            )}

            {!open ? (
                <button
                    type="button"
                    className="nc-panel-row nc-panel-row-link-attachments"
                    disabled={disabled}
                    aria-label={
                        disabled
                            ? t("Available once the event is created")
                            : t("Add links and attachments")
                    }
                    aria-expanded={open}
                    onMouseDown={handleTriggerMouseDown}
                    onClick={(event) => {
                        event.stopPropagation();
                        if (event.detail === 0) handleTrigger();
                    }}
                >
                    <span className="nc-panel-row-icon">
                        <LinkIcon />
                    </span>
                    <span className="nc-panel-row-label">
                        {items.length > 0
                            ? t("Add another link or attachment")
                            : t("Add links and attachments")}
                    </span>
                </button>
            ) : (
                <div className="nc-link-search-shell" ref={shellRef}>
                    <input
                        ref={inputRef}
                        className="nc-link-search-input"
                        type="text"
                        /* A phone's keyboard decides what its return key does
                           from these. Left unsaid, it offers a newline — which
                           this field has no use for and which some keyboards
                           deliver as an edit rather than as a key press, so
                           pressing it did nothing at all. */
                        inputMode="url"
                        enterKeyHint="done"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={query}
                        placeholder={t("Paste a link, or search the vault")}
                        disabled={saving}
                        aria-label={t("Paste a link, or search the vault")}
                        aria-expanded={Boolean(position)}
                        onChange={(event) => setQuery(event.target.value)}
                        onBeforeInput={(event) => {
                            /* The other half of the same key. A keyboard that
                               reports its return as an inserted line break
                               never fires a keydown for it, so the handler
                               below never runs — and the line break lands in a
                               field that is one line long. */
                            const inputType = (
                                event.nativeEvent as InputEvent
                            ).inputType;
                            if (
                                inputType === "insertLineBreak" ||
                                inputType === "insertParagraph"
                            ) {
                                event.preventDefault();
                                submitInput();
                            }
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setHighlightedIndex((current) =>
                                    Math.min(current + 1, Math.max(0, results.length - 1))
                                );
                            } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setHighlightedIndex((current) => Math.max(0, current - 1));
                            } else if (event.key === "Enter") {
                                event.preventDefault();
                                submitInput();
                            } else if (event.key === "Escape") {
                                event.preventDefault();
                                closePicker();
                            }
                        }}
                    />
                    {loading && <span className="nc-link-search-state">…</span>}
                    {onPickAttachment && (
                        <button
                            type="button"
                            className="nc-link-attachment-icon"
                            aria-label={t("Attach files")}
                            disabled={saving}
                            onClick={attachFile}
                        >
                            <FileTextIcon />
                        </button>
                    )}
                </div>
            )}

            {open &&
                position &&
                ReactDOM.createPortal(
                    <div
                        ref={popoverRef}
                        className="nc-link-results-popover"
                        data-nc-popup-portal="true"
                        role="listbox"
                        style={{
                            top: position.top,
                            left: position.left,
                            width: position.width,
                            maxHeight: position.maxHeight,
                        }}
                    >
                        {vaults.length === 0 ? (
                            <div className="nc-link-empty">
                                {t(
                                    "Add Obsidian vaults in Settings to search notes."
                                )}
                            </div>
                        ) : results.length > 0 ? (
                            results.map((result, index) => {
                                const { fileName, parentPath } = splitLinkSearchPath(
                                    result.relativePath
                                );
                                const accessibleLabel = `${fileName} — ${result.vaultName}`;

                                return (
                                    <button
                                        type="button"
                                        role="option"
                                        aria-label={accessibleLabel}
                                        aria-selected={index === highlightedIndex}
                                        className={`nc-link-result${
                                            index === highlightedIndex ? " is-highlighted" : ""
                                        }`}
                                        key={result.id}
                                        title={fileName}
                                        onMouseEnter={() =>
                                            setHighlightedIndex(index)
                                        }
                                        onMouseDown={(event) => {
                                            if (event.button !== 0) return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void addMarkdown(result.markdown);
                                        }}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            if (event.detail === 0) {
                                                void addMarkdown(result.markdown);
                                            }
                                        }}
                                    >
                                        <span className="nc-link-result-content">
                                            <span className="nc-link-result-name">
                                                {fileName}
                                            </span>
                                            {parentPath && (
                                                <span className="nc-link-result-parent">
                                                    {parentPath}
                                                </span>
                                            )}
                                        </span>
                                        {vaults.length > 1 && (
                                            <span className="nc-link-result-vault">
                                                <span className="nc-link-result-vault-icon">
                                                    <ObsidianColorIcon />
                                                </span>
                                                <span className="nc-link-result-vault-name">
                                                    {result.vaultName}
                                                </span>
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        ) : showWebLink ? (
                            <button
                                type="button"
                                className="nc-link-result is-highlighted"
                                onMouseDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    submitInput();
                                }}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (event.detail === 0) submitInput();
                                }}
                            >
                                <span className="nc-link-result-path">{t("Add web link")}</span>
                                <span className="nc-link-result-vault">{query.trim()}</span>
                            </button>
                        ) : loading ? null : (
                            <div className="nc-link-empty">{t("No matching notes")}</div>
                        )}
                        {error && (
                            <div className="nc-link-picker-error" role="alert">
                                {error}
                            </div>
                        )}
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </div>
    );
}

// ── Description row ────────────────────────────────────────

interface DescriptionRowProps {
    description: string;
    editable: boolean;
    setDescription: (v: string) => void;
    onCommit: () => void;
}

export function DescriptionRow({
    description,
    editable,
    setDescription,
    onCommit,
}: DescriptionRowProps) {
    return (
        <div className="nc-panel-row nc-panel-row-desc">
            <span className="nc-panel-row-icon">
                <LinesIcon />
            </span>
            <div className="nc-panel-row-content">
                <div className="nc-panel-row-label">{t("Description")}</div>
                <textarea
                    className="nc-panel-textarea"
                    value={description}
                    placeholder={t("Empty")}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={onCommit}
                    readOnly={!editable}
                />
            </div>
        </div>
    );
}
