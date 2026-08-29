import * as React from "react";
import * as ReactDOM from "react-dom";
import { CheckIcon as CheckMarkIcon } from "./Icons";
import { RepeatIcon } from "./EventPanelIcons";
import { placeFlyout } from "./flyoutPlacement";
import { PresetKey } from "./recurrence";
import { setReminderDisplayAllDay } from "./reminderChoices";
import { t } from "../i18n";

function getEventPanelPortalTarget(): HTMLElement {
    const isAndroid =
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body.classList.contains("nc-platform-android") ||
        document.documentElement.dataset.neoCalendarPlatform === "android";

    return isAndroid
        ? document.getElementById("nc-android-overlay-root") ?? document.body
        : document.body;
}

const REPEAT_CHOICES: { key: PresetKey | "once"; label: string }[] = [
    { key: "once", label: t("Once") },
    { key: "daily", label: t("Every day") },
    { key: "weekly", label: t("Every week") },
    { key: "monthly", label: t("Every month") },
    { key: "yearly", label: t("Every year") },
    { key: "custom", label: t("Custom…") },
];

interface DateOptionsRowProps {
    allDay: boolean;
    editable: boolean;
    onToggleAllDay: () => void;
    isRecurring: boolean;
    currentPreset: PresetKey;
    summary: string;
    onChooseRepeat: (key: PresetKey | "once") => void;
}

function AllDayIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.25" />
            <path
                d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.15 1.15M11.45 11.45l1.15 1.15M12.6 3.4l-1.15 1.15M4.55 11.45 3.4 12.6"
                stroke="currentColor"
                strokeWidth="1.15"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * The two schedule properties that belong directly under Date. They deliberately
 * read as one flat two-column row rather than as raised pills: the date block is
 * one unit, and All-day / Repeat are its two compact actions.
 *
 * The Repeat flyout still reuses the calendar selector's DOM classes, placement
 * algorithm and portal behavior, so its interaction remains unchanged.
 */
export function DateOptionsRow({
    allDay,
    editable,
    onToggleAllDay,
    isRecurring,
    currentPreset,
    summary,
    onChooseRepeat,
}: DateOptionsRowProps) {
    const [open, setOpen] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{
        top: number | null;
        bottom: number | null;
        left: number;
        width: number;
        maxHeight: number;
    } | null>(null);
    const rowRef = React.useRef<HTMLDivElement>(null);
    const repeatRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    // RemindersRow is the next property rendered by EventPanel. It predates the
    // all-day reminder design and has no schedule prop, so publish the one active
    // panel's mode before that sibling renders. This changes only which preset
    // numbers/labels the existing reminder row reads; its click/save path stays
    // exactly the same.
    setReminderDisplayAllDay(allDay);

    const openMenu = () => {
        const anchor = rowRef.current?.getBoundingClientRect();
        if (anchor) {
            // Same placement contract as CalendarRow: same gap, screen margin,
            // minimum readable height and flip-above behavior.
            const p = placeFlyout(anchor, window.innerHeight, {
                gap: 5,
                margin: 12,
                minHeight: 160,
            });
            setMenuPos({
                top: p.top,
                bottom: p.bottom,
                left: anchor.left,
                width: anchor.width,
                maxHeight: p.maxHeight,
            });
        }
        setOpen(true);
    };

    React.useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (rowRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(false);
            repeatRef.current?.focus();
        };
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("keydown", onKey, true);
        };
    }, [open]);

    const repeatLabel = isRecurring && summary.trim() ? summary : t("Repeat");

    return (
        <div className="nc-panel-date-options" ref={rowRef}>
            <button
                type="button"
                className={`nc-panel-date-option${allDay ? " nc-active" : ""}`}
                data-date-option="all-day"
                aria-pressed={allDay}
                disabled={!editable}
                onClick={() => editable && onToggleAllDay()}
            >
                <span className="nc-panel-date-option-icon">
                    <AllDayIcon />
                </span>
                <span className="nc-panel-date-option-label">{t("All-day")}</span>
            </button>
            <button
                type="button"
                ref={repeatRef}
                className={`nc-panel-date-option${
                    isRecurring ? " nc-active" : ""
                }`}
                data-date-option="repeat"
                aria-expanded={open}
                disabled={!editable}
                title={isRecurring && summary ? summary : undefined}
                onClick={() => editable && (open ? setOpen(false) : openMenu())}
            >
                <span className="nc-panel-date-option-icon">
                    <RepeatIcon />
                </span>
                <span className="nc-panel-date-option-label">{repeatLabel}</span>
            </button>

            {open &&
                menuPos &&
                ReactDOM.createPortal(
                    <div
                        className="nc-cal-select-menu nc-repeat-select-menu"
                        role="menu"
                        aria-label={t("Repetition")}
                        ref={menuRef}
                        data-date-repeat-menu="true"
                        style={{
                            top: menuPos.top ?? undefined,
                            bottom: menuPos.bottom ?? undefined,
                            left: menuPos.left,
                            width: menuPos.width,
                            maxHeight: menuPos.maxHeight,
                        }}
                    >
                        <div className="nc-cal-select-heading">
                            {t("Repeat")}
                        </div>
                        {REPEAT_CHOICES.map((choice) => {
                            const selected =
                                choice.key === "once"
                                    ? !isRecurring
                                    : isRecurring &&
                                      choice.key === currentPreset;
                            return (
                                <button
                                    key={choice.key}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={selected}
                                    className={`nc-cal-select-option${
                                        selected ? " nc-active" : ""
                                    }`}
                                    onClick={() => {
                                        setOpen(false);
                                        onChooseRepeat(choice.key);
                                    }}
                                >
                                    <span className="nc-cal-select-check">
                                        {selected && (
                                            <CheckMarkIcon size={14} />
                                        )}
                                    </span>
                                    <span className="nc-cal-select-name">
                                        {choice.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>,
                    getEventPanelPortalTarget()
                )}
        </div>
    );
}
