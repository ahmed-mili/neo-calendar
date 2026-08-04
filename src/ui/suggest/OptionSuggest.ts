import { App, AbstractInputSuggest, setIcon } from "obsidian";

export interface SuggestOption {
    value: string;
    label: string;
    /** Marks a recently-used entry — shown with a clock icon at the top. */
    recent?: boolean;
}

/**
 * A dropdown replacement built on Obsidian's native suggestion popup, so every
 * selector in the plugin shares the same look as the folder picker instead of
 * the OS-native `<select>` list. Click/focus opens the full list; typing filters.
 */
export class OptionSuggest extends AbstractInputSuggest<SuggestOption> {
    private inputEl: HTMLInputElement;
    /** Public so a host (e.g. a React wrapper) can refresh options in place. */
    options: SuggestOption[];
    private onSelectCb: (value: string) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        options: SuggestOption[],
        onSelectCb: (value: string) => void
    ) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.options = options;
        this.onSelectCb = onSelectCb;

        // Behave like a dropdown: focusing the field reveals the whole list.
        this.inputEl.addEventListener("focus", () => {
            this.inputEl.select();
            this.inputEl.dispatchEvent(new Event("input"));
        });
    }

    getSuggestions(query: string): SuggestOption[] {
        const q = query.toLowerCase().trim();
        // Empty query, or a query matching the current selection's label,
        // means "just opened" — show every option rather than a filtered set.
        const isCurrentLabel = this.options.some(
            (o) => o.label.toLowerCase() === q
        );
        if (q === "" || isCurrentLabel) return this.options;
        return this.options.filter(
            (o) =>
                o.label.toLowerCase().includes(q) ||
                o.value.toLowerCase().includes(q)
        );
    }

    renderSuggestion(option: SuggestOption, el: HTMLElement): void {
        if (option.recent) {
            el.addClass("nc-suggest-recent");
            el.createSpan({ text: option.label, cls: "nc-suggest-label" });
            const icon = el.createSpan({ cls: "nc-suggest-recent-icon" });
            setIcon(icon, "clock");
        } else {
            el.setText(option.label);
        }
    }

    selectSuggestion(option: SuggestOption): void {
        this.inputEl.value = option.label;
        this.setValue(option.label);
        this.onSelectCb(option.value);
        this.close();
        this.inputEl.blur();
    }

    /** Set the visible label from a stored option value. */
    setSelectedValue(value: string): void {
        const opt = this.options.find((o) => o.value === value);
        this.inputEl.value = opt ? opt.label : "";
    }
}
