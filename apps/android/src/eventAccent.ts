/** What an event block's computed style is read for, and nothing more. */
export interface AccentSource {
    getPropertyValue(name: string): string;
    borderLeftColor: string;
    borderTopColor: string;
}

/**
 * The calendar's colour, as worn by one event block.
 *
 * It lives in `--nc-event-accent`: the strip down the left edge is drawn by a
 * pseudo-element rather than a border, because a border bends around the
 * block's rounded corners. Reading a border here would not fail loudly — an
 * unset border colour computes to the resolved text colour — so the outline
 * would come back readable and wrong, which is why the variable is asked first
 * and the borders are only a fallback for blocks still drawn the old way.
 */
export function eventAccentColor(computed: AccentSource): string {
    const accent = computed.getPropertyValue("--nc-event-accent").trim();
    return (
        accent ||
        computed.borderLeftColor ||
        computed.borderTopColor ||
        "currentColor"
    );
}
