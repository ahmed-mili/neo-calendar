import {
    appendYear,
    formatDatedDay,
    formatDatedDayWithYear,
} from "./calendarFormatters";

export const DAY_MAP: Record<string, string> = {
    U: "S",
    M: "M",
    T: "T",
    W: "W",
    R: "T",
    F: "F",
    S: "S",
};
export const DAY_ORDER = ["U", "M", "T", "W", "R", "F", "S"] as const;

export const POPUP_WIDTH = 300;
export const POPUP_MAX_HEIGHT = 520;
export const POPUP_GAP = 10;
export const POPUP_MARGIN = 12;

interface AutoCommitDraftState {
    isDraft: boolean;
    hasDraft: boolean;
    date: string;
    title: string;
    alreadyCommitting: boolean;
}

export function hasDraftCreationIntent(title: string): boolean {
    return Boolean(title.trim());
}

/**
 * A grid click only opens a draft. Persist it automatically once typing a
 * title demonstrates explicit creation intent; blank events remain available
 * through explicit form submission and the calendar panel's add button.
 */
export function shouldAutoCommitDraft({
    isDraft,
    hasDraft,
    date,
    title,
    alreadyCommitting,
}: AutoCommitDraftState): boolean {
    return (
        isDraft &&
        hasDraft &&
        Boolean(date) &&
        hasDraftCreationIntent(title) &&
        !alreadyCommitting
    );
}

// "Thu Jun 25" / "jeu. 25 juin", with the year once the date leaves the current
// one — so the common case stays short and a date years away is never ambiguous.
export function formatDateParts(
    d: Date,
    currentYear: number = new Date().getFullYear()
): string {
    return formatDatedDayWithYear(d, currentYear);
}

/**
 * The date, as the panel writes it: `Dim. 16 août 2026`.
 *
 * Two things set it apart from the same date on the grid. The weekday starts
 * with a capital, because here it opens a line rather than sitting inside one.
 * And the year is always there: the grid says which year it is on every screen,
 * a sheet opened over it does not, and "16 août" alone is a date you have to go
 * back and check.
 */
export function formatPanelDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    const label = appendYear(formatDatedDay(d), d.getFullYear());
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

export function formatDateLong(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    return formatDateParts(d);
}

export function computeDuration(start: string, end: string): string {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return "";
    let totalMin = eh * 60 + em - (sh * 60 + sm);
    // End before start means the event crosses midnight (ends next day).
    if (totalMin < 0) totalMin += 24 * 60;
    if (totalMin <= 0) return "";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    // Notion-style, with a space before the unit: "2h 45 min", "2h", "30 min".
    if (h && m) return `${h}h ${m} min`;
    if (h) return `${h}h`;
    return `${m} min`;
}

/** A day column's horizontal extent, in viewport coordinates. */
export interface ColumnRect {
    left: number;
    right: number;
    width: number;
}

export interface PopupPositionOpts {
    /** Day-column rects (left→right) when in a time-grid view, else omitted. */
    columns?: ColumnRect[];
    /** Visible horizontal bounds of the scroller, so off-screen buffer columns
        aren't chosen as the target. */
    bounds?: { left: number; right: number };
}

/** Gap between the panel's left edge and the target column's left edge. */
const COLUMN_INSET = 6;

export function computePopupPosition(
    anchor: DOMRect | null,
    opts?: PopupPositionOpts
): {
    left: number;
    top: number;
    width: number;
    placement: "right" | "left" | "below";
} {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampTop = (t: number) =>
        Math.max(
            POPUP_MARGIN,
            Math.min(vh - POPUP_MAX_HEIGHT - POPUP_MARGIN, t)
        );

    if (!anchor) {
        return {
            left: Math.max(POPUP_MARGIN, vw / 2 - POPUP_WIDTH / 2),
            top: Math.max(POPUP_MARGIN, vh / 2 - POPUP_MAX_HEIGHT / 2),
            width: POPUP_WIDTH,
            placement: "right",
        };
    }

    // Time-grid views: dock the panel INTO the adjacent day column (next day,
    // or previous day if the next one is scrolled out of view), at roughly the
    // column's width — never floating across several columns.
    const columns = opts?.columns;
    if (columns && columns.length) {
        const bounds = opts?.bounds ?? { left: 0, right: vw };
        const cx = anchor.left + anchor.width / 2;
        let idx = columns.findIndex((c) => cx >= c.left && cx < c.right);
        if (idx === -1) {
            // Anchor not inside any column (e.g. partially clipped): snap to the
            // nearest column by centre distance.
            let best = Infinity;
            columns.forEach((c, i) => {
                const d = Math.abs((c.left + c.right) / 2 - cx);
                if (d < best) {
                    best = d;
                    idx = i;
                }
            });
        }
        // A column is a valid target only if it sits fully within the visible
        // scroller bounds (buffer days extend past the edges).
        const visible = (c: ColumnRect) =>
            c.left >= bounds.left - 1 && c.right <= bounds.right + 1;
        const next = columns[idx + 1];
        const prev = columns[idx - 1];
        let target: ColumnRect | undefined;
        let placement: "right" | "left" = "right";
        if (next && visible(next)) {
            target = next;
            placement = "right";
        } else if (prev && visible(prev)) {
            target = prev;
            placement = "left";
        } else if (next) {
            target = next;
            placement = "right";
        } else if (prev) {
            target = prev;
            placement = "left";
        }
        if (target) {
            // Fixed width — the panel no longer shrinks to the column. It keeps
            // a constant, comfortable size (the max it reached on a wide column:
            // ~POPUP_WIDTH), so narrowing the columns (expanding Obsidian's side
            // panels, or week vs 3-day) never cramps it. On a narrow column it
            // simply overhangs into the next one, floating over the grid.
            const width = POPUP_WIDTH;
            let left = target.left + COLUMN_INSET;
            // Clamp into the visible bounds so the fixed-width panel can't spill
            // off either edge.
            left = Math.max(
                bounds.left + COLUMN_INSET,
                Math.min(bounds.right - width - COLUMN_INSET, left)
            );
            return { left, top: clampTop(anchor.top), width, placement };
        }
    }

    // Fallback (month/list views, or no columns): float beside the anchor.
    const spaceRight = vw - anchor.right;
    const spaceLeft = anchor.left;
    let placement: "right" | "left" | "below" = "right";
    let left: number;
    if (spaceRight >= POPUP_WIDTH + POPUP_GAP + POPUP_MARGIN) {
        left = anchor.right + POPUP_GAP;
        placement = "right";
    } else if (spaceLeft >= POPUP_WIDTH + POPUP_GAP + POPUP_MARGIN) {
        left = anchor.left - POPUP_WIDTH - POPUP_GAP;
        placement = "left";
    } else {
        left = Math.max(
            POPUP_MARGIN,
            Math.min(
                vw - POPUP_WIDTH - POPUP_MARGIN,
                anchor.left + anchor.width / 2 - POPUP_WIDTH / 2
            )
        );
        placement = "below";
    }

    let top = anchor.top;
    if (placement === "below") {
        top = anchor.bottom + POPUP_GAP;
    }
    return { left, top: clampTop(top), width: POPUP_WIDTH, placement };
}
