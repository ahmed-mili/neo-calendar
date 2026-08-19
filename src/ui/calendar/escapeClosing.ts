/** What is open when Escape is pressed, as plain facts rather than a DOM. */
export interface EscapeLayers {
    /** The calendar's events panel — the drawer holding its someday pile. */
    eventsPanelOpen: boolean;
    /** A dialog, the settings, the command palette, a context menu. */
    overlayOpen: boolean;
    /** The event panel, showing an event or a draft. */
    eventPanelOpen: boolean;
    /** Events are selected on the grid. */
    hasSelection: boolean;
}

/**
 * Whether this press of Escape is the one that closes the events panel.
 *
 * Escape belongs to whatever is nearest the front: a dialog answers it itself,
 * an open event answers it itself, and a selection is cleared by it. The panel
 * is the last layer left, so it only takes the key when nothing above it wants
 * it — one press, one thing.
 */
export function escapeClosesEventsPanel(layers: EscapeLayers): boolean {
    if (!layers.eventsPanelOpen) return false;
    if (layers.overlayOpen || layers.eventPanelOpen) return false;
    return !layers.hasSelection;
}
