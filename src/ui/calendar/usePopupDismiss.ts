import { useEffect } from "react";

interface UsePopupDismissParams {
    visible: boolean;
    popupRef: React.RefObject<HTMLDivElement | null>;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onMenuToggle?: (open: boolean) => void;
}

/** What a press landing outside the popup should do to it. */
export type PressOutcome = "keep" | "dismiss" | "dismiss-and-swallow";

/** Just the part of an element the decision needs, so it can be read without a DOM. */
export interface PressTarget {
    closest(selectors: string): unknown;
}

/**
 * Presses that are not "I am leaving the editor", each for its own reason.
 *
 * The portaled ones (menus, date picker, link results) render at body level, as
 * siblings of the popup rather than inside it, so `popup.contains()` says no
 * even though they belong to the editor. Closing on them would unmount the
 * editor before the option could register its click.
 *
 * The surrounding chrome — our sidebar, Obsidian's side panels and ribbon — is
 * the app being used around an open event: folding the sidebar or jumping a
 * month is not leaving the editor.
 */
const KEEP_OPEN_SELECTORS = [
    "[data-event-id]",
    "[data-draft-preview]",
    // Obsidian's own suggestion dropdown for the calendar selector.
    ".suggestion-container",
    ".nc-cal-select-menu",
    ".nc-datepicker",
    ".nc-select-menu",
    "[data-nc-popup-portal='true']",
    ".nc-link-results-popover",
    ".nc-sidebar",
    ".mod-left-split",
    ".mod-right-split",
    ".workspace-ribbon",
];

/**
 * A press on a day column is what starts drawing an event. Dismissing alone
 * would leave that press to the grid, so the click meant to leave the editor
 * would draw a new event under it — and there would be no way out at all, each
 * attempt leaving one more behind. Only the grid surface is swallowed: the
 * toolbar lives inside the same `.nc-main`, and eating presses there would cost
 * the first click on "Today" or on the view menu while an event is open.
 */
const SWALLOW_SELECTOR = ".nc-timegrid-day";

export function pressOutcome(target: PressTarget): PressOutcome {
    for (const selector of KEEP_OPEN_SELECTORS) {
        if (target.closest(selector)) return "keep";
    }
    return target.closest(SWALLOW_SELECTOR) ? "dismiss-and-swallow" : "dismiss";
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

    // Close on an outside press.
    //
    // Pointer events, not mouse events: the grid takes its presses on
    // `pointerdown` and cancels them (useTimeGridSelection), which suppresses
    // the compatibility mouse events that would have followed. A dismissal
    // listening for `mousedown` therefore never hears a press on the calendar —
    // the panel stayed open forever, whatever you clicked.
    useEffect(() => {
        if (!visible) return;
        const handler = (e: Event) => {
            if (!popupRef.current) return;
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (popupRef.current.contains(target)) return;
            const outcome = pressOutcome(target);
            if (outcome === "keep") return;
            onClose();
            if (outcome === "dismiss-and-swallow") {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        // Capture: the grid must not hear this press before we have decided
        // whether it belongs to it.
        window.addEventListener("pointerdown", handler, true);
        return () => window.removeEventListener("pointerdown", handler, true);
    }, [visible, onClose, popupRef]);
}
