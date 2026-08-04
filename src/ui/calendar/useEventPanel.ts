import { useState, useCallback } from "react";

export function useEventPanel() {
    const [panelEventId, setPanelEventId] = useState<string | null>(null);
    const [panelAnchor, setPanelAnchor] = useState<DOMRect | null>(null);

    const handleEventClick = useCallback((eventId: string) => {
        const el = document.querySelector(
            `[data-event-id="${CSS.escape(eventId)}"]`
        ) as HTMLElement | null;
        setPanelAnchor(el ? el.getBoundingClientRect() : null);
        setPanelEventId(eventId);
    }, []);

    return {
        panelEventId,
        setPanelEventId,
        panelAnchor,
        setPanelAnchor,
        handleEventClick,
    };
}
