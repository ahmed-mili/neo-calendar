import "obsidian";

/**
 * The installed `obsidian` type package (0.16.3) predates `AbstractInputSuggest`,
 * which has shipped in the Obsidian runtime since 1.2. We augment the module with
 * the minimal surface we use so it type-checks; at runtime the class is provided
 * by the app (the `obsidian` module is marked external by esbuild).
 */
declare module "obsidian" {
    export abstract class AbstractInputSuggest<T> {
        protected app: App;
        constructor(app: App, inputEl: HTMLInputElement);
        abstract getSuggestions(query: string): T[] | Promise<T[]>;
        abstract renderSuggestion(value: T, el: HTMLElement): void;
        abstract selectSuggestion(
            value: T,
            evt: MouseEvent | KeyboardEvent
        ): void;
        setValue(value: string): void;
        getValue(): string;
        open(): void;
        close(): void;
    }
}
