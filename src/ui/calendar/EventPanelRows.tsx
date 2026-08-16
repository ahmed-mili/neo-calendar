import * as React from "react";
import * as ReactDOM from "react-dom";
import { TaskStatus } from "../tasks";
import { Subtask, subtaskProgress } from "../tasks/subtasks";
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
import { sameDestination, sameTarget, urlMarkdown } from "./linkInput";
import { LinkKind, linkKind } from "./linkKind";
import {
    addressesToAsk,
    authorFromOembed,
    canonicalUrlFrom,
    confirmedTarget,
    isFrontDoorTitle,
    oembedAnswersFor,
    oembedUrlFor,
    pageTitleFrom,
    safeLabel,
    titleFromOembed,
    withDeadline,
} from "./linkTitle";
import { BrandIcon } from "./BrandIcons";
import {
    ClockIcon,
    CalendarIcon,
    CheckIcon,
    ChecklistIcon,
    PlusIcon,
    DocIcon,
    LinesIcon,
    RepeatIcon,
    DotsIcon,
    XIcon,
    PencilIcon,
    FileTextIcon,
    ArrowRightIcon,
    GlobeIcon,
    MailIcon,
    PhoneIcon,
} from "./EventPanelIcons";
import { linkSubtitle } from "./linkFacts";
import { Toast, ToastMessage } from "./Toast";
import { t } from "../i18n";
import { isAndroidRuntime } from "./CalendarUtils";
import { decideLinkedFileTap, LinkedFileTap } from "./linkedFileTap";
import { swallowNextClick } from "./swallowNextClick";
import { RecurringEditScope } from "./recurringEdit";

function getEventPanelPortalTarget(): HTMLElement {
    const isAndroid =
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body.classList.contains("nc-platform-android") ||
        document.documentElement.dataset.neoCalendarPlatform === "android";

    return isAndroid
        ? document.getElementById("nc-android-overlay-root") ?? document.body
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
    /** What the panel is showing, which is what its header says it is. */
    isTask: boolean;
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
    isTask,
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
            {/* The header says which of the two this is. It read "Event" on
                everything, including an entry whose own Type row said Task. */}
            <span className="nc-panel-header-label">
                {isTask ? t("Task") : t("Event")}
            </span>
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
                                    <span>
                                        {isTask
                                            ? t("Delete task")
                                            : t("Delete event")}
                                    </span>
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
    /** Send this event back to the unscheduled list. Absent on a draft, which
        has no note yet to move anywhere. */
    onClearDate?: () => void;
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
    onClear,
    clearConfirm,
}: {
    date: string;
    label: string;
    editable: boolean;
    firstDay: number;
    setDate: (v: string) => void;
    onAutoSave: () => void;
    triggerClassName?: string;
    /** Take the date away entirely, which is what sends an event back to the
        unscheduled list. Absent where a date is not optional: the recurrence's
        "ends on" field has no meaning empty, and the deadline clears itself
        through its own button beside the field (see DueRow). */
    onClear?: () => void;
    /** Non-null asks first, and says what else the removal carries off. Empty
        or null removes on the first press. */
    clearConfirm?: string | null;
}) {
    const [open, setOpen] = React.useState(false);
    // Armed only for as long as the popup stays open — a question asked once is
    // not an answer kept.
    const [confirming, setConfirming] = React.useState(false);
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
        setConfirming(false);
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

    /** First press on a field that asks arms the question; the second, and any
        press on a field that does not ask, removes.

        No onAutoSave() here, unlike pick(). Clearing the date is several state
        changes at once — the date, the end date, the times, the repeat — and
        the save that matters is the one the panel's own change-watching effect
        fires once React has applied them all. Saving from here would write the
        payload as it stood BEFORE the press, which for a removal is the event
        unchanged: a wasted round trip to the note, immediately overwritten. */
    const clear = () => {
        if (clearConfirm && !confirming) {
            setConfirming(true);
            return;
        }
        onClear?.();
        setOpen(false);
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
                        {/* The question takes the popup over instead of sitting
                            under the grid: it is asked because the removal
                            carries off more than the date, and a month grid
                            still offering days beside it reads as though the
                            choice were still between dates. It also keeps the
                            popup roughly its own height, so it does not grow
                            past the screen edge it was positioned against. */}
                        {confirming ? (
                            <div
                                className="nc-datepicker-confirm"
                                role="alertdialog"
                                aria-label={t("Remove date")}
                            >
                                <p className="nc-datepicker-confirm-text">
                                    {clearConfirm}
                                </p>
                                <div className="nc-datepicker-confirm-actions">
                                    <button
                                        type="button"
                                        className="nc-datepicker-confirm-cancel"
                                        onClick={() => setConfirming(false)}
                                    >
                                        {t("Cancel")}
                                    </button>
                                    <button
                                        type="button"
                                        className="nc-datepicker-confirm-go"
                                        onClick={clear}
                                    >
                                        {t("Remove date")}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="nc-datepicker-header">
                                    <button
                                        type="button"
                                        className="nc-datepicker-nav"
                                        title={t("Previous month")}
                                        onClick={() =>
                                            setViewMonth(
                                                new Date(year, month - 1, 1)
                                            )
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
                                            setViewMonth(
                                                new Date(year, month + 1, 1)
                                            )
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
                                    {/* Only where there is a date to take away, and
                                only inside the picker: an X beside the field,
                                the way the deadline clears, puts "send this
                                back to the unscheduled list" one stray tap
                                from the date it sits next to. */}
                                    {onClear && date && (
                                        <button
                                            type="button"
                                            className="nc-datepicker-clear-btn"
                                            onClick={clear}
                                        >
                                            {t("Remove date")}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="nc-datepicker-today-btn"
                                        onClick={() => pick(new Date())}
                                    >
                                        Today
                                    </button>
                                </div>
                            </>
                        )}
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
    onClearDate,
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
                        onClear={editable ? onClearDate : undefined}
                        // Taking the date off a series is not the same act as
                        // taking it off one event, and it cannot be a quiet
                        // one: an event that repeats has no single date to
                        // give back — what it has is a rule, and the rule goes
                        // with the date. Said plainly here, before the press
                        // that does it.
                        clearConfirm={
                            isRecurring
                                ? t(
                                      "Removing the date on a repeating event also removes the repeat. It becomes a single unscheduled entry."
                                  )
                                : null
                        }
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
                                        label: t("Monthly on day {n}").replace(
                                            "{n}",
                                            String(
                                                Number(startDate.slice(8, 10))
                                            )
                                        ),
                                    },
                                    {
                                        value: "dayOfWeek",
                                        label: t("Monthly on the same weekday"),
                                    },
                                ]}
                                onChange={(v) => {
                                    update({ monthMode: v as any });
                                    onAutoSave();
                                }}
                            />
                        )}

                        <div className="nc-recur-end">
                            <span className="nc-panel-subrow-label">
                                {t("Ends")}
                            </span>
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
                                <span>{t("Never")}</span>
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
                                <span>{t("On date")}</span>
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
                                <span>{t("After count")}</span>
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
                                <span>{t("occurrences")}</span>
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
                        <div className="nc-cal-select-heading">
                            {t("Calendar")}
                        </div>
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

// ── Subtasks row ───────────────────────────────────────────

interface SubtasksRowProps {
    subtasks: Subtask[];
    editable: boolean;
    setSubtasks: (next: Subtask[]) => void;
    /** Called once an edit has settled — a tick, a deletion, a field left. */
    onAutoSave: () => void;
}

/**
 * The steps a task is made of.
 *
 * A task is one thing to get done, and most things worth putting on a calendar
 * are made of several: "move house" is a van, boxes, a landlord to call. Those
 * are not events — none of them wants an hour on Thursday — so they live here,
 * on the task, as a list that can be ticked off.
 *
 * The list is only offered on a task, for the same reason the deadline is: an
 * event is over when its hour has passed, and has nothing to be part-way
 * through.
 *
 * Enter adds the next step and moves to it, which is how a list like this is
 * actually written: one line, then the next, without reaching for the mouse.
 * Backspace on a step already empty removes it and goes back to the one above,
 * so a line opened by mistake costs nothing to close.
 */
export function SubtasksRow({
    subtasks,
    editable,
    setSubtasks,
    onAutoSave,
}: SubtasksRowProps) {
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
    /** Which line to put the caret in once the list has been redrawn. */
    const [focusIndex, setFocusIndex] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (focusIndex === null) return;
        const input = inputRefs.current[focusIndex];
        if (input) {
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }
        setFocusIndex(null);
    }, [focusIndex, subtasks.length]);

    const progress = subtaskProgress(subtasks);

    const replace = (index: number, step: Subtask) =>
        setSubtasks(subtasks.map((s, i) => (i === index ? step : s)));

    const insertAfter = (index: number) => {
        const next = [...subtasks];
        next.splice(index + 1, 0, { title: "", done: false });
        setSubtasks(next);
        setFocusIndex(index + 1);
    };

    const removeAt = (index: number, focus: number | null) => {
        setSubtasks(subtasks.filter((_, i) => i !== index));
        if (focus !== null) setFocusIndex(focus);
        onAutoSave();
    };

    return (
        <div className="nc-panel-row nc-panel-row-subtasks">
            <span className="nc-panel-row-icon">
                <ChecklistIcon />
            </span>
            <div className="nc-panel-row-content">
                <div className="nc-subtasks-head">
                    <span className="nc-panel-row-label">{t("Steps")}</span>
                    {progress.total > 0 && (
                        <span className="nc-subtasks-count">
                            {progress.done}/{progress.total}
                        </span>
                    )}
                </div>

                {subtasks.map((step, index) => (
                    <div
                        key={index}
                        className={`nc-subtask${
                            step.done ? " nc-subtask-done" : ""
                        }`}
                    >
                        <button
                            type="button"
                            className="nc-subtask-check"
                            role="checkbox"
                            aria-checked={step.done}
                            aria-label={step.title || t("Add a step")}
                            disabled={!editable}
                            onClick={() => {
                                replace(index, {
                                    ...step,
                                    done: !step.done,
                                });
                                onAutoSave();
                            }}
                        >
                            {step.done && <CheckMarkIcon />}
                        </button>
                        <input
                            ref={(node) => {
                                inputRefs.current[index] = node;
                            }}
                            className="nc-subtask-input"
                            type="text"
                            value={step.title}
                            placeholder={t("Add a step")}
                            readOnly={!editable}
                            onChange={(e) =>
                                replace(index, {
                                    ...step,
                                    title: e.target.value,
                                })
                            }
                            onBlur={onAutoSave}
                            onKeyDown={(e) => {
                                if (!editable) return;
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    insertAfter(index);
                                    return;
                                }
                                if (
                                    e.key === "Backspace" &&
                                    step.title === "" &&
                                    subtasks.length > 1
                                ) {
                                    e.preventDefault();
                                    removeAt(
                                        index,
                                        index > 0 ? index - 1 : null
                                    );
                                }
                            }}
                        />
                        {editable && (
                            <button
                                type="button"
                                className="nc-subtask-remove"
                                title={t("Remove step")}
                                aria-label={t("Remove step")}
                                onClick={() => removeAt(index, null)}
                            >
                                <XIcon />
                            </button>
                        )}
                    </div>
                ))}

                {editable && (
                    <button
                        type="button"
                        className="nc-subtask-add"
                        onClick={() => insertAfter(subtasks.length - 1)}
                    >
                        <PlusIcon />
                        {t("Add a step")}
                    </button>
                )}
            </div>
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
const LINK_TOOLTIP_HIDE_DELAY_MS = 120;
const LINK_TOOLTIP_EXIT_MS = 140;

interface LinksAttachmentsRowProps {
    eventId: string | null;
    /** Fetches a page's source, off the WebView so no site can refuse it for
        being cross-origin. Absent where there is no such way. */
    onFetchPage?: (url: string) => Promise<string>;
    /** Suit les redirections d'un lien de partage jusqu'à sa destination. */
    onResolveUrl?: (url: string) => Promise<string>;
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
    onRenameLink?: (
        eventId: string,
        target: string,
        label: string,
        nextTarget?: string
    ) => Promise<void>;
    /** Le titre est encore en route : la ligne le montre plutôt que de mentir. */
    searching?: boolean;
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
    notion: () => <BrandIcon brand="notion" />,
    discord: () => <BrandIcon brand="discord" />,
    telegram: () => <BrandIcon brand="telegram" />,
    twitch: () => <BrandIcon brand="twitch" />,
    figma: () => <BrandIcon brand="figma" />,
    gmail: () => <BrandIcon brand="gmail" />,
    googledocs: () => <BrandIcon brand="googledocs" />,
    googlecalendar: () => <BrandIcon brand="googlecalendar" />,
    googledrive: () => <BrandIcon brand="googledrive" />,
    steam: () => <BrandIcon brand="steam" />,
    signal: () => <BrandIcon brand="signal" />,
    mail: MailIcon,
    phone: PhoneIcon,
    web: GlobeIcon,
};

function LinkedFileRow({
    item,
    eventId,
    onRemoveLink,
    onRenameLink,
    searching = false,
    onCopied,
    openTooltipFor,
    onTooltipOpen,
    onOpenLink,
    tapTrackerRef,
}: {
    item: LinkedFileItem;
    eventId: string | null;
    onRemoveLink?: (eventId: string, target: string) => Promise<void>;
    onRenameLink?: (
        eventId: string,
        target: string,
        label: string,
        nextTarget?: string
    ) => Promise<void>;
    /** Le titre est encore en route : la ligne le montre plutôt que de mentir. */
    searching?: boolean;
    /** L'adresse vient d'être copiée — au panneau de le dire à l'écran. */
    onCopied?: () => void;
    /** L'adresse de la ligne dont la bulle est ouverte, s'il y en a une. */
    openTooltipFor?: string | null;
    /** Cette ligne vient d'ouvrir la sienne. */
    onTooltipOpen?: (target: string) => void;
    onOpenLink?: (item: LinkedFileItem) => Promise<void> | void;
    tapTrackerRef: React.MutableRefObject<LinkedFileTap | null>;
}) {
    const rowRef = React.useRef<HTMLDivElement>(null);
    const hideTimerRef = React.useRef<number | null>(null);
    const [tooltip, setTooltip] = React.useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    const [tooltipClosing, setTooltipClosing] = React.useState(false);
    const [removing, setRemoving] = React.useState(false);
    const [opening, setOpening] = React.useState(false);
    const [hovered, setHovered] = React.useState(false);
    const displayName = React.useMemo(() => linkedItemFileName(item), [item]);
    /* Le compte et la date se lisent dans l'adresse : rien n'est stocké, rien
       n'est demandé au réseau, et les liens déjà là en profitent. */
    const subtitle = React.useMemo(
        () =>
            item.kind === "web" ? linkSubtitle(item.target, displayName) : null,
        [displayName, item.kind, item.target]
    );

    const nameScrollRef = React.useRef<HTMLSpanElement>(null);
    const [overflowing, setOverflowing] = React.useState(false);

    React.useLayoutEffect(() => {
        const element = nameScrollRef.current;
        if (!element) return;
        const measure = () =>
            setOverflowing(element.scrollWidth > element.clientWidth + 1);
        measure();
        if (typeof ResizeObserver !== "function") return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [displayName]);

    const clearHideTimer = React.useCallback(() => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const cancelHide = React.useCallback(() => {
        clearHideTimer();
        setTooltipClosing(false);
    }, [clearHideTimer]);

    /** On Android, a single tap toggles the address; only a double tap opens. */
    const revealedRef = React.useRef(false);

    const resetTapTracker = React.useCallback(() => {
        if (tapTrackerRef.current?.itemId === item.id)
            tapTrackerRef.current = null;
    }, [item.id, tapTrackerRef]);

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
        /* Une seule bulle à la fois : la liste retient laquelle, et les autres
           lignes se referment en l'apprenant. Sans cela, toucher trois liens
           laissait trois bulles empilées, chacune à fermer à la main. */
        onTooltipOpen?.(item.target);
    }, [cancelHide, item.target, onTooltipOpen]);

    const hideTooltip = React.useCallback(
        (delay = 0) => {
            setHovered(false);
            revealedRef.current = false;
            cancelHide();

            const startExit = () => {
                setTooltipClosing(true);
                hideTimerRef.current = window.setTimeout(() => {
                    hideTimerRef.current = null;
                    setTooltip(null);
                    setTooltipClosing(false);
                    revealedRef.current = false;
                    resetTapTracker();
                }, LINK_TOOLTIP_EXIT_MS);
            };

            hideTimerRef.current = window.setTimeout(
                startExit,
                Math.max(0, delay)
            );
        },
        [cancelHide, resetTapTracker]
    );

    const scheduleHide = React.useCallback(
        () => hideTooltip(LINK_TOOLTIP_HIDE_DELAY_MS),
        [hideTooltip]
    );

    React.useEffect(
        () => () => {
            clearHideTimer();
        },
        [clearHideTimer]
    );

    React.useEffect(() => {
        if (!tooltip) return;
        if (openTooltipFor === item.target) return;
        hideTooltip();
    }, [hideTooltip, item.target, openTooltipFor, tooltip]);

    const copyTarget = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        resetTapTracker();
        await navigator.clipboard.writeText(item.target);
        onCopied?.();
        /* La bulle s'en va : elle n'existait que pour porter ce bouton, et la
           laisser ouverte oblige à la chasser d'un second geste. La coche qui
           s'y affichait une seconde n'a plus lieu d'être — le bandeau, lui,
           dit ce qui vient de se passer, et il le dit plus grand. */
        hideTooltip();
    };

    /*
     * Renommer sur place plutôt que dans une boîte : la ligne est déjà là, on
     * la corrige là où on l'a lue. Entrée valide, Échap abandonne, et sortir du
     * champ garde ce qui est écrit — perdre une phrase parce qu'on a touché
     * ailleurs serait une punition pour rien.
     */
    const [renaming, setRenaming] = React.useState(false);
    const [draftName, setDraftName] = React.useState("");
    const nameRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (renaming) nameRef.current?.select();
    }, [renaming]);

    const commitName = React.useCallback(async () => {
        if (!renaming) return;
        setRenaming(false);
        if (!eventId || !onRenameLink) return;
        const wanted = draftName.trim();
        if (wanted === displayName.trim()) return;
        try {
            await onRenameLink(eventId, item.target, wanted);
        } catch {
            // Le panneau dit déjà ce qui n'a pas pu être écrit.
        }
    }, [displayName, draftName, eventId, item.target, onRenameLink, renaming]);

    const remove = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!eventId || !onRemoveLink || removing) return;
        setRemoving(true);
        try {
            resetTapTracker();
            await onRemoveLink(eventId, item.target);
            setHovered(false);
            setTooltip(null);
            revealedRef.current = false;
        } finally {
            setRemoving(false);
        }
    };

    const openLinkedItem = async () => {
        if (!onOpenLink || opening) return;
        cancelHide();
        resetTapTracker();
        revealedRef.current = false;
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
        event:
            | React.MouseEvent<HTMLDivElement>
            | React.KeyboardEvent<HTMLDivElement>
    ) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) return;
        event.preventDefault();
        event.stopPropagation();

        if (isAndroidRuntime() && event.type === "click") {
            const decision = decideLinkedFileTap(
                tapTrackerRef.current,
                item.id,
                event.timeStamp,
                revealedRef.current
            );
            tapTrackerRef.current = decision.nextTap;

            if (decision.action === "open") {
                void openLinkedItem();
                return;
            }

            if (decision.action === "hide-preview") {
                hideTooltip();
                return;
            }

            revealedRef.current = true;
            showTooltip();
            return;
        }

        revealedRef.current = false;
        resetTapTracker();
        void openLinkedItem();
    };

    return (
        <>
            <div
                ref={rowRef}
                className={`nc-linked-file${hovered ? " is-hovered" : ""}${
                    searching ? " is-searching" : ""
                }`}
                data-clickable={onOpenLink ? "true" : "false"}
                role={onOpenLink ? "link" : undefined}
                tabIndex={onOpenLink ? 0 : undefined}
                aria-label={onOpenLink ? `Open ${displayName}` : undefined}
                aria-busy={opening || undefined}
                onPointerEnter={(event) => {
                    if (!isAndroidRuntime() || event.pointerType !== "touch") {
                        showTooltip();
                    }
                }}
                onPointerLeave={(event) => {
                    if (!isAndroidRuntime() || event.pointerType !== "touch") {
                        scheduleHide();
                    }
                }}
                onPointerCancel={scheduleHide}
                onMouseDown={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (!isAndroidRuntime() && !target?.closest("button")) {
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
                {renaming ? (
                    <input
                        ref={nameRef}
                        className="nc-linked-file-rename"
                        value={draftName}
                        aria-label={t("Rename link")}
                        onChange={(event) => setDraftName(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onBlur={() => void commitName()}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                                event.preventDefault();
                                void commitName();
                            } else if (event.key === "Escape") {
                                event.preventDefault();
                                setRenaming(false);
                            }
                        }}
                    />
                ) : (
                    /*
                     * Le nom défile sous le doigt.
                     *
                     * Une adresse entière ou un titre de vidéo dépassent
                     * souvent la largeur d'un téléphone, et l'ellipse coupait
                     * précisément la fin — le code de partage, le mot qui
                     * distingue. On peut maintenant la faire glisser ; le voile
                     * au bord droit n'apparaît que s'il reste quelque chose à
                     * voir, sinon il mangerait la fin d'un nom court.
                     */
                    <span className="nc-linked-file-text">
                        <span
                            ref={nameScrollRef}
                            className={`nc-linked-file-name${
                                overflowing ? " is-overflowing" : ""
                            }`}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {displayName}
                        </span>
                        {subtitle && (
                            <span className="nc-linked-file-meta">
                                {subtitle}
                            </span>
                        )}
                    </span>
                )}
                {eventId && onRenameLink && !renaming && (
                    <button
                        type="button"
                        className="nc-linked-file-rename-button"
                        aria-label={t("Rename link")}
                        title={t("Rename link")}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            resetTapTracker();
                            setDraftName(displayName);
                            setRenaming(true);
                        }}
                    >
                        <PencilIcon />
                    </button>
                )}
                {eventId && onRemoveLink && !renaming && (
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
                        className={`nc-linked-file-tooltip${
                            tooltipClosing ? " is-closing" : ""
                        }`}
                        /* Portée hors du panneau, mais elle lui appartient :
                           sans ce marqueur, presser le bouton « copier »
                           qu'elle contient comptait comme une pression au
                           dehors et fermait l'événement. */
                        data-nc-popup-portal="true"
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
                            <CopyIcon />
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
    onResolveUrl,
    onAddLink,
    onRemoveLink,
    onRenameLink,
    onOpenLink,
    onPickAttachment,
}: LinksAttachmentsRowProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<LinkSearchTarget[]>([]);
    /** Said after the link is added, unlike an error, which stops it. */
    const [notice, setNotice] = React.useState<string | null>(null);
    /** Les liens dont le titre est encore en route, par adresse. */
    const [searching, setSearching] = React.useState<readonly string[]>([]);
    const [toast, setToast] = React.useState<ToastMessage | null>(null);
    /** L'adresse de la ligne dont la bulle est ouverte : il n'y en a qu'une. */
    const [openTooltipFor, setOpenTooltipFor] = React.useState<string | null>(
        null
    );
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
    const tapTrackerRef = React.useRef<LinkedFileTap | null>(null);
    const supportsPicker = Boolean(onSearch && onAddLink);

    React.useEffect(() => {
        tapTrackerRef.current = null;
    }, [eventId]);

    const closePicker = React.useCallback(() => {
        /* Rendre le clavier avant tout le reste : sur un téléphone, une touche
           « OK » qui laisse le clavier en place donne l'impression que rien
           n'a été pris. Le champ disparaît juste après, mais le rendu du
           clavier suit le flou, pas le démontage. */
        inputRef.current?.blur();
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
        const width = Math.min(
            preferredWidth,
            window.innerWidth - viewportGap * 2
        );
        const left = Math.max(
            viewportGap,
            Math.min(rect.left, window.innerWidth - width - viewportGap)
        );
        const roomBelow = window.innerHeight - rect.bottom - viewportGap;
        const roomAbove = rect.top - viewportGap;
        const maxHeight = Math.max(
            150,
            Math.min(300, Math.max(roomBelow, roomAbove))
        );
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
        const timer = window.setTimeout(
            () => {
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
                            reason instanceof Error
                                ? reason.message
                                : String(reason)
                        );
                    })
                    .finally(() => {
                        if (active) setLoading(false);
                    });
            },
            query.trim() ? 120 : 0
        );

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
    const titleFor = React.useCallback(
        async (
            target: string
        ): Promise<{ label: string; destination: string }> => {
            const nothing = { label: "", destination: target };
            if (!onFetchPage || !/^https?:\/\//i.test(target)) return nothing;

            /*
             * The page first, then the site's own answer about it.
             *
             * A shared link is rarely the canonical one — vm.tiktok.com/ZM…
             * is a note saying where to go. The page it leads to says where
             * that is, so it is fetched once for both the address and the
             * title, and oEmbed is asked about the address it gave.
             */
            /* La page et la destination de la redirection se demandent en
               même temps : ce sont deux façons d'apprendre la même chose, et
               les enchaîner doublerait l'attente pour rien. */
            const [html, resolved] = await Promise.all([
                withDeadline(onFetchPage(target), TITLE_DEADLINE_MS),
                onResolveUrl
                    ? withDeadline(onResolveUrl(target), TITLE_DEADLINE_MS)
                    : Promise.resolve(null),
            ]);

            const canonical = (html && canonicalUrlFrom(html)) || target;
            let title: string | null = null;
            /* What gets stored: the canonical address once the site has
               confirmed it, so two shares of one video are one link. */
            let destination = target;

            /*
             * Both addresses are worth asking about.
             *
             * The canonical one is what a site will answer for; the shared one
             * is what we know is right. When the page comes back without
             * having resolved — a challenge, a throttle, an interstitial — the
             * canonical read off it is not this link's, so an answer only
             * counts when it names the address it was asked about.
             */
            const addresses = addressesToAsk(canonical, resolved, target);
            for (const about of addresses) {
                const oembed = oembedUrlFor(about);
                if (!oembed) continue;

                const json = await withDeadline(
                    onFetchPage(oembed),
                    TITLE_DEADLINE_MS
                );
                if (!json || !oembedAnswersFor(json, about)) continue;

                /* L'adresse retenue est celle qui a répondu, pas celle lue
                   dans la page : quand c'est la redirection qui a mené à la
                   vidéo, c'est elle qui décrit le lien. */
                destination = confirmedTarget(target, about, json);
                /* Une vidéo sans légende répond avec un titre vide. Son auteur,
                   lui, est dans la même réponse, et « @quelquun » vaut mieux
                   que « vm.tiktok.com ». */
                title = titleFromOembed(json) ?? authorFromOembed(json);
                if (title) break;
            }

            if (!title && html) {
                const fromPage = pageTitleFrom(html);
                title =
                    fromPage && !isFrontDoorTitle(fromPage, canonical)
                        ? fromPage
                        : null;
            }

            return { label: title ? safeLabel(title) : "", destination };
        },
        [onFetchPage, onResolveUrl]
    );

    /*
     * Le titre se cherche APRÈS que le lien est là.
     *
     * Il était attendu avant l'écriture : jusqu'à trois requêtes de deux
     * secondes et demie, pendant lesquelles le champ restait ouvert, le clavier
     * avec, et rien n'apparaissait. Ajouter un lien est une écriture dans un
     * fichier, c'est instantané ; c'est le titre qui est lent, et il n'est pas
     * une condition — il ne l'a jamais été.
     *
     * La ligne s'ajoute donc tout de suite avec le nom qu'on a, s'anime le
     * temps de la recherche, et se renomme quand la réponse arrive. Si elle
     * n'arrive pas, il reste le crayon.
     */
    const lookUpTitle = React.useCallback(
        async (id: string, target: string) => {
            if (!onFetchPage || !onRenameLink) return;
            setSearching((current) =>
                current.includes(target) ? current : [...current, target]
            );
            try {
                const { label, destination } = await titleFor(target);
                if (label || destination !== target) {
                    await onRenameLink(id, target, label, destination);
                }
                if (!label) {
                    setNotice(
                        t(
                            "No title available for this link — you can name it yourself."
                        )
                    );
                }
            } catch {
                // Le lien est là ; ne pas avoir su le nommer n'est pas une
                // erreur à signaler deux fois.
            } finally {
                setSearching((current) =>
                    current.filter((pending) => pending !== target)
                );
            }
        },
        [onFetchPage, onRenameLink, titleFor]
    );

    const addMarkdown = React.useCallback(
        async (markdown: string) => {
            if (!eventId || !onAddLink || !markdown.trim() || saving) return;

            /* A link added twice by accident: say so, and keep it.
               The note is a list, and appending the same address again would
               leave the second one nowhere — the list is keyed by target, so
               the duplicate is dropped on reading and the row never changes.
               Silently doing nothing looks exactly like a failure to add. */
            const raw = markdown.trim();
            const pasted = /\]\(([^)]+)\)\s*$/.exec(raw)?.[1];
            if (
                pasted &&
                items.some((item) => sameTarget(item.target, pasted))
            ) {
                setError(t("This link is already here"));
                return;
            }

            setSaving(true);
            setError(null);
            setNotice(null);
            try {
                await onAddLink(eventId, raw);
                closePicker();
            } catch (reason) {
                setError(
                    reason instanceof Error ? reason.message : String(reason)
                );
                return;
            } finally {
                setSaving(false);
            }

            /* Le lien est écrit et le champ est fermé — donc le clavier est
               parti. Le titre se cherche maintenant, sans que rien n'attende. */
            if (pasted) void lookUpTitle(eventId, pasted);
        },
        [closePicker, eventId, items, lookUpTitle, onAddLink, saving]
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
                setError(
                    reason instanceof Error ? reason.message : String(reason)
                )
            )
            .finally(() => setSaving(false));
    };

    const showWebLink =
        query.trim().length > 0 &&
        results.length === 0 &&
        Boolean(urlMarkdown(query));

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
                            onRenameLink={onRenameLink}
                            searching={searching.includes(item.target)}
                            openTooltipFor={openTooltipFor}
                            onTooltipOpen={setOpenTooltipFor}
                            onCopied={() =>
                                setToast({
                                    title: t("Link copied"),
                                    detail: t("Paste it wherever you like"),
                                })
                            }
                            onOpenLink={onOpenLink}
                            tapTrackerRef={tapTrackerRef}
                        />
                    ))}
                </div>
            )}

            {/* Not an error: the link is there, it just kept its host for a
                name. Said once, under the list it is about, and gone as soon
                as another link is added. */}
            {toast && <Toast message={toast} onClose={() => setToast(null)} />}

            {notice && (
                <div className="nc-link-notice" role="status">
                    {notice}
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
                            const inputType = (event.nativeEvent as InputEvent)
                                .inputType;
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
                                    Math.min(
                                        current + 1,
                                        Math.max(0, results.length - 1)
                                    )
                                );
                            } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setHighlightedIndex((current) =>
                                    Math.max(0, current - 1)
                                );
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
                                const { fileName, parentPath } =
                                    splitLinkSearchPath(result.relativePath);
                                const accessibleLabel = `${fileName} — ${result.vaultName}`;

                                return (
                                    <button
                                        type="button"
                                        role="option"
                                        aria-label={accessibleLabel}
                                        aria-selected={
                                            index === highlightedIndex
                                        }
                                        className={`nc-link-result${
                                            index === highlightedIndex
                                                ? " is-highlighted"
                                                : ""
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
                                                void addMarkdown(
                                                    result.markdown
                                                );
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
                                <span className="nc-link-result-path">
                                    {t("Add web link")}
                                </span>
                                <span className="nc-link-result-vault">
                                    {query.trim()}
                                </span>
                            </button>
                        ) : loading ? null : (
                            <div className="nc-link-empty">
                                {t("No matching notes")}
                            </div>
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

// ── "This one, or all of them?" ─────────────────────────────

interface RecurringScopeDialogProps {
    /** A series of tasks and a series of events are not asked about alike. */
    isTask: boolean;
    onCancel: () => void;
    onConfirm: (scope: RecurringEditScope) => void;
}

/**
 * The question a calendar has to ask before writing one day of a series.
 *
 * It comes up on the way out, once, holding everything typed since the panel
 * opened — not on each field, which would put a dialog between a person and
 * their own typing. "Cancel" hands the panel back with the edit intact.
 */
export function RecurringScopeDialog({
    isTask,
    onCancel,
    onConfirm,
}: RecurringScopeDialogProps) {
    const [scope, setScope] = React.useState<RecurringEditScope>("occurrence");

    React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onCancel();
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [onCancel]);

    const choices: { value: RecurringEditScope; label: string }[] = [
        {
            value: "occurrence",
            label: isTask ? t("This task") : t("This event"),
        },
        {
            value: "series",
            label: isTask ? t("All tasks") : t("All events"),
        },
    ];

    return ReactDOM.createPortal(
        <div
            className="nc-scope-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <div className="nc-scope-dialog">
                <div className="nc-scope-title">
                    {isTask
                        ? t("Save a recurring task")
                        : t("Save a recurring event")}
                </div>
                <div className="nc-scope-choices">
                    {choices.map((choice) => (
                        <label className="nc-scope-choice" key={choice.value}>
                            <input
                                type="radio"
                                name="nc-recurring-scope"
                                checked={scope === choice.value}
                                onChange={() => setScope(choice.value)}
                            />
                            <span>{choice.label}</span>
                        </label>
                    ))}
                </div>
                <div className="nc-scope-actions">
                    <button
                        type="button"
                        className="nc-scope-btn"
                        onClick={onCancel}
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        type="button"
                        className="nc-scope-btn nc-scope-btn-primary"
                        onClick={() => onConfirm(scope)}
                    >
                        {t("Save")}
                    </button>
                </div>
            </div>
        </div>,
        getEventPanelPortalTarget()
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
