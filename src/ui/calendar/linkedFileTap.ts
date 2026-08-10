/** Same double-tap window as the Android event-resize gesture. */
export const LINK_DOUBLE_TAP_WINDOW_MS = 340;

export interface LinkedFileTap {
    itemId: string;
    at: number;
}

export type LinkedFileTapAction = "show-preview" | "hide-preview" | "open";

export interface LinkedFileTapDecision {
    action: LinkedFileTapAction;
    nextTap: LinkedFileTap | null;
}

/**
 * A lone tap toggles the address preview. Only a second tap on the same item,
 * inside the Android double-tap window, opens the target.
 */
export function decideLinkedFileTap(
    lastTap: LinkedFileTap | null,
    itemId: string,
    tapAt: number,
    previewVisible: boolean
): LinkedFileTapDecision {
    const elapsed = lastTap === null ? null : tapAt - lastTap.at;
    const doubleTap =
        lastTap?.itemId === itemId &&
        elapsed !== null &&
        elapsed >= 0 &&
        elapsed <= LINK_DOUBLE_TAP_WINDOW_MS;

    if (doubleTap) return { action: "open", nextTap: null };

    return {
        action: previewVisible ? "hide-preview" : "show-preview",
        nextTap: { itemId, at: tapAt },
    };
}
