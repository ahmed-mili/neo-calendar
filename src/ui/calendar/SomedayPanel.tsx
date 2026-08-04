import * as React from "react";
import { DisplayEvent } from "../types";
import { TaskCheckbox } from "./TaskCheckbox";

interface SomedayPanelProps {
    events: DisplayEvent[];
    onEventClick: (eventId: string) => void;
    onAddSomeday: () => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
}

export default function SomedayPanel({
    events,
    onEventClick,
    onAddSomeday,
    onToggleTask,
}: SomedayPanelProps) {
    // Group events by calendar name
    const groups = new Map<string, DisplayEvent[]>();
    for (const event of events) {
        const name = event.calendarName;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name)!.push(event);
    }

    return (
        <div className="nc-someday-panel">
            {Array.from(groups.entries()).map(([calName, calEvents]) => (
                <div key={calName}>
                    <div className="nc-someday-group-title">{calName}</div>
                    {calEvents.map((event) => {
                        const isCompleted = event.taskStatus === "complete";
                        return (
                            <div
                                key={event.id}
                                className={`nc-someday-item ${
                                    isCompleted ? "nc-task-completed" : ""
                                }`}
                                onClick={() => onEventClick(event.id)}
                            >
                                {event.isTask && (
                                    <button
                                        className="nc-someday-checkbox"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const nextDone =
                                                event.taskStatus !== "complete";
                                            onToggleTask(event.id, nextDone);
                                        }}
                                    >
                                        <TaskCheckbox completed={isCompleted} />
                                    </button>
                                )}
                                <span
                                    className="nc-calendar-dot"
                                    style={{
                                        backgroundColor: event.color,
                                        width: "8px",
                                        height: "8px",
                                        borderRadius: "50%",
                                        display: "inline-block",
                                        flexShrink: 0,
                                    }}
                                />
                                <span className="nc-someday-title">
                                    {event.title}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
            <button className="nc-someday-add-btn" onClick={onAddSomeday}>
                + Add someday event
            </button>
        </div>
    );
}
