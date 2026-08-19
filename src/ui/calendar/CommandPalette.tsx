import * as React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { DisplayEvent, ViewType } from "../types";
import { isAndroidRuntime } from "./CalendarUtils";
import { formatDayTitle, formatTime } from "./calendarFormatters";
import { SearchIcon, XIcon } from "./Icons";
import { t } from "../i18n";

interface CommandPaletteProps {
    visible: boolean;
    onDismiss: () => void;
    events: DisplayEvent[];
    onEventSelect: (eventId: string) => void;
    onViewChange: (view: ViewType) => void;
    onGoToday: () => void;
    onCreateEvent: () => void;
    onToggleSidebar: () => void;
    timeFormat24h?: boolean;
}

/** A day's worth of matches, under the date they fall on. */
interface EventDay {
    key: string;
    label: string;
    events: DisplayEvent[];
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "30 min", "1 h", "1 h 30" — the length read back beside the times. */
export function formatDuration(start: Date, end: Date): string {
    const minutes = Math.max(0, Math.round((+end - +start) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/** Matches, oldest first, gathered under the day they belong to. */
export function groupEventsByDay(events: DisplayEvent[]): EventDay[] {
    const days = new Map<string, EventDay>();
    for (const event of [...events].sort((a, b) => +a.start - +b.start)) {
        const key = dayKey(event.start);
        const day = days.get(key);
        if (day) {
            day.events.push(event);
            continue;
        }
        days.set(key, {
            key,
            label: formatDayTitle(event.start),
            events: [event],
        });
    }
    return [...days.values()];
}

/** How long the search screen takes to arrive, matched in mobile.css. */
const SEARCH_ENTER_MS = 260;

/** How long the search screen takes to leave, matched in mobile.css. */
const SEARCH_EXIT_MS = 220;

interface CommandItem {
    id: string;
    label: string;
    category: string;
    action: () => void;
}

export default function CommandPalette({
    visible,
    onDismiss,
    events,
    onEventSelect,
    onViewChange,
    onGoToday,
    onCreateEvent,
    onToggleSidebar,
    timeFormat24h = true,
}: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Only on the way in: clearing on the way out emptied the results while the
    // screen was still fading, so the matches vanished before the screen did.
    useEffect(() => {
        if (!visible) return;
        setQuery("");
        setSelectedIndex(0);

        /*
         * The keyboard waits for the screen to finish arriving.
         *
         * Focusing straight away raised it during the entry animation, and the
         * keyboard takes about 40% of the height with it: every `dvh` in the
         * calendar's layout changed mid-transition, so the grid was being laid
         * out again on the very frames it was supposed to be fading out on.
         * The settings never focus anything, which is why they never stuttered.
         */
        const timer = window.setTimeout(
            () => inputRef.current?.focus(),
            SEARCH_ENTER_MS
        );
        return () => window.clearTimeout(timer);
    }, [visible]);

    /*
     * The screen outlives `visible` by the length of its exit.
     *
     * React would otherwise unmount it on the spot: the calendar snapped back
     * and the results were simply gone, with nothing in between. It stays
     * mounted long enough to fade out over a grid that is already back.
     */
    const [mounted, setMounted] = useState(visible);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            setClosing(false);
            return;
        }
        if (!mounted) return;

        setClosing(true);
        const timer = window.setTimeout(() => {
            setMounted(false);
            setClosing(false);
        }, SEARCH_EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [visible, mounted]);

    useEffect(() => {
        if (typeof document === "undefined" || !isAndroidRuntime()) return;
        const body = document.body;
        body.classList.toggle("nc-search-open", mounted);
        body.classList.toggle("nc-search-closing", closing);
        return () => {
            body.classList.remove("nc-search-open");
            body.classList.remove("nc-search-closing");
        };
    }, [mounted, closing]);

    const commands: CommandItem[] = useMemo(() => {
        const actions: CommandItem[] = [
            {
                id: "today",
                label: t("Go to Today"),
                category: t("Navigation"),
                action: onGoToday,
            },
            {
                id: "view-day",
                label: t("Switch to Day View"),
                category: t("View"),
                action: () => onViewChange("day"),
            },
            {
                id: "view-week",
                label: t("Switch to Week View"),
                category: t("View"),
                action: () => onViewChange("week"),
            },
            {
                id: "view-month",
                label: t("Switch to Month View"),
                category: t("View"),
                action: () => onViewChange("month"),
            },
            {
                id: "view-3days",
                label: t("Switch to 3-Day View"),
                category: t("View"),
                action: () => onViewChange("3days"),
            },
            {
                id: "view-list",
                label: t("Switch to List View"),
                category: t("View"),
                action: () => onViewChange("list"),
            },
            {
                id: "new-event",
                label: t("Create New Event"),
                category: t("Actions"),
                action: onCreateEvent,
            },
            {
                id: "toggle-sidebar",
                label: t("Toggle Sidebar"),
                category: t("View"),
                action: onToggleSidebar,
            },
        ];

        const eventItems: CommandItem[] = events.map((e) => ({
            id: `event-${e.id}`,
            label: e.title,
            category: e.isSomeday
                ? `Someday - ${e.calendarName}`
                : e.calendarName,
            action: () => onEventSelect(e.id),
        }));

        // On a phone the command list is dead weight: every one of those
        // actions is a control already on screen, and they pushed the events —
        // the only thing worth searching for by name — below the fold.
        if (isAndroidRuntime()) return eventItems;

        return [...actions, ...eventItems];
    }, [
        events,
        onGoToday,
        onViewChange,
        onCreateEvent,
        onToggleSidebar,
        onEventSelect,
    ]);

    const filtered = useMemo(() => {
        if (!query.trim()) return commands.slice(0, 50);
        const q = query.toLowerCase();
        return commands
            .filter(
                (cmd) =>
                    cmd.label.toLowerCase().includes(q) ||
                    cmd.category.toLowerCase().includes(q)
            )
            .slice(0, 50);
    }, [query, commands]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            onDismiss();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
            return;
        }
        if (e.key === "Enter" && filtered[selectedIndex]) {
            e.preventDefault();
            filtered[selectedIndex].action();
            onDismiss();
            return;
        }
    };

    const android = isAndroidRuntime();

    if (android) {
        if (!mounted) return null;

        // Nothing typed, nothing listed: the search screen opens empty rather
        // than dumping every event in the calendar into it.
        const matches = query.trim()
            ? events.filter((event) =>
                  event.title.toLowerCase().includes(query.trim().toLowerCase())
              )
            : [];
        const days = groupEventsByDay(matches);

        return (
            <div className="nc-command-palette-backdrop nc-search-screen">
                <div className="nc-command-palette nc-search-screen__panel">
                    <div className="nc-search-screen__bar">
                        <div className="nc-search-screen__field">
                            <span
                                className="nc-search-screen__glass"
                                aria-hidden="true"
                            >
                                <SearchIcon />
                            </span>
                            <input
                                ref={inputRef}
                                className="nc-command-palette-input"
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t("Search events")}
                                aria-label={t("Search events")}
                            />
                            {query && (
                                <button
                                    type="button"
                                    className="nc-search-screen__clear"
                                    onClick={() => {
                                        setQuery("");
                                        inputRef.current?.focus();
                                    }}
                                    aria-label={t("Clear search")}
                                >
                                    <XIcon size={13} />
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            className="nc-search-screen__cancel"
                            onClick={onDismiss}
                        >
                            Cancel
                        </button>
                    </div>

                    <div className="nc-search-screen__results">
                        {query.trim() && days.length === 0 && (
                            <p className="nc-command-palette-empty">
                                No events found
                            </p>
                        )}
                        {days.map((day) => (
                            <section
                                className="nc-search-screen__day"
                                key={day.key}
                            >
                                <h3 className="nc-search-screen__date">
                                    {day.label}
                                </h3>
                                {day.events.map((event) => (
                                    <button
                                        type="button"
                                        key={event.id}
                                        className="nc-search-screen__card"
                                        style={
                                            {
                                                "--nc-search-color":
                                                    event.color,
                                            } as React.CSSProperties
                                        }
                                        onClick={() => {
                                            onEventSelect(event.id);
                                            onDismiss();
                                        }}
                                    >
                                        <span className="nc-search-screen__title">
                                            {event.title || "Untitled"}
                                        </span>
                                        <span className="nc-search-screen__meta">
                                            {event.allDay ? (
                                                <span className="nc-search-screen__time">
                                                    All day
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="nc-search-screen__time">
                                                        {formatTime(
                                                            event.start,
                                                            timeFormat24h
                                                        )}
                                                        {" – "}
                                                        {formatTime(
                                                            event.end,
                                                            timeFormat24h
                                                        )}
                                                    </span>
                                                    <span className="nc-search-screen__duration">
                                                        {formatDuration(
                                                            event.start,
                                                            event.end
                                                        )}
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                    </button>
                                ))}
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!visible) return null;

    return (
        <div className="nc-command-palette-backdrop" onClick={onDismiss}>
            <div
                className="nc-command-palette"
                onClick={(e) => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    className="nc-command-palette-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("Search events or type a command…")}
                />
                <div className="nc-command-palette-list">
                    {filtered.length === 0 && (
                        <div className="nc-command-palette-empty">
                            {t("No results found")}
                        </div>
                    )}
                    {filtered.map((cmd, idx) => (
                        <div
                            key={cmd.id}
                            className={`nc-command-palette-item ${
                                idx === selectedIndex ? "nc-selected" : ""
                            }`}
                            onClick={() => {
                                cmd.action();
                                onDismiss();
                            }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                        >
                            <span className="nc-command-palette-label">
                                {cmd.label}
                            </span>
                            <span className="nc-command-palette-category">
                                {cmd.category}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
