import * as React from "react";
import { useState, useRef, useEffect } from "react";
import * as chrono from "chrono-node";
import { NeoEvent } from "../../types";

interface QuickAddProps {
    onSubmit: (partialEvent: Partial<NeoEvent>) => void;
    onDismiss: () => void;
    visible: boolean;
}

export default function QuickAdd({
    onSubmit,
    onDismiss,
    visible,
}: QuickAddProps) {
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [visible]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;

        const now = new Date();
        const results = chrono.parse(text, now, { forwardDate: true });

        if (results.length > 0) {
            const result = results[0];
            const start = result.start.date();
            const title = text
                .replace(result.text, "")
                .trim()
                .replace(/\s+/g, " ")
                .trim();

            const partialEvent: Partial<NeoEvent> = {
                title: title || text.trim(),
                date: start.toISOString().split("T")[0],
                allDay: !result.start.isCertain("hour"),
            };

            if (!partialEvent.allDay && result.start.isCertain("hour")) {
                (partialEvent as any).startTime = start
                    .toTimeString()
                    .slice(0, 5);
            }

            if (result.end) {
                const end = result.end.date();
                if (!partialEvent.allDay && result.end.isCertain("hour")) {
                    (partialEvent as any).endTime = end
                        .toTimeString()
                        .slice(0, 5);
                }
                if (
                    end.toISOString().split("T")[0] !==
                    (partialEvent as any).date
                ) {
                    (partialEvent as any).endDate = end
                        .toISOString()
                        .split("T")[0];
                }
            }

            onSubmit(partialEvent);
        } else {
            // No date found — create as all-day event today
            onSubmit({
                title: text.trim(),
                date: now.toISOString().split("T")[0],
                allDay: true,
            });
        }

        setText("");
        onDismiss();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setText("");
            onDismiss();
        }
    };

    if (!visible) return null;

    return (
        <div className="nc-quick-add">
            <form onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    className="nc-quick-add-input"
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add event... (e.g., lunch with Alex tomorrow 12pm)"
                />
            </form>
        </div>
    );
}
