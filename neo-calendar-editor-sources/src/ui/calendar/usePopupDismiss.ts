import { useEffect } from "react";

interface UsePopupDismissParams {
    visible: boolean;
    popupRef: React.RefObject<HTMLDivElement | null>;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onMenuToggle?: (open: boolean) => void;
}

export function usePopupDismiss({
    visible,
    popupRef,
    menuRef,
    onClose,
}: UsePopupDismissParams) {
    // Close on Escape
    useEffect(() => {
        if (!visible) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [visible, onClose]);

    // Close on outside click
    useEffect(() => {
        if (!visible) return;
        const handler = (e: MouseEvent) => {
            if (!popupRef.current) return;
            if (popupRef.current.contains(e.target as Node)) return;
            const target = e.target as HTMLElement;
            if (target.closest("[data-event-id]")) return;
            if (target.closest("[data-draft-preview]")) return;
            // Obsidian renders the calendar selector's suggestion dropdown in a
            // portal at the body level, outside the popup. Clicking an option
            // must not be treated as an outside click (which would close the
            // panel before the selection registers).
            if (target.closest(".suggestion-container")) return;
            // Same for our own portaled menus (calendar dropdown), rendered at
            // body level as siblings of the popup.
            if (target.closest(".nc-cal-select-menu")) return;
            // …and our other body-portaled submenus: the date picker and the
            // recurrence dropdowns (freq / monthly-mode). Clicking inside one
            // must not be read as an outside click that closes the panel under it.
            if (target.closest(".nc-datepicker")) return;
            if (target.closest(".nc-select-menu")) return;
            // The links/attachments result list is also rendered in a portal
            // attached to document.body. Treat clicks on its results as part of
            // the event editor; otherwise the editor unmounts on mousedown
            // before the result button can receive its click.
            if (target.closest("[data-nc-popup-portal='true']")) return;
            if (target.closest(".nc-link-results-popover")) return;
            // The plugin's own in-view sidebar (mini-calendar, calendar list,
            // and its collapse/expand toggle): clicking it — e.g. to fold the
            // sidebar or jump months — must not close the event editor.
            if (target.closest(".nc-sidebar")) return;
            // Obsidian's own chrome around the calendar — its left/right side
            // panels (file explorer, a docked calendar sidebar, backlinks) and
            // the ribbon — are not "leave the editor" clicks. The user navigates
            // Obsidian's UI while editing an event; the panel should persist.
            // Only a click on the calendar surface itself (or Escape / the close
            // button / another event) dismisses it.
            if (target.closest(".mod-left-split")) return;
            if (target.closest(".mod-right-split")) return;
            if (target.closest(".workspace-ribbon")) return;
            onClose();
        };
        window.addEventListener("mousedown", handler);
        return () => window.removeEventListener("mousedown", handler);
    }, [visible, onClose, popupRef]);
}
