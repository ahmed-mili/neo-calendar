import * as React from "react";
import * as ReactDOM from "react-dom";
import { CheckIcon as CheckMarkIcon } from "./Icons";
import { placeFlyout } from "./flyoutPlacement";
import { PresetKey } from "./recurrence";
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

/**
 * The compact controls directly below an event's date, matching Notion
 * Calendar's editor instead of spending one full property row on each switch.
 *
 * The Repeat flyout deliberately reuses the calendar selector's DOM classes,
 * placement algorithm and portal behavior. This is not a look-alike: it gets
 * the same radius, glass, shadow, hover and open-above behavior from the exact
 * same stylesheet rules as the calendar-changing menu.
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
                {t("All-day")}
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
                {repeatLabel}
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
