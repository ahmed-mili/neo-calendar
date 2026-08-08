import { App, TFolder, AbstractInputSuggest } from "obsidian";

/**
 * A searchable folder picker: attach to a text input to get fuzzy, type-to-filter
 * suggestions over every folder in the vault instead of a giant native dropdown.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private inputEl: HTMLInputElement;
    private onSelectCb?: (folderPath: string) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        onSelectCb?: (folderPath: string) => void
    ) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.onSelectCb = onSelectCb;
    }

    getSuggestions(query: string): TFolder[] {
        const lower = query.toLowerCase();
        const folders = this.app.vault
            .getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder);

        const matches = folders
            .filter((f) => f.path.toLowerCase().includes(lower))
            .sort((a, b) => {
                // Prefer paths where the match is closer to the start.
                const ia = a.path.toLowerCase().indexOf(lower);
                const ib = b.path.toLowerCase().indexOf(lower);
                if (ia !== ib) return ia - ib;
                return a.path.localeCompare(b.path);
            });

        // Cap the list so a huge vault stays snappy.
        return matches.slice(0, 100);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path === "" ? "/ (vault root)" : folder.path);
    }

    selectSuggestion(folder: TFolder): void {
        const value = folder.path;
        this.inputEl.value = value;
        this.setValue(value);
        this.onSelectCb?.(value);
        this.close();
    }
}
