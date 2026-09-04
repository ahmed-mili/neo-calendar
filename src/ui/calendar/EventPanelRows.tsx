import * as React from "react";
import * as ReactDOM from "react-dom";
import { TaskStatus } from "../tasks";
import { CalendarInfo } from "../../types";
import { formatDateLong } from "./EventPanel.helpers";
import { DAY_INITIALS } from "./dayInitials";
import { placeFlyout } from "./flyoutPlacement";
import { REMINDER_CHOICES, reminderLabelParts } from "./reminderChoices";
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
    SearchIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    CheckIcon as CheckMarkIcon,
    CopyIcon,
    DuplicateIcon,
    TrashIcon,
    FileTextIcon as NoteIcon,
    MapPinIcon,
} from "./Icons";
import {
    geoUrlFor,
    locationDestinationFor,
    locationLinkFor,
    mapsAppsFor,
    mapsUrlFor,
    type GeoApp,
    type MapsApp,
    type MapsAppChoice,
    type MapsTravelMode,
} from "./locationLink";
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
    resolvedTarget,
    isFrontDoorTitle,
    oembedAnswersFor,
    oembedUrlFor,
    pageTitleFrom,
    safeLabel,
    titleFromOembed,
    withDeadline,
} from "./linkTitle";
import { BrandIcon, type BrandName } from "./BrandIcons";
import {
    BellIcon,
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
    ReloadIcon,
    FileTextIcon,
    ArrowRightIcon,
    GlobeIcon,
    MailIcon,
    PhoneIcon,
} from "./EventPanelIcons";
import { linkSubtitle } from "./linkFacts";
import { needsResolving } from "./shareLink";
import { Toast, ToastMessage } from "./Toast";
import { t } from "../i18n";
import {
    CaretMove,
    mergeLine,
    readChecklist,
    taskPrefixLength,
    replaceLine,
    splitLine,
    toggleLine,
} from "./descriptionChecklist";
import { imageMimeFor, isImageTarget } from "./pastedAttachment";
import { isAndroidRuntime } from "./CalendarUtils";
import { decideLinkedFileTap, LinkedFileTap } from "./linkedFileTap";
import { swallowNextClick } from "./swallowNextClick";
import { RecurringEditScope } from "./recurringEdit";
import type { RecurringEditChange } from "./recurringEditChanges";

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

/**
 * The mark on a sheet's handle: a bar, or a chevron at either end of its range.
 *
 * One path, redrawn — rather than three icons — so the three states are
 * plainly one thing changing rather than three things swapped.
 */
function SheetHandleGlyph({ glyph }: { glyph: "up" | "bar" | "down" }) {
    const d =
        glyph === "up"
            ? "M4 13 L12 7 L20 13"
            : glyph === "down"
            ? "M4 7 L12 13 L20 7"
            : "M4 10 L20 10";
    return (
        <svg width="24" height="20" viewBox="0 0 24 20" aria-hidden="true">
            <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// ── Header ──────────────────────────────────────────────────

interface PanelHeaderProps {
    isDraft: boolean;
    isTask: boolean;
    kind: EntryKind;
    setKind: (kind: EntryKind) => void;
    editable: boolean;
    eventId: string | null;
    menuOpen: boolean;
    menuRef: React.RefObject<HTMLDivElement>;
    onHeaderMouseDown: (e: React.MouseEvent) => void;
    onToggleMenu: () => void;
    onOpenFile: (id: string) => void;
    onCopyFilePath?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onDeleteClick: () => void;
    onClose: () => void;
    headerRef?: React.RefObject<HTMLDivElement>;
    sheetHandle?: { glyph: "up" | "bar" | "down"; onPress: () => void };
}

export function PanelHeader({
    isDraft,
    isTask,
    kind,
    setKind,
    editable,
    eventId,
    menuOpen,
    menuRef,
    headerRef,
    onHeaderMouseDown,
    onToggleMenu,
    onOpenFile,
    onCopyFilePath,
    onDuplicate,
    onDeleteClick,
    onClose,
    sheetHandle,
}: PanelHeaderProps) {
    const android = isAndroidRuntime();
    const entryKinds: Array<{ key: EntryKind; label: string }> = [
        { key: "event", label: t("Event") },
        { key: "task", label: t("Task") },
        { key: "birthday", label: t("Birthday") },
    ];
    const kindTriggerRef = React.useRef<HTMLButtonElement>(null);
    const kindMenuRef = React.useRef<HTMLDivElement>(null);
    const [kindOpen, setKindOpen] = React.useState(false);
    const [kindMenuStyle, setKindMenuStyle] =
        React.useState<React.CSSProperties>({});
    const selectedKind =
        entryKinds.find((entry) => entry.key === kind) ?? entryKinds[0];

    const toggleKind = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!editable) return;
        if (kindOpen) {
            setKindOpen(false);
            return;
        }
        const rect = kindTriggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const placement = placeFlyout(rect, window.innerHeight, {
            gap: 4,
            margin: 8,
            minHeight: 132,
        });
        const width = 176;
        const left = Math.max(
            8,
            Math.min(rect.left, window.innerWidth - width - 8)
        );
        setKindMenuStyle({
            left,
            width,
            top: placement.top ?? undefined,
            bottom: placement.bottom ?? undefined,
            maxHeight: placement.maxHeight,
        });
        setKindOpen(true);
    };

    React.useEffect(() => {
        if (!kindOpen) return;
        const close = (event: PointerEvent) => {
            const target = event.target as Node;
            if (kindTriggerRef.current?.contains(target)) return;
            if (kindMenuRef.current?.contains(target)) return;
            setKindOpen(false);
        };
        const closeForLayout = () => setKindOpen(false);
        document.addEventListener("pointerdown", close, true);
        window.addEventListener("resize", closeForLayout);
        window.addEventListener("scroll", closeForLayout, true);
        return () => {
            document.removeEventListener("pointerdown", close, true);
            window.removeEventListener("resize", closeForLayout);
            window.removeEventListener("scroll", closeForLayout, true);
        };
    }, [kindOpen]);

    return (
        <>
            <div
                className="nc-panel-header"
                ref={headerRef}
                onMouseDown={onHeaderMouseDown}
            >
                {sheetHandle && (
                    <button
                        type="button"
                        className={`nc-sheet-handle nc-sheet-handle--${sheetHandle.glyph}`}
                        aria-label={t("Resize panel")}
                        onClick={sheetHandle.onPress}
                    >
                        <SheetHandleGlyph glyph={sheetHandle.glyph} />
                    </button>
                )}

                <button
                    ref={kindTriggerRef}
                    type="button"
                    className="nc-panel-kind-trigger"
                    aria-label={t("Type")}
                    aria-haspopup="menu"
                    aria-expanded={kindOpen}
                    disabled={!editable}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={toggleKind}
                >
                    <span>{selectedKind.label}</span>
                    {editable && <ChevronDownIcon size={13} />}
                </button>

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
                                    !android &&
                                    onCopyFilePath && (
                                        <button
                                            type="button"
                                            className="nc-panel-menu-item"
                                            onClick={() =>
                                                onCopyFilePath(eventId)
                                            }
                                        >
                                            <CopyIcon size={15} />
                                            <span>{t("Copy path")}</span>
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

            {kindOpen &&
                ReactDOM.createPortal(
                    <div
                        ref={kindMenuRef}
                        className="nc-panel-kind-menu"
                        role="menu"
                        style={kindMenuStyle}
                        data-nc-popup-portal="true"
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        {entryKinds.map((entry) => (
                            <button
                                key={entry.key}
                                type="button"
                                role="menuitemradio"
                                aria-checked={kind === entry.key}
                                className={`nc-panel-kind-option${
                                    kind === entry.key ? " nc-active" : ""
                                }`}
                                data-kind={entry.key}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setKindOpen(false);
                                    if (entry.key !== kind) setKind(entry.key);
                                }}
                            >
                                <span>{entry.label}</span>
                                {kind === entry.key && (
                                    <CheckMarkIcon size={14} />
                                )}
                            </button>
                        ))}
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </>
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
            <input
                ref={inputRef}
                type="text"
                className="nc-panel-title-input"
                value={title}
                placeholder={t("Title")}
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
    /** The actual date represented by endDateLabel. When present, the end of
        the range is editable with the same picker as its start. */
    endDate?: string;
    startTime: string;
    endTime: string;
    duration: string;
    allDay: boolean;
    isRecurring: boolean;
    editable: boolean;
    firstDay: number;
    setDate: (v: string) => void;
    setEndDate?: (v: string | undefined) => void;
    setStartTime: (v: string) => void;
    setEndTime: (v: string) => void;
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
        "ends on" field has no meaning empty. */
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
                                                data-date-value={toISODate(day)}
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
    endDate,
    startTime,
    endTime,
    duration,
    allDay,
    isRecurring,
    editable,
    firstDay,
    setDate,
    setEndDate,
    setStartTime,
    setEndTime,
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
                {/* Une grille de deux lignes et trois colonnes, et non deux
                    rangees empilees : c'est ce qui pose chaque date SOUS
                    l'heure dont elle est la date, comme Notion Calendar.
                    Empilees, les deux dates portaient leur propre fleche et ne
                    tombaient nulle part en particulier — il fallait relire pour
                    savoir laquelle allait avec laquelle.

                    Un seul balisage pour les deux modes afin que les heures et
                    la fleche se rendent A L'IDENTIQUE ; seul l'effet estompe
                    change. En journee entiere, les heures encore en memoire
                    dans l'etat du formulaire s'affichent en lecture seule et
                    fanees, puis disparaissent a la reouverture (un evenement de
                    journee entiere n'enregistre pas d'heures). Ce sont les
                    memes <input type=time> dans les deux etats — pas des spans
                    — pour que les chiffres tombent au pixel pres. */}
                <div
                    className={`nc-panel-datetime${
                        endDateLabel && endDate
                            ? " nc-panel-datetime-range"
                            : ""
                    }`}
                >
                    {(!allDay || startTime) && (
                        <>
                            <span
                                className={`nc-panel-datetime-start-time${
                                    allDay ? " nc-panel-time-row-muted" : ""
                                }`}
                                aria-hidden={allDay ? "true" : undefined}
                            >
                                <input
                                    type="time"
                                    className="nc-panel-time-input"
                                    value={startTime}
                                    onChange={(e) =>
                                        setStartTime(e.target.value)
                                    }
                                    onBlur={onAutoSave}
                                    readOnly={!editable || allDay}
                                />
                            </span>
                            <span
                                className={`nc-panel-arrow nc-panel-datetime-arrow${
                                    allDay ? " nc-panel-time-row-muted" : ""
                                }`}
                                aria-hidden="true"
                            >
                                <ArrowRightIcon />
                            </span>
                            <span
                                className={`nc-panel-datetime-end-time${
                                    allDay ? " nc-panel-time-row-muted" : ""
                                }`}
                                aria-hidden={allDay ? "true" : undefined}
                            >
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
                            </span>
                        </>
                    )}
                    <span className="nc-panel-datetime-start-date">
                        <DateField
                            date={date}
                            label={dateLabel}
                            editable={editable}
                            firstDay={firstDay}
                            setDate={setDate}
                            onClear={editable ? onClearDate : undefined}
                            // Taking the date off a series is not the same act
                            // as taking it off one event, and it cannot be a
                            // quiet one: an event that repeats has no single
                            // date to give back — what it has is a rule, and
                            // the rule goes with the date. Said plainly here,
                            // before the press that does it.
                            clearConfirm={
                                isRecurring
                                    ? t(
                                          "Removing the date on a repeating event also removes the repeat. It becomes a single unscheduled entry."
                                      )
                                    : null
                            }
                            onAutoSave={onAutoSave}
                        />
                    </span>
                    {endDateLabel && endDate && (
                        <span className="nc-panel-datetime-end-date">
                            <DateField
                                date={endDate}
                                label={endDateLabel}
                                editable={editable && Boolean(setEndDate)}
                                firstDay={firstDay}
                                setDate={(next) =>
                                    setEndDate?.(
                                        next === date ? undefined : next
                                    )
                                }
                                onAutoSave={onAutoSave}
                            />
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── All day ────────────────────────────────────────────────

/**
 * A switch, on a line of its own.
 *
 * It was a chip under the times, beside "Repeat", where two settings of quite
 * different natures shared one row: one says how long the event is, the other
 * how often it comes back. A switch says what this one is — on or off, now —
 * and a line of its own says it is about the times above it.
 */
export function AllDayRow({
    allDay,
    editable,
    onToggle,
}: {
    allDay: boolean;
    editable: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="nc-panel-row nc-panel-row-inline nc-panel-row-allday">
            <span className="nc-panel-row-icon">
                <ClockIcon />
            </span>
            <div className="nc-panel-row-label">{t("All-day")}</div>
            <button
                type="button"
                role="switch"
                aria-checked={allDay}
                aria-label={t("All-day")}
                className={`nc-switch${allDay ? " nc-switch-on" : ""}`}
                disabled={!editable}
                onClick={() => editable && onToggle()}
            >
                <span className="nc-switch-knob" />
            </button>
        </div>
    );
}

// ── Repeat ─────────────────────────────────────────────────

/** The five answers offered before anyone has to build a rule by hand. */
const REPEAT_CHOICES: { key: PresetKey | "once"; label: string }[] = [
    { key: "once", label: t("Once") },
    { key: "daily", label: t("Every day") },
    { key: "weekly", label: t("Every week") },
    { key: "monthly", label: t("Every month") },
    { key: "yearly", label: t("Every year") },
    { key: "custom", label: t("Custom…") },
];

/**
 * How often it comes back, said in one line.
 *
 * An event that does not repeat says so — "Once" — rather than leaving the
 * question unanswered until a chip is noticed. Pressing the line opens the six
 * answers over the sheet, which is where a choice of one from six belongs: as a
 * row of chips they were five words to read before the one that applied could
 * be found, and the sixth opened controls that had nowhere to go.
 */
export function RepeatRow({
    isRecurring,
    currentPreset,
    summary,
    editable,
    onChoose,
}: {
    isRecurring: boolean;
    /** Which of the answers the rule in force amounts to. */
    currentPreset: PresetKey;
    /** What the rule says today, when there is one. */
    summary: string;
    editable: boolean;
    onChoose: (key: PresetKey | "once") => void;
}) {
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(false);
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [open]);

    return (
        <div className="nc-panel-row nc-panel-row-inline nc-panel-row-repeat">
            <span className="nc-panel-row-icon">
                <RepeatIcon />
            </span>
            <button
                type="button"
                className="nc-repeat-trigger"
                disabled={!editable}
                onClick={() => editable && setOpen(true)}
            >
                {isRecurring && summary ? summary : t("Once")}
            </button>
            {open &&
                ReactDOM.createPortal(
                    <div
                        className="nc-choice-overlay"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("Repetition")}
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setOpen(false);
                            }
                        }}
                    >
                        <div className="nc-choice-dialog">
                            {REPEAT_CHOICES.map((choice) => (
                                <label
                                    className="nc-choice-option"
                                    key={choice.key}
                                >
                                    <input
                                        type="radio"
                                        name="nc-repeat-choice"
                                        checked={
                                            choice.key === "once"
                                                ? !isRecurring
                                                : isRecurring &&
                                                  choice.key === currentPreset
                                        }
                                        onChange={() => {
                                            setOpen(false);
                                            onChoose(choice.key);
                                        }}
                                    />
                                    <span>{choice.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>,
                    getEventPanelPortalTarget()
                )}
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

/** The way back out of a screen that covers the one it was opened from. */
function BackArrowIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M19 12H5M5 12l6-6M5 12l6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Building a repetition by hand, on a page of its own.
 *
 * It used to unfold inside the event panel: an interval, a row of days, three
 * radio buttons and a date field, stacked under the row that opened them, in a
 * sheet already holding everything else about the event. Two forms in one
 * surface, and the one being filled in was the smaller of the two.
 *
 * It is its own screen now, the way Google Calendar does it — a title, a way
 * back, and one thing at a time — with only the sections that mean something
 * for the rule being written: how often, which days, and when it stops.
 */
export function CustomRecurrencePanel({
    recurrence,
    startDate,
    firstDay,
    setRecurrence,
    onAutoSave,
    onClose,
}: RecurrenceRowProps & { onClose: () => void }) {
    const update = (patch: Partial<RecurrenceState>) =>
        setRecurrence({ ...recurrence, ...patch });
    const commit = () => onAutoSave();

    const toggleDay = (code: DayCode) => {
        const has = recurrence.byDay.includes(code);
        let next = has
            ? recurrence.byDay.filter((c) => c !== code)
            : [...recurrence.byDay, code];
        // A weekly rule with no day left is a rule that never comes round; the
        // day the event starts on is the one it falls back to.
        if (next.length === 0) next = [dayCodeOf(startDate)];
        setRecurrence({ ...recurrence, byDay: next });
    };

    React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onClose();
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    if (typeof document === "undefined") return null;

    return ReactDOM.createPortal(
        /* Une carte dans un cadre, et non une page nue : sur telephone la carte
           occupe tout, sur un bureau elle se pose au milieu de la fenetre et le
           cadre l'assombrit. Sans cette enveloppe, il n'y avait rien a centrer
           — l'ecran etait un `inset: 0` que l'ordinateur prenait au mot, et une
           question de six lignes couvrait toute l'application. */
        <div className="nc-recur-screen" role="dialog" aria-modal="true">
            <div className="nc-recur-screen-card">
                <header className="nc-recur-screen-header">
                    <button
                        type="button"
                        className="nc-recur-screen-back"
                        aria-label={t("Close")}
                        onClick={onClose}
                    >
                        <BackArrowIcon />
                    </button>
                    <h2>{t("Custom recurrence")}</h2>
                    <button
                        type="button"
                        className="nc-recur-screen-done"
                        onClick={onClose}
                    >
                        {t("Complete")}
                    </button>
                </header>

                <div className="nc-recur-screen-body">
                    <section className="nc-recur-section">
                        <h3>{t("Repeat frequency")}</h3>
                        <div className="nc-recur-interval">
                            <input
                                type="number"
                                min={1}
                                className="nc-recur-num"
                                aria-label={t("Repeat frequency")}
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
                    </section>

                    {/* Which days, but only where the question means something: a
                    monthly rule has no weekdays to pick from. */}
                    {recurrence.freq === "weekly" && (
                        <section className="nc-recur-section">
                            <h3>{t("Repeat on")}</h3>
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
                                        aria-pressed={recurrence.byDay.includes(
                                            code
                                        )}
                                        onClick={() => {
                                            toggleDay(code);
                                            onAutoSave();
                                        }}
                                    >
                                        {DAY_INITIALS[code]}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    {recurrence.freq === "monthly" && (
                        <section className="nc-recur-section">
                            <h3>{t("Repeat on")}</h3>
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
                                    update({
                                        monthMode:
                                            v as RecurrenceState["monthMode"],
                                    });
                                    onAutoSave();
                                }}
                            />
                        </section>
                    )}

                    <section className="nc-recur-section nc-recur-end">
                        <h3>{t("Ends")}</h3>
                        <label className="nc-recur-end-line">
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
                        <label className="nc-recur-end-line">
                            <input
                                type="radio"
                                name="recur-end"
                                checked={recurrence.end.kind === "until"}
                                onChange={() => {
                                    update({
                                        end: { kind: "until", date: startDate },
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
                                        ? formatDateLong(recurrence.end.date)
                                        : formatDateLong(startDate)
                                }
                                editable={recurrence.end.kind === "until"}
                                firstDay={firstDay}
                                setDate={(v) =>
                                    update({ end: { kind: "until", date: v } })
                                }
                                onAutoSave={onAutoSave}
                            />
                        </label>
                        <label className="nc-recur-end-line">
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
                    </section>
                </div>
            </div>
        </div>,
        document.body
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
                {/* La pastille dans la meme case de 20 px que les autres
                    glyphes : seule, elle mesurait 10 px et sa colonne tombait
                    cinq pixels a gauche de celle de l'horloge et de la cloche.
                    La case est toujours la, meme sans couleur, pour que le nom
                    ne glisse pas quand il n'y en a pas. */}
                <span className="nc-cal-select-swatch">
                    {current && (
                        <span
                            className="nc-cal-dot"
                            style={{ background: current.color }}
                        />
                    )}
                </span>
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

// ── Reminders row ──────────────────────────────────────────

interface RemindersRowProps {
    reminders: number[] | undefined;
    editable: boolean;
    setReminders: (reminders: number[]) => void;
    onAutoSave: () => void;
}

/**
 * When to be told about this event.
 *
 * A field rather than a labelled row: it holds a list, and the list is what
 * names it — a bell and the word "Reminders" while it is empty, the reminders
 * themselves once there are any. An event carrying none at all falls back to
 * the reminder set in the settings; one carrying an empty list has asked for
 * silence, which is why removing the last chip still saves a list.
 */
export function RemindersRow({
    reminders,
    editable,
    setReminders,
    onAutoSave,
}: RemindersRowProps) {
    const [open, setOpen] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{
        top: number | null;
        bottom: number | null;
        left: number;
        minWidth: number;
        maxHeight: number;
    } | null>(null);
    const fieldRef = React.useRef<HTMLDivElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const chosen = reminders ?? [];

    /* `wanted` is how tall the menu would be if nothing cut it: measured once
       it is up, so the five entries are counted as they really render rather
       than from a number kept in step with the stylesheet by hand. Until then
       the field's own height stands in, which is enough to open on the side
       with room. */
    const place = (wanted: number) => {
        const box = fieldRef.current?.getBoundingClientRect();
        if (!box) return;
        const placement = placeFlyout(box, window.innerHeight, {
            gap: 4,
            margin: 12,
            minHeight: wanted,
        });
        setMenuPos({
            top: placement.top,
            bottom: placement.bottom,
            left: box.left,
            minWidth: box.width,
            maxHeight: placement.maxHeight,
        });
    };

    const openMenu = () => {
        place(REMINDER_CHOICES.length * 40);
        setOpen(true);
    };

    /* A menu of five entries fits above or below almost anywhere; scrolling it
       under the field while the whole screen sits free above is the placement
       being asked the wrong question. So it is asked again with the height the
       menu actually wants, before the browser paints it. */
    React.useLayoutEffect(() => {
        if (!open) return;
        const height = menuRef.current?.scrollHeight;
        if (height) place(height);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    React.useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (fieldRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);

    const toggleMenu = () => {
        if (!editable) return;
        if (open) setOpen(false);
        else openMenu();
    };

    const add = (minutes: number) => {
        setOpen(false);
        if (chosen.includes(minutes)) return;
        setReminders([...chosen, minutes].sort((a, b) => a - b));
        onAutoSave();
    };

    const remove = (minutes: number) => {
        setReminders(chosen.filter((value) => value !== minutes));
        onAutoSave();
    };

    return (
        <div className="nc-panel-row nc-panel-reminders-row">
            {/* A div rather than a button: the chips carry their own buttons,
                and a button inside a button is not a thing. */}
            <div
                ref={fieldRef}
                className={`nc-panel-reminders${
                    editable ? "" : " nc-panel-reminders-readonly"
                }`}
                role="button"
                tabIndex={editable ? 0 : -1}
                aria-expanded={open}
                aria-disabled={editable ? undefined : true}
                onClick={toggleMenu}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleMenu();
                    }
                }}
            >
                <span className="nc-panel-reminders-icon">
                    <BellIcon />
                </span>
                {chosen.length === 0 ? (
                    <span className="nc-panel-reminders-placeholder">
                        {t("Reminders")}
                    </span>
                ) : (
                    <span className="nc-panel-reminders-chips">
                        {chosen.map((minutes) => {
                            const { amount, suffix } =
                                reminderLabelParts(minutes);
                            const label = suffix
                                ? `${amount} ${suffix}`
                                : amount;
                            return (
                                <span
                                    className="nc-panel-reminder-chip"
                                    key={minutes}
                                >
                                    <strong>{amount}</strong>
                                    {suffix && (
                                        <span className="nc-panel-reminder-suffix">
                                            {suffix}
                                        </span>
                                    )}
                                    {editable && (
                                        <button
                                            type="button"
                                            className="nc-panel-reminder-remove"
                                            title={`${t(
                                                "Remove reminder"
                                            )} ${label}`}
                                            aria-label={`${t(
                                                "Remove reminder"
                                            )} ${label}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                remove(minutes);
                                            }}
                                        >
                                            <XIcon />
                                        </button>
                                    )}
                                </span>
                            );
                        })}
                    </span>
                )}
                {/* Le meme chevron que la ligne du calendrier juste au-dessus :
                    les deux champs ouvrent un menu, et c'est ce chevron qui le
                    dit au survol. */}
                {editable && (
                    <span className="nc-panel-reminders-chevron">
                        <ChevronDownIcon size={14} />
                    </span>
                )}
            </div>

            {open &&
                menuPos &&
                ReactDOM.createPortal(
                    <div
                        className="nc-select-menu nc-reminders-menu"
                        role="listbox"
                        ref={menuRef}
                        style={{
                            top: menuPos.top ?? undefined,
                            bottom: menuPos.bottom ?? undefined,
                            left: menuPos.left,
                            minWidth: menuPos.minWidth,
                            maxHeight: menuPos.maxHeight,
                        }}
                    >
                        {REMINDER_CHOICES.map((minutes) => {
                            const { amount, suffix } =
                                reminderLabelParts(minutes);
                            return (
                                <button
                                    type="button"
                                    key={minutes}
                                    role="option"
                                    aria-selected={chosen.includes(minutes)}
                                    className="nc-reminders-option"
                                    onClick={() => add(minutes)}
                                >
                                    <strong>{amount}</strong>
                                    {suffix && (
                                        <span className="nc-reminders-option-suffix">
                                            {suffix}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </div>
    );
}

// ── Type row ───────────────────────────────────────────────

/**
 * What an entry IS, which is a question with three answers now.
 *
 * `event` and `task` are stored on the note — a task carries `completed`, an
 * event does not. `birthday` is not stored and does not need to be: a birthday
 * is an all-day event that comes back every year on the same date, which the
 * note already says in full. Reading it back rather than recording it means
 * every birthday ever written by hand is recognised as one, and nothing has to
 * be migrated.
 */
export type EntryKind = "event" | "task" | "birthday";

// ── Status row ─────────────────────────────────────────────

interface StatusRowProps {
    taskStatus: TaskStatus | null;
    editable: boolean;
    setStatus: (s: TaskStatus) => void;
    completeDisabledReason?: string;
}

export function StatusRow({
    taskStatus,
    editable,
    setStatus,
    completeDisabledReason,
}: StatusRowProps) {
    // Single pill showing the current status, aligned right (Notion-style).
    // Clicking it toggles between the two states.
    const status = taskStatus === "complete" ? "complete" : "todo";
    const next = status === "todo" ? "complete" : "todo";
    const completionBlocked =
        next === "complete" && Boolean(completeDisabledReason);
    const disabled = !editable || completionBlocked;
    return (
        <div className="nc-panel-row nc-panel-row-inline">
            <span className="nc-panel-row-icon">
                <CheckIcon />
            </span>
            <div className="nc-panel-row-label">{t("Status")}</div>
            <button
                type="button"
                className={`nc-status-pill nc-status-${status} nc-active`}
                onClick={() => !disabled && setStatus(next)}
                disabled={disabled}
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
    onCopyLink?: (target: string) => Promise<void>;
    onPickAttachment?: (eventId: string) => Promise<void>;
    /** Le contenu d'une pièce jointe, pour en montrer une vignette. */
    onReadAttachment?: (
        eventId: string,
        target: string
    ) => Promise<string | null>;
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

/**
 * L'image d'une pièce jointe, quand c'en est une.
 *
 * Une ligne de texte disant `image.png` ne dit pas laquelle : sur un événement
 * qui en porte trois, il faut les ouvrir une par une pour retrouver la bonne.
 * Le contenu est demandé au natif fichier par fichier — la WebView ne peut pas
 * ouvrir un `file://`, et c'est tout l'intérêt de son isolement — puis gardé en
 * `data:` le temps que le panneau reste ouvert.
 *
 * Rien du tout si le fichier ne se lit pas, s'il est trop gros, ou si la
 * plateforme ne sait pas le rendre : la ligne montre alors son nom et son
 * icône, ce qu'elle a toujours fait.
 */
function LinkedFileThumbnail({
    target,
    name,
    onRead,
}: {
    target: string;
    name: string;
    onRead: (target: string) => Promise<string | null>;
}) {
    const [source, setSource] = React.useState<string | null>(null);

    React.useEffect(() => {
        let alive = true;
        void onRead(target)
            .then((base64) => {
                if (!alive || !base64) return;
                setSource(`data:${imageMimeFor(target)};base64,${base64}`);
            })
            .catch(() => {
                // Une vignette absente n'est pas une erreur à raconter.
            });
        return () => {
            alive = false;
        };
    }, [onRead, target]);

    if (!source) return null;
    return <img className="nc-linked-file-thumb" src={source} alt={name} />;
}

/** Le temps qu'il faut pour qu'un appui soit un choix et pas un ratage. */
const HOLD_TO_REMOVE_MS = 550;

function LinkedFileRow({
    item,
    eventId,
    onRemoveLink,
    onRenameLink,
    searching = false,
    onReload,
    onCopied,
    onCopyFailed,
    openTooltipFor,
    onTooltipOpen,
    onOpenLink,
    onCopyLink,
    onReadAttachment,
    onRemoveHint,
    tapTrackerRef,
}: {
    item: LinkedFileItem;
    eventId: string | null;
    /** Le contenu d'une pièce jointe, pour en montrer une vignette. */
    onReadAttachment?: (target: string) => Promise<string | null>;
    onRemoveLink?: (eventId: string, target: string) => Promise<void>;
    onRenameLink?: (
        eventId: string,
        target: string,
        label: string,
        nextTarget?: string
    ) => Promise<void>;
    /** Le titre est encore en route : la ligne le montre plutôt que de mentir. */
    searching?: boolean;
    /** Redemander au site ce qu'il dit de ce lien. */
    onReload?: (item: LinkedFileItem) => void;
    /** L'adresse vient d'être copiée — au panneau de le dire à l'écran. */
    onCopied?: () => void;
    /** Le presse-papiers a refusé l'écriture. */
    onCopyFailed?: () => void;
    /** L'adresse de la ligne dont la bulle est ouverte, s'il y en a une. */
    openTooltipFor?: string | null;
    /** Cette ligne vient d'ouvrir la sienne. */
    onTooltipOpen?: (target: string) => void;
    onOpenLink?: (item: LinkedFileItem) => Promise<void> | void;
    onCopyLink?: (target: string) => Promise<void>;
    /** La croix a été lâchée avant le bout : au panneau de dire pourquoi rien
        ne s'est passé. */
    onRemoveHint?: () => void;
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
        try {
            if (onCopyLink) {
                await onCopyLink(item.target);
            } else {
                await navigator.clipboard.writeText(item.target);
            }
            onCopied?.();
        } catch {
            onCopyFailed?.();
            return;
        }
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

    const remove = async () => {
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

    /*
     * La croix ne supprime plus au premier contact.
     *
     * Sur un téléphone les boutons d'une ligne n'apparaissent qu'au premier
     * appui, et le second — celui qui devait ouvrir le lien — tombe sur la
     * croix qui vient de paraître à cet endroit. Un lien disparaissait donc
     * sans que rien n'ait été demandé, et rien ne le ramenait.
     *
     * Elle se remplit maintenant sous le doigt et n'emporte la ligne qu'au
     * bout. Relâchée avant, elle ne fait rien — et le dit, parce qu'un bouton
     * qui ne fait rien passe autrement pour un bouton cassé.
     */
    const holdTimerRef = React.useRef<number | null>(null);
    const [arming, setArming] = React.useState(false);

    const clearHold = React.useCallback(() => {
        if (holdTimerRef.current === null) return;
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
    }, []);

    React.useEffect(() => () => clearHold(), [clearHold]);

    const startHold = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || removing) return;
        event.preventDefault();
        event.stopPropagation();
        clearHold();
        setArming(true);
        holdTimerRef.current = window.setTimeout(() => {
            holdTimerRef.current = null;
            setArming(false);
            /* Le seuil est atteint : le téléphone le dit sous le doigt, à
               l'instant où il l'est. Sans cela on ne l'apprend qu'après, en
               voyant la ligne partir. */
            navigator.vibrate?.(18);
            void remove();
        }, HOLD_TO_REMOVE_MS);
    };

    const cancelHold = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (holdTimerRef.current === null) return;
        clearHold();
        setArming(false);
        onRemoveHint?.();
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
                {onReadAttachment && isImageTarget(item.target) ? (
                    <LinkedFileThumbnail
                        target={item.target}
                        name={displayName}
                        onRead={onReadAttachment}
                    />
                ) : null}
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
                {/*
                 * Redemander au site ce qu'il dit de ce lien.
                 *
                 * Le titre et l'adresse canonique se cherchent une fois, au
                 * moment de l'ajout, avec deux secondes et demie pour répondre.
                 * Un réseau lent, un site qui fait patienter, et il reste une
                 * ligne nommée d'après son hôte — et, pour un lien de partage,
                 * une adresse qui ne porte ni le compte ni la date : c'est
                 * l'adresse canonique qui les porte, et elle n'est arrivée pour
                 * aucun des liens ajoutés ce jour-là. Ce bouton refait la
                 * demande, avec le fichier déjà écrit et rien qui attend.
                 */}
                {eventId && onReload && item.kind === "web" && !renaming && (
                    <button
                        type="button"
                        className="nc-linked-file-reload-button"
                        aria-label={t("Reload this link")}
                        title={t("Reload this link")}
                        disabled={searching}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            resetTapTracker();
                            onReload(item);
                        }}
                    >
                        <ReloadIcon />
                    </button>
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
                        className={`nc-linked-file-remove${
                            arming ? " is-arming" : ""
                        }`}
                        /* Le remplissage dure ce que dure l'attente : une seule
                           valeur, lue par l'animation plutôt que réécrite à
                           côté d'elle. */
                        style={
                            {
                                "--nc-hold-duration": `${HOLD_TO_REMOVE_MS}ms`,
                            } as React.CSSProperties
                        }
                        aria-label={`${t("Hold to remove")} — ${displayName}`}
                        title={t("Hold to remove")}
                        disabled={removing}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onPointerDown={startHold}
                        onPointerUp={cancelHold}
                        onPointerLeave={cancelHold}
                        onPointerCancel={cancelHold}
                        /* Un appui tenu ouvre sinon le menu de sélection du
                           système par-dessus le geste en cours. */
                        onContextMenu={(event) => event.preventDefault()}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            /* `detail` à zéro : Entrée ou la barre d'espace. Au
                               clavier il n'y a pas de pression à tenir, et pas
                               d'appui à côté non plus. */
                            if (event.detail === 0) void remove();
                        }}
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
    onCopyLink,
    onPickAttachment,
    onReadAttachment,
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

            /* Le site n'a rien dit, mais le lien mène quelque part, et c'est
               là que se lisent le compte et la date : l'adresse d'arrivée est
               gardée même sans réponse, tant qu'elle nomme un vrai élément du
               même site (voir resolvedTarget). */
            if (destination === target) {
                destination = resolvedTarget(target, resolved);
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
        async (id: string, target: string, quiet = false) => {
            if (!onFetchPage || !onRenameLink) return;
            setSearching((current) =>
                current.includes(target) ? current : [...current, target]
            );
            try {
                const { label, destination } = await titleFor(target);
                if (label || destination !== target) {
                    await onRenameLink(id, target, label, destination);
                }
                // Nobody asked for this one: a link the panel looked through
                // on its own says nothing when it finds nothing.
                if (!label && !quiet) {
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

    /*
     * Les liens qui en cachent un autre se font ouvrir tout seuls.
     *
     * Une adresse de partage — `vm.tiktok.com/ZN88…`, `bit.ly/3xYz` — ne dit
     * rien de ce qu'il y a au bout : ni le compte, ni la date, ni de quoi voir
     * que deux partages sont la même vidéo. Tout cela se lit dans l'adresse
     * canonique, et elle se demande une seule fois, à l'ajout, avec deux
     * secondes et demie pour répondre. Quand ce délai passe — réseau lent, site
     * qui fait patienter — la note garde le code, et le garde pour toujours.
     *
     * Le panneau les rouvre donc lui-même, à l'ouverture de l'événement : un à
     * la fois pour ne pas partir en rafale, seulement ceux dont l'adresse est
     * encore un code (voir shareLink), et une seule fois chacun — l'adresse
     * elle-même est le registre de ce qui a été fait, puisqu'un lien résolu
     * n'en est plus un.
     */
    const sweptRef = React.useRef(new Set<string>());
    React.useEffect(() => {
        sweptRef.current = new Set<string>();
    }, [eventId]);

    React.useEffect(() => {
        if (!eventId || !onFetchPage || !onRenameLink) return;
        const pending = items.filter(
            (item) =>
                needsResolving(item.target, item.kind) &&
                !sweptRef.current.has(item.target)
        );
        if (!pending.length) return;

        let cancelled = false;
        for (const item of pending) sweptRef.current.add(item.target);

        void (async () => {
            for (const item of pending) {
                if (cancelled) return;
                await lookUpTitle(eventId, item.target, true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [eventId, items, lookUpTitle, onFetchPage, onRenameLink]);

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
                            onReload={(link) => {
                                if (!eventId) return;
                                setNotice(null);
                                void lookUpTitle(eventId, link.target);
                            }}
                            openTooltipFor={openTooltipFor}
                            onTooltipOpen={setOpenTooltipFor}
                            onCopied={() =>
                                setToast({
                                    title: t("Link copied"),
                                    detail: t("Paste it wherever you like"),
                                })
                            }
                            onCopyFailed={() =>
                                setToast({
                                    title: t("Could not copy link"),
                                })
                            }
                            onRemoveHint={() =>
                                setToast({
                                    title: t("Hold to remove"),
                                    detail: t(
                                        "Keep pressing the cross until it fills"
                                    ),
                                })
                            }
                            onOpenLink={onOpenLink}
                            onCopyLink={onCopyLink}
                            onReadAttachment={
                                onReadAttachment && eventId
                                    ? (target: string) =>
                                          onReadAttachment(eventId, target)
                                    : undefined
                            }
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
                    {/* La chaîne de la ligne fermée devient une loupe, à la
                        même place et à la même taille : le contrôle change de
                        métier sans changer d'endroit. Sans elle le champ
                        s'ouvrait nu, et la ligne d'où il sortait n'était plus
                        signalée par rien. */}
                    <span className="nc-link-search-icon" aria-hidden="true">
                        <SearchIcon />
                    </span>
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
                        placeholder={t("Search a document or paste a link")}
                        disabled={saving}
                        aria-label={t("Search a document or paste a link")}
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
    isTask: boolean;
    changes: RecurringEditChange[];
    onCancel: () => void;
    onConfirm: (scope: RecurringEditScope) => void;
}

/**
 * One decision, made on exit, with the exact pending diff visible.
 * The buttons map directly to the two persistence paths in EventPanel:
 * occurrence keeps the detachment contract; series keeps the full update.
 */
export function RecurringScopeDialog({
    isTask,
    changes,
    onCancel,
    onConfirm,
}: RecurringScopeDialogProps) {
    React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [onCancel]);

    return ReactDOM.createPortal(
        <div
            className="nc-scope-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nc-scope-title"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <div className="nc-scope-dialog">
                <div className="nc-scope-title" id="nc-scope-title">
                    {isTask
                        ? t("Edit recurring task")
                        : t("Edit recurring event")}
                </div>
                <div className="nc-scope-subtitle">
                    {t("Choose how to apply these changes.")}
                </div>

                {changes.length > 0 && (
                    <div className="nc-scope-changes">
                        <div className="nc-scope-changes-title">
                            {t("Changes")}
                        </div>
                        <div className="nc-scope-change-list">
                            {changes.map((change) => (
                                <div
                                    className="nc-scope-change"
                                    key={change.key}
                                >
                                    <div className="nc-scope-change-label">
                                        {t(change.label)}
                                    </div>
                                    <div className="nc-scope-change-values">
                                        <span className="nc-scope-change-before">
                                            {t(change.before)}
                                        </span>
                                        <ArrowRightIcon />
                                        <span className="nc-scope-change-after">
                                            {t(change.after)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="nc-scope-choice-actions">
                    <button
                        type="button"
                        className="nc-scope-choice-btn"
                        onClick={() => onConfirm("occurrence")}
                    >
                        {isTask ? t("This task only") : t("This event only")}
                    </button>
                    <button
                        type="button"
                        className="nc-scope-choice-btn"
                        onClick={() => onConfirm("series")}
                    >
                        {isTask ? t("All tasks") : t("All events")}
                    </button>
                </div>

                <button
                    type="button"
                    className="nc-scope-cancel-btn"
                    onClick={onCancel}
                >
                    {t("Cancel")}
                </button>
            </div>
        </div>,
        getEventPanelPortalTarget()
    );
}

// ── Description row ────────────────────────────────────────

export interface DescriptionFocusRequest {
    revision: number;
    selectionStart: number;
    selectionEnd: number;
}

interface DescriptionLineSelection {
    index: number;
    start: number;
    end: number;
}

function descriptionLineSelection(
    description: string,
    selectionStart: number,
    selectionEnd: number
): DescriptionLineSelection {
    const rawLines = description.split("\n");
    const start = Math.max(0, Math.min(selectionStart, description.length));
    const end = Math.max(start, Math.min(selectionEnd, description.length));
    let index = 0;
    let lineStart = 0;

    for (let current = 0; current < rawLines.length; current += 1) {
        const lineEnd = lineStart + rawLines[current].length;
        index = current;
        if (start <= lineEnd || current === rawLines.length - 1) break;
        lineStart = lineEnd + 1;
    }

    const raw = rawLines[index] ?? "";
    const prefix = taskPrefixLength(raw) ?? 0;
    const contentLength = Math.max(0, raw.length - prefix);
    const clampLocal = (offset: number) =>
        Math.max(0, Math.min(offset - lineStart - prefix, contentLength));
    const localStart = clampLocal(start);
    const localEnd = Math.max(localStart, clampLocal(end));
    return { index, start: localStart, end: localEnd };
}

interface DescriptionRowProps {
    description: string;
    editable: boolean;
    setDescription: (v: string) => void;
    onCommit: () => void;
    toolbar?: React.ReactNode;
    focusRequest?: DescriptionFocusRequest | null;
}

export function DescriptionRow({
    description,
    editable,
    setDescription,
    onCommit,
    toolbar,
    focusRequest,
}: DescriptionRowProps) {
    const fieldRef = React.useRef<HTMLTextAreaElement>(null);
    /*
     * Written as text, read as a note — including while it is being written.
     *
     * A line starting `- [ ]` is a step, exactly as it is in Obsidian, and it
     * stays drawn as one while the rest of the description is edited: only the
     * line the caret is on shows the characters it is made of. Editing the
     * whole thing as raw text meant every box turned back into `- [x]` the
     * moment one word had to be changed somewhere else.
     *
     * A description with no step in it is one field, as it always was. There is
     * nothing to reveal line by line in a paragraph, and cutting prose into
     * lines would take away the one thing a textarea does well.
     */
    const lines = readChecklist(description);
    const asNote = lines.some((line) => line.kind === "task");
    const [editing, setEditing] = React.useState<number | null>(null);
    /** Where the selection goes once the line it belongs to is on screen. */
    const selectionRef = React.useRef<{ start: number; end: number } | null>(
        null
    );
    const lineRef = React.useRef<HTMLTextAreaElement>(null);

    React.useLayoutEffect(() => {
        const field = asNote ? lineRef.current : fieldRef.current;
        if (!field) return;
        field.style.height = "auto";
        field.style.height = `${field.scrollHeight}px`;
    }, [asNote, description, editing]);

    React.useLayoutEffect(() => {
        const field = lineRef.current;
        const selection = selectionRef.current;
        if (!field || !selection) return;
        selectionRef.current = null;
        field.focus();
        const start = Math.min(selection.start, field.value.length);
        const end = Math.max(
            start,
            Math.min(selection.end, field.value.length)
        );
        field.setSelectionRange(start, end);
    }, [editing]);

    React.useLayoutEffect(() => {
        if (!focusRequest || !editable) return;

        if (!asNote) {
            const field = fieldRef.current;
            if (!field) return;
            field.focus();
            const start = Math.min(
                focusRequest.selectionStart,
                field.value.length
            );
            const end = Math.max(
                start,
                Math.min(focusRequest.selectionEnd, field.value.length)
            );
            field.setSelectionRange(start, end);
            return;
        }

        const target = descriptionLineSelection(
            description,
            focusRequest.selectionStart,
            focusRequest.selectionEnd
        );
        if (editing === target.index && lineRef.current) {
            const field = lineRef.current;
            field.focus();
            const start = Math.min(target.start, field.value.length);
            const end = Math.max(
                start,
                Math.min(target.end, field.value.length)
            );
            field.setSelectionRange(start, end);
            selectionRef.current = null;
            return;
        }

        selectionRef.current = {
            start: target.start,
            end: target.end,
        };
        setEditing(target.index);
        // Toolbar focus is a one-shot hand-off. Typing changes the
        // description but must not replay this request or reset the caret.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusRequest?.revision]);

    /** Opens a line for editing, with the caret placed inside it. */
    const edit = (index: number, caret: number) => {
        if (!editable) return;
        selectionRef.current = { start: caret, end: caret };
        setEditing(index);
    };

    const leave = () => {
        setEditing(null);
        onCommit();
    };

    /** Applies a cut or a join, and follows the caret to where it landed.
     *
     *  La coupe rend une position dans la ligne entiere ; le champ, lui, ne
     *  tient que ce que la ligne dit. La case de la ligne d'arrivee est donc
     *  retranchee — sans quoi une etape continuee ouvrirait avec le curseur six
     *  caracteres plus loin que son premier. */
    const move = (next: CaretMove) => {
        setDescription(next.text);
        const landed = next.text.split("\n")[next.focus] ?? "";
        const prefix = taskPrefixLength(landed) ?? 0;
        const caret = Math.max(0, next.caret - prefix);
        selectionRef.current = { start: caret, end: caret };
        setEditing(next.focus);
    };

    if (!asNote) {
        return (
            <div className="nc-panel-row nc-panel-row-desc">
                <span className="nc-panel-row-icon">
                    <LinesIcon />
                </span>
                <div className="nc-panel-row-content">
                    {toolbar}
                    <textarea
                        ref={fieldRef}
                        rows={1}
                        className="nc-panel-textarea"
                        value={description}
                        /* An empty row that says what it is FOR beats one that
                           says it is empty, which was visible already. */
                        placeholder={t("Add a description")}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={onCommit}
                        readOnly={!editable}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="nc-panel-row nc-panel-row-desc">
            <span className="nc-panel-row-icon">
                <LinesIcon />
            </span>
            <div className="nc-panel-row-content">
                {toolbar}
                <div className="nc-panel-checklist">
                    {lines.map((line, index) => {
                        const editingThis = index === editing;
                        const raw = description.split("\n")[index] ?? "";
                        /* Le prefixe est ce que la case occupe : le champ ne
                           tient que le titre, donc tout ce qui en sort — le
                           texte reecrit, la position du curseur — repasse par
                           lui. Zero sur une ligne de prose. */
                        const prefix = taskPrefixLength(raw) ?? 0;
                        const field = (
                            <textarea
                                key="edit"
                                ref={lineRef}
                                rows={1}
                                className="nc-panel-checklist-edit"
                                value={raw.slice(prefix)}
                                onChange={(e) =>
                                    setDescription(
                                        replaceLine(
                                            description,
                                            index,
                                            raw.slice(0, prefix) +
                                                e.target.value
                                        )
                                    )
                                }
                                onBlur={leave}
                                onKeyDown={(e) => {
                                    const input = e.currentTarget;
                                    const at = input.selectionStart;
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        move(
                                            splitLine(
                                                description,
                                                index,
                                                prefix + at
                                            )
                                        );
                                        return;
                                    }
                                    if (
                                        e.key === "Backspace" &&
                                        at === 0 &&
                                        input.selectionEnd === 0
                                    ) {
                                        e.preventDefault();
                                        move(mergeLine(description, index));
                                        return;
                                    }
                                    /* Up and down leave the line the way they
                                       would leave it in one long field: at its
                                       edges, and only there. */
                                    if (
                                        e.key === "ArrowUp" &&
                                        at === 0 &&
                                        index > 0
                                    ) {
                                        e.preventDefault();
                                        const above = lines[index - 1];
                                        edit(
                                            index - 1,
                                            above.kind === "task"
                                                ? above.title.length
                                                : above.text.length
                                        );
                                        return;
                                    }
                                    if (
                                        e.key === "ArrowDown" &&
                                        at === input.value.length &&
                                        index < lines.length - 1
                                    ) {
                                        e.preventDefault();
                                        edit(index + 1, 0);
                                        return;
                                    }
                                    if (e.key === "Escape") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        leave();
                                    }
                                }}
                            />
                        );

                        /* Une <div> et pas un <label> : un label
                           renverrait le clic sur le texte a la case, et
                           ce clic-la ouvre l'edition. Toucher le texte
                           d'une etape doit y poser le curseur, comme
                           dans une note ; seule la case coche.

                           La case reste dessinee pendant qu'on ecrit la
                           ligne, comme en apercu dans Obsidian : des que
                           `- [ ] ` est tape la ligne EST une etape, et la
                           voir redevenir ses cinq caracteres le temps de
                           la remplir donne a croire qu'elle n'a pas pris.
                           C'est aussi ce qui garde le meme <input> monte
                           d'un etat a l'autre : cocher depuis la ligne
                           ouverte perdrait le clic si la case naissait
                           entre l'appui et le relachement. */
                        if (line.kind === "task") {
                            return (
                                <div
                                    key={index}
                                    className={`nc-panel-checklist-line${
                                        line.done ? " nc-done" : ""
                                    }`}
                                    style={{
                                        paddingLeft: `${
                                            line.indent.length * 6
                                        }px`,
                                    }}
                                    onClick={
                                        editingThis
                                            ? undefined
                                            : () =>
                                                  edit(index, line.title.length)
                                    }
                                    role="presentation"
                                >
                                    <input
                                        type="checkbox"
                                        checked={line.done}
                                        disabled={!editable}
                                        /* The box is not a way into the text:
                                           ticking one is a whole gesture on its
                                           own, and opening the editor under the
                                           finger would take the tick away. */
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => {
                                            setDescription(
                                                toggleLine(description, index)
                                            );
                                            onCommit();
                                        }}
                                    />
                                    {editingThis ? (
                                        field
                                    ) : (
                                        <span>{line.title}</span>
                                    )}
                                </div>
                            );
                        }

                        if (editingThis) {
                            return (
                                <React.Fragment key={index}>
                                    {field}
                                </React.Fragment>
                            );
                        }

                        return (
                            <p
                                key={index}
                                className="nc-panel-checklist-text"
                                onClick={() => edit(index, line.text.length)}
                                role="presentation"
                            >
                                {line.text || "\u00a0"}
                            </p>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Le nom de chaque carte, tel qu'il s'écrit dans son propre magasin. */
const MAPS_APP_NAMES: Record<MapsApp, string> = {
    google: "Google Maps",
    citymapper: "Citymapper",
    moovit: "Moovit",
    waze: "Waze",
};

/**
 * La marque de chaque carte, portée par l'application.
 *
 * `mapsAppIcons` vient du téléphone : pour chaque application installée,
 * Android répond l'icône qu'il dessine lui-même, et c'est celle qu'il faut —
 * on reconnaît une application à ce qu'on voit sur son écran d'accueil. Sur
 * ordinateur il n'y a personne pour répondre, on n'y ouvre que des sites, et
 * le menu sortait en lignes de texte nu. Ces marques-là ne servent donc que
 * faute de mieux, et elles sont les vraies (BrandIcons) plutôt que dessinées
 * de mémoire.
 *
 * Moovit n'en a pas : elle n'est proposée que là où le téléphone répond.
 */
const MAPS_APP_BRANDS: Partial<Record<MapsApp, BrandName>> = {
    google: "googlemaps",
    citymapper: "citymapper",
    waze: "waze",
};

interface LocationRowProps {
    location: string;
    /** Le point que le flux publie, quand il en publie un : c'est lui qui
     *  ouvre la carte, le texte du lieu n'y servant qu'à défaut. */
    geo?: string;
    /** L'adresse réglée sur le lien ICS d'où vient l'évènement. Elle prime :
     *  elle a été écrite parce que le flux ne mène pas au bon endroit. */
    linkAddress?: string;
    /** Comment on compte s'y rendre, quand la carte ouvre un itinéraire.
     *  Absent, la carte choisit — c'est le repos du réglage. */
    travelMode?: MapsTravelMode;
    /** L'application réglée, ou « ask » pour le menu — c'est le repos. */
    mapsApp?: MapsAppChoice;
    /** Les cartes que cette machine peut ouvrir : sur téléphone, celles qui y
     *  sont installées ; sur ordinateur, celles qui ont un site d'itinéraire.
     *  Le parent la calcule, la rangée ne fait qu'en retirer ce qui ne sait
     *  pas lire ce lieu-ci. */
    mapsApps?: readonly MapsApp[];
    /** Vrai là où les applications répondent à leur propre schéma, c'est-à-dire
     *  sur le téléphone : un lien https n'y arrive pas à coup sûr. */
    nativeMapsApps?: boolean;
    /** L'icône de chaque carte, en `data:` URI, telle que le téléphone la
     *  dessine. Absente, l'entrée s'affiche sans image. */
    mapsAppIcons?: Partial<Record<MapsApp, string>>;
    /** Les autres cartes du téléphone : celles que le système signale comme
     *  sachant ouvrir un point, sans qu'on connaisse leur itinéraire. */
    geoApps?: readonly GeoApp[];
    editable: boolean;
    setLocation: (value: string) => void;
    onAutoSave: () => void;
    /** Ouvre la carte. Absent là où l'application ne sait pas ouvrir un lien
     *  extérieur — le lieu s'y lit alors sans se présenter comme un lien.
     *  Le second argument vise une application précise : sans lui, Android
     *  rouvrirait son propre sélecteur par-dessus la feuille qu'on ferme. */
    onOpenLocation?: (url: string, targetPackage?: string) => void;
}

/**
 * Où l'évènement se tient.
 *
 * Le lieu était lu du flux et écrit dans la note depuis toujours — la salle
 * d'un cours y figure — mais rien ne le montrait : il fallait ouvrir le
 * fichier pour savoir où aller. Il prend donc sa rangée juste au-dessus de la
 * description, à la place que Notion Calendar lui donne.
 *
 * Rien sur un évènement verrouillé et sans lieu : la même règle que la
 * description, qui ne se présente pas comme un champ à remplir quand on ne
 * peut pas le remplir.
 */
export function LocationRow({
    location,
    geo,
    linkAddress,
    travelMode,
    mapsApp = "ask",
    mapsApps = ["google"],
    nativeMapsApps = false,
    mapsAppIcons,
    geoApps,
    editable,
    setLocation,
    onAutoSave,
    onOpenLocation,
}: LocationRowProps) {
    /* Sur le telephone, ce qui propose un choix monte du bas et se ferme en
       touchant a cote : un menu ancre sur sa rangee est une forme d'ordinateur.
       C'est la seule difference entre les deux, le contenu ne change pas. */
    const sheet = isAndroidRuntime();
    const triggerRef = React.useRef<HTMLElement | null>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});

    const destination = locationDestinationFor(location, geo, linkAddress);
    /* Ce que cette machine peut ouvrir, moins ce qui ne sait pas lire ce
       lieu-ci : trois des quatre cartes ne visent qu'un point. */
    const offered = destination
        ? mapsAppsFor(destination, {
              native: nativeMapsApps,
              installed: mapsApps,
          })
        : [];

    const urlFor = (app: MapsApp) =>
        destination
            ? mapsUrlFor(destination, app, {
                  travelMode,
                  native: nativeMapsApps,
              })
            : null;

    /* Elles ne savent recevoir qu'une épingle : sur une salle écrite à la main
       elles n'ont rien à ouvrir, et le menu retombe sur Maps seule. */
    const geoOffered =
        destination?.kind === "point" && nativeMapsApps ? geoApps ?? [] : [];

    /* Google en dernier recours : un réglage garde une carte choisie un jour
       où elle convenait, et elle seule sait lire une salle écrite à la main. */
    const settled =
        mapsApp !== "ask" && offered.includes(mapsApp)
            ? mapsApp
            : offered.length === 1 && geoOffered.length === 0
            ? offered[0]
            : mapsApp !== "ask" && offered.includes("google")
            ? "google"
            : null;

    const link = onOpenLocation
        ? destination && settled
            ? urlFor(settled)
            : locationLinkFor(location, geo, linkAddress, travelMode)
        : null;

    React.useEffect(() => {
        if (!menuOpen) return;
        const close = (event: PointerEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            setMenuOpen(false);
        };
        const closeForLayout = () => setMenuOpen(false);
        document.addEventListener("pointerdown", close, true);
        window.addEventListener("resize", closeForLayout);
        window.addEventListener("scroll", closeForLayout, true);
        return () => {
            document.removeEventListener("pointerdown", close, true);
            window.removeEventListener("resize", closeForLayout);
            window.removeEventListener("scroll", closeForLayout, true);
        };
    }, [menuOpen]);

    if (!editable && !location) return null;

    /*
     * Un menu n'a de raison d'être que devant un choix : une seule carte, une
     * carte réglée ou un lien de visioconférence s'ouvrent du premier coup.
     */
    const open = (event: React.MouseEvent<HTMLElement>) => {
        if (!onOpenLocation) return;
        if (settled || !destination || offered.length === 0) {
            if (link) onOpenLocation(link);
            return;
        }
        triggerRef.current = event.currentTarget;
        const rect = event.currentTarget.getBoundingClientRect();
        const placement = placeFlyout(rect, window.innerHeight, {
            gap: 4,
            margin: 8,
            minHeight: 132,
        });
        const width = 200;
        setMenuStyle({
            left: Math.max(
                8,
                Math.min(rect.left, window.innerWidth - width - 8)
            ),
            width,
            top: placement.top ?? undefined,
            bottom: placement.bottom ?? undefined,
            maxHeight: placement.maxHeight,
        });
        setMenuOpen(true);
    };

    return (
        <>
            <div className="nc-panel-row nc-panel-row-location">
                <span className="nc-panel-row-icon">
                    <MapPinIcon />
                </span>
                <div className="nc-panel-row-content">
                    {editable ? (
                        <input
                            type="text"
                            className="nc-panel-text-input nc-panel-location-input"
                            value={location}
                            placeholder={t("Location")}
                            aria-label={t("Location")}
                            onChange={(event) =>
                                setLocation(event.target.value)
                            }
                            onBlur={onAutoSave}
                        />
                    ) : link ? (
                        /* Verrouillé, le texte EST le lien : rien d'autre à faire
                       de cette rangée que de la suivre, comme dans Notion. */
                        <button
                            type="button"
                            data-nc-location-open="true"
                            className="nc-panel-location-text nc-panel-location-link"
                            aria-label={t("Open in Maps")}
                            title={t("Open in Maps")}
                            onClick={open}
                        >
                            {location}
                        </button>
                    ) : (
                        <span className="nc-panel-location-text">
                            {location}
                        </span>
                    )}
                </div>
                {/* Modifiable, le champ garde le clic pour écrire : la carte prend
                donc son propre bouton, au bout de la rangée. */}
                {editable && link && (
                    <button
                        type="button"
                        data-nc-location-open="true"
                        className="nc-panel-location-open"
                        aria-label={t("Open in Maps")}
                        title={t("Open in Maps")}
                        onClick={open}
                    >
                        <MapPinIcon size={14} />
                    </button>
                )}
            </div>
            {menuOpen &&
                sheet &&
                ReactDOM.createPortal(
                    /* Le voile ferme la feuille comme le fait Android, et
                       porte la marque du panneau : sans elle, le toucher qui
                       ferme le menu fermerait la fiche avec lui. */
                    <div
                        className="nc-panel-maps-veil"
                        data-nc-popup-portal="true"
                        onClick={() => setMenuOpen(false)}
                    />,
                    document.body
                )}
            {menuOpen &&
                ReactDOM.createPortal(
                    <div
                        ref={menuRef}
                        className={`nc-panel-maps-menu${
                            sheet ? " nc-panel-maps-sheet" : ""
                        }`}
                        role="menu"
                        style={sheet ? undefined : menuStyle}
                        data-nc-popup-portal="true"
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="nc-panel-maps-heading">
                            {t("Open the location in")}
                        </div>
                        {offered.map((app) => (
                            <button
                                key={app}
                                type="button"
                                role="menuitem"
                                className="nc-panel-maps-option"
                                data-nc-maps-app={app}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuOpen(false);
                                    const url = urlFor(app);
                                    if (url) onOpenLocation?.(url);
                                }}
                            >
                                {mapsAppIcons?.[app] ? (
                                    <img
                                        className="nc-panel-maps-icon"
                                        src={mapsAppIcons[app]}
                                        alt=""
                                    />
                                ) : (
                                    MAPS_APP_BRANDS[app] && (
                                        <span className="nc-panel-maps-icon nc-panel-maps-mark">
                                            <BrandIcon
                                                brand={
                                                    MAPS_APP_BRANDS[
                                                        app
                                                    ] as BrandName
                                                }
                                            />
                                        </span>
                                    )
                                )}
                                <span>{MAPS_APP_NAMES[app]}</span>
                            </button>
                        ))}
                        {geoOffered.map((app) => (
                            <button
                                key={app.package}
                                type="button"
                                role="menuitem"
                                className="nc-panel-maps-option"
                                data-nc-maps-package={app.package}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuOpen(false);
                                    const url = destination
                                        ? geoUrlFor(destination)
                                        : null;
                                    if (url) onOpenLocation?.(url, app.package);
                                }}
                            >
                                {app.icon && (
                                    <img
                                        className="nc-panel-maps-icon"
                                        src={app.icon}
                                        alt=""
                                    />
                                )}
                                <span>{app.label}</span>
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
        </>
    );
}
