import * as React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { DisplayEvent, ViewType } from "../types";

interface CommandPaletteProps {
    visible: boolean;
    onDismiss: () => void;
    events: DisplayEvent[];
    onEventSelect: (eventId: string) => void;
    onViewChange: (view: ViewType) => void;
    onGoToday: () => void;
    onCreateEvent: () => void;
    onToggleSidebar: () => void;
}

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
}: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
        setQuery("");
        setSelectedIndex(0);
    }, [visible]);

    const commands: CommandItem[] = useMemo(() => {
        const actions: CommandItem[] = [
            {
                id: "today",
                label: "Go to Today",
                category: "Navigation",
                action: onGoToday,
            },
            {
                id: "view-day",
                label: "Switch to Day View",
                category: "View",
                action: () => onViewChange("day"),
            },
            {
                id: "view-week",
                label: "Switch to Week View",
                category: "View",
                action: () => onViewChange("week"),
            },
            {
                id: "view-month",
                label: "Switch to Month View",
                category: "View",
                action: () => onViewChange("month"),
            },
            {
                id: "view-3days",
                label: "Switch to 3-Day View",
                category: "View",
                action: () => onViewChange("3days"),
            },
            {
                id: "view-list",
                label: "Switch to List View",
                category: "View",
                action: () => onViewChange("list"),
            },
            {
                id: "new-event",
                label: "Create New Event",
                category: "Actions",
                action: onCreateEvent,
            },
            {
                id: "toggle-sidebar",
                label: "Toggle Sidebar",
                category: "View",
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
                    placeholder="Search events or type a command..."
                />
                <div className="nc-command-palette-list">
                    {filtered.length === 0 && (
                        <div className="nc-command-palette-empty">
                            No results found
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
