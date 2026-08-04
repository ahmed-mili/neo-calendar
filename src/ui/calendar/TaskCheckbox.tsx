import * as React from "react";

interface TaskCheckboxProps {
    completed: boolean;
    size?: number;
}

// Per-instance counter for unique mask ids (React 17 has no useId).
let maskSeq = 0;

export function TaskCheckbox({ completed, size = 14 }: TaskCheckboxProps) {
    const maskIdRef = React.useRef<string | null>(null);
    if (maskIdRef.current === null) {
        maskIdRef.current = `nc-task-check-${maskSeq++}`;
    }

    if (completed) {
        // Completed badge: a solid disc in the event's TEXT colour
        // (currentColor — same as the empty state's ring), with the check
        // knocked OUT (a real transparent hole via mask) so nothing shows
        // behind the tick; it reads as the surface itself, fully theme-aware.
        const maskId = maskIdRef.current;
        return (
            <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
                <mask id={maskId}>
                    <rect width="14" height="14" fill="white" />
                    <path
                        d="M4 7l2 2 4-4"
                        stroke="black"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </mask>
                <rect
                    x="0.5"
                    y="0.5"
                    width="13"
                    height="13"
                    rx="6.5"
                    fill="currentColor"
                    mask={`url(#${maskId})`}
                />
            </svg>
        );
    }

    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
            <circle
                cx="7"
                cy="7"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.85"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="2.4 2.2"
            />
        </svg>
    );
}
