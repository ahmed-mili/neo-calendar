import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "../../../src/ui/calendar/descriptionLinkShortcut";

const ACCESSORY_ID = "nc-description-android-accessory";
const ACTIVE_CLASS = "nc-description-android-active";
const EXPANDED_CLASS = "nc-description-android-formatting-open";
const INSTALLED_KEY = "__neoCalendarAndroidDescriptionEditorInstalled";

type NeoWindow = Window & {
    [INSTALLED_KEY]?: boolean;
};

type HistoryCommand = "undo" | "redo";

let activeSection: HTMLElement | null = null;
let expanded = false;
let swallowCompatibilityClick = false;
let fallbackCanUndo = false;
let fallbackCanRedo = false;

function iconSvg(body: string): string {
    return `<svg class="nc-description-android-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
}

const ICONS = {
    format: iconSvg(
        '<path d="M4 7V4h16v3M9 20h6M12 4v16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    back: iconSvg(
        '<path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    bold: iconSvg(
        '<path d="M6 4h8a4 4 0 0 1 0 8H6m0 0h9a4 4 0 0 1 0 8H6V4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    italic: iconSvg(
        '<path d="M19 4h-9M14 20H5M15 4 9 20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    underline: iconSvg(
        '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    bullets: iconSvg(
        '<path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>'
    ),
    ordered: iconSvg(
        '<path d="M10 6h10M10 12h10M10 18h10M4 4h1v4M3.5 12h2l-2 3h2M3.5 18.5h1.25a1 1 0 0 1 0 2H3.5m1.25 0a1 1 0 0 1 0 2H3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    checklist: iconSvg(
        '<path d="M10 6h10M10 12h10M10 18h10M3 6l1.2 1.2L6.5 5M3 12l1.2 1.2L6.5 11M3 18l1.2 1.2L6.5 17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    link: iconSvg(
        '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    attachment: iconSvg(
        '<path d="M21.4 11.6 12.6 20.4a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    clear: iconSvg(
        '<path d="M4 4l16 16M6 7V4h12v3M12 8v12M9 20h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    undo: iconSvg(
        '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    redo: iconSvg(
        '<path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0-6 6v1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
};

function descriptionSection(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>(".nc-description-section");
}

function realCommandButton(
    section: HTMLElement,
    command: string
): HTMLButtonElement | null {
    return section.querySelector<HTMLButtonElement>(
        `.nc-description-tool[data-format-command="${command}"]`
    );
}

function activeTextArea(): HTMLTextAreaElement | null {
    if (!activeSection) return null;
    const focused = document.activeElement;
    if (
        focused instanceof HTMLTextAreaElement &&
        activeSection.contains(focused)
    ) {
        return focused;
    }
    return activeSection.querySelector<HTMLTextAreaElement>(
        "textarea[data-description-input='true'], .nc-panel-checklist-edit"
    );
}

function nativeHistoryEnabled(command: HistoryCommand): boolean | null {
    if (typeof document.queryCommandEnabled !== "function") return null;
    try {
        return document.queryCommandEnabled(command);
    } catch {
        return null;
    }
}

function historyEnabled(command: HistoryCommand): boolean {
    const native = nativeHistoryEnabled(command);
    if (native !== null) return native;
    return command === "undo" ? fallbackCanUndo : fallbackCanRedo;
}

function accessoryRoot(): HTMLDivElement {
    let root = document.getElementById(ACCESSORY_ID) as HTMLDivElement | null;
    if (root) return root;

    root = document.createElement("div");
    root.id = ACCESSORY_ID;
    root.className = "nc-description-android-accessory";
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", "Description tools");
    /*
     * Cette barre appartient a la feuille, meme si elle n'est pas dedans.
     *
     * Elle doit vivre au niveau du body : elle se tient au-dessus du clavier
     * avec `position: fixed` et l'inset du visual viewport, ce qu'elle ne peut
     * pas faire depuis l'interieur d'une feuille qui defile. Mais `usePopupDismiss`
     * ferme l'evenement des qu'un `pointerdown` tombe hors du panneau : sans ce
     * marqueur, les commandes etaient lues comme « je quitte l'editeur », et la
     * feuille se refermait avant meme que le bouton ait pu agir.
     *
     * `data-nc-popup-portal` est le marqueur que le panneau reconnait deja pour
     * ses bulles de lien et son bandeau de confirmation (KEEP_OPEN_SELECTORS).
     */
    root.setAttribute("data-nc-popup-portal", "true");
    root.hidden = true;
    root.innerHTML = `
        <div class="nc-description-android-compact" data-nc-description-accessory-view="compact">
            <button type="button" class="nc-description-android-accessory-button nc-description-android-format-toggle" data-nc-description-accessory="format" aria-label="Formatting" title="Formatting" aria-pressed="false">
                ${ICONS.format}
            </button>
            <button type="button" class="nc-description-android-accessory-button" data-nc-description-command="attachment" aria-label="Attachment" title="Attachment">
                ${ICONS.attachment}
            </button>
        </div>
        <div class="nc-description-android-expanded" data-nc-description-accessory-view="expanded">
            <button type="button" class="nc-description-android-accessory-button nc-description-android-format-toggle" data-nc-description-accessory="format" aria-label="Close formatting" title="Close formatting" aria-pressed="true">
                ${ICONS.back}
            </button>
            <div class="nc-description-android-format-scroll" role="group" aria-label="Formatting commands">
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="bold" aria-label="Bold" title="Bold">${ICONS.bold}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="italic" aria-label="Italic" title="Italic">${ICONS.italic}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="underline" aria-label="Underline" title="Underline">${ICONS.underline}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="bullet-list" aria-label="Bulleted list" title="Bulleted list">${ICONS.bullets}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="ordered-list" aria-label="Numbered list" title="Numbered list">${ICONS.ordered}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="checklist" aria-label="Checklist item" title="Checklist item">${ICONS.checklist}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-accessory="link" aria-label="Add Link" title="Add Link">${ICONS.link}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="attachment" aria-label="Attachment" title="Attachment">${ICONS.attachment}</button>
                <button type="button" class="nc-description-android-format-button" data-nc-description-command="clear" aria-label="Clear formatting" title="Clear formatting">${ICONS.clear}</button>
            </div>
            <div class="nc-description-android-history" role="group" aria-label="Edit history">
                <button type="button" class="nc-description-android-format-button nc-description-android-history-button" data-nc-description-history="undo" aria-label="Undo" title="Undo" disabled>${ICONS.undo}</button>
                <button type="button" class="nc-description-android-format-button nc-description-android-history-button" data-nc-description-history="redo" aria-label="Redo" title="Redo" disabled>${ICONS.redo}</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    return root;
}

function keyboardInset(): number {
    const viewport = window.visualViewport;
    if (!viewport) return 0;
    return Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
    );
}

function placeAccessory(): void {
    document.documentElement.style.setProperty(
        "--nc-description-keyboard-inset",
        `${keyboardInset()}px`
    );
}

function syncCommandAvailability(root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>(
        "[data-nc-description-command]"
    ).forEach((button) => {
        const command = button.dataset.ncDescriptionCommand;
        const real =
            activeSection && command
                ? realCommandButton(activeSection, command)
                : null;
        button.disabled = !real || real.disabled;
    });

    root.querySelectorAll<HTMLButtonElement>(
        "[data-nc-description-history]"
    ).forEach((button) => {
        const command = button.dataset.ncDescriptionHistory as
            | HistoryCommand
            | undefined;
        button.disabled = !activeSection || !command || !historyEnabled(command);
    });
}

function syncAccessory(): void {
    const root = accessoryRoot();
    root.hidden = !activeSection;
    root.dataset.mode = expanded ? "expanded" : "compact";
    syncCommandAvailability(root);

    if (activeSection) {
        activeSection.classList.add(ACTIVE_CLASS);
        activeSection.classList.toggle(EXPANDED_CLASS, expanded);
    }
    placeAccessory();
}

function resetFallbackHistory(): void {
    fallbackCanUndo = false;
    fallbackCanRedo = false;
}

function deactivate(): void {
    if (activeSection) {
        activeSection.classList.remove(ACTIVE_CLASS, EXPANDED_CLASS);
    }
    activeSection = null;
    expanded = false;
    resetFallbackHistory();
    const root = document.getElementById(ACCESSORY_ID) as HTMLDivElement | null;
    if (root) {
        root.hidden = true;
        root.dataset.mode = "compact";
    }
}

function activate(section: HTMLElement): void {
    if (activeSection && activeSection !== section) {
        activeSection.classList.remove(ACTIVE_CLASS, EXPANDED_CLASS);
        expanded = false;
        resetFallbackHistory();
    }
    activeSection = section;
    syncAccessory();
}

function toggleFormatting(): void {
    if (!activeSection) return;
    expanded = !expanded;
    syncAccessory();
}

function descriptionControl(target: Element): HTMLElement | null {
    return target.closest<HTMLElement>(
        "[data-nc-description-accessory], [data-nc-description-command], [data-nc-description-history]"
    );
}

function runHistory(command: HistoryCommand): void {
    const field = activeTextArea();
    if (!field) return;

    field.focus();
    let applied = false;
    if (typeof document.execCommand === "function") {
        try {
            applied = document.execCommand(command);
        } catch {
            applied = false;
        }
    }

    if (applied) {
        if (command === "undo") fallbackCanRedo = true;
        else fallbackCanUndo = true;
    } else if (command === "undo") {
        fallbackCanUndo = false;
    } else {
        fallbackCanRedo = false;
    }
    syncCommandAvailability(accessoryRoot());
}

function runControl(control: HTMLElement): void {
    if (!activeSection) return;

    const history = control.dataset.ncDescriptionHistory as
        | HistoryCommand
        | undefined;
    if (history) {
        runHistory(history);
        return;
    }

    const accessory = control.dataset.ncDescriptionAccessory;
    if (accessory === "format") {
        toggleFormatting();
        return;
    }
    if (accessory === "link") {
        activeSection.dispatchEvent(
            new Event(OPEN_DESCRIPTION_LINK_DIALOG_EVENT)
        );
        return;
    }

    const command = control.dataset.ncDescriptionCommand;
    if (!command) return;
    const button = realCommandButton(activeSection, command);
    if (button && !button.disabled) button.click();
}

export function installAndroidDescriptionEditor(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return;
    }
    const neoWindow = window as NeoWindow;
    if (neoWindow[INSTALLED_KEY]) return;
    neoWindow[INSTALLED_KEY] = true;

    document.addEventListener(
        "focusin",
        (event) => {
            if (!(event.target instanceof HTMLTextAreaElement)) return;
            const section = descriptionSection(event.target);
            if (!section) return;
            activate(section);
        },
        true
    );

    document.addEventListener(
        "focusout",
        (event) => {
            if (!descriptionSection(event.target)) return;
            window.setTimeout(() => {
                if (!activeSection) return;
                const next = document.activeElement;
                const root = document.getElementById(ACCESSORY_ID);
                if (
                    next instanceof Node &&
                    (activeSection.contains(next) || root?.contains(next))
                ) {
                    return;
                }
                deactivate();
            }, 0);
        },
        true
    );

    document.addEventListener(
        "input",
        (event) => {
            if (!(event.target instanceof HTMLTextAreaElement)) return;
            const section = descriptionSection(event.target);
            if (!section || section !== activeSection) return;

            const inputType =
                event instanceof InputEvent ? event.inputType : "";
            if (inputType === "historyUndo") {
                fallbackCanRedo = true;
            } else if (inputType === "historyRedo") {
                fallbackCanUndo = true;
            } else {
                fallbackCanUndo = true;
                fallbackCanRedo = false;
            }
            syncCommandAvailability(accessoryRoot());
        },
        true
    );

    document.addEventListener(
        "pointerdown",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (!descriptionControl(target)) return;
            // Keeping the textarea focused is what keeps the Android keyboard
            // open. The command itself runs on pointerup so a real touch does
            // not depend on a compatibility click surviving preventDefault().
            event.preventDefault();
        },
        true
    );

    document.addEventListener(
        "pointerup",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const control = descriptionControl(target);
            if (!control || !activeSection) return;
            event.preventDefault();
            event.stopPropagation();
            runControl(control);
            swallowCompatibilityClick = true;
            window.setTimeout(() => {
                swallowCompatibilityClick = false;
            }, 0);
        },
        true
    );

    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const control = descriptionControl(target);
            if (!control || !activeSection) return;
            event.preventDefault();
            event.stopPropagation();
            if (swallowCompatibilityClick) {
                swallowCompatibilityClick = false;
                return;
            }
            // Keyboard activation has no pointer sequence, so click remains the
            // accessibility fallback for the same controls.
            runControl(control);
        },
        true
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key !== "Escape" || !activeSection || !expanded) return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            const root = document.getElementById(ACCESSORY_ID);
            if (!activeSection.contains(target) && !root?.contains(target)) {
                return;
            }
            expanded = false;
            syncAccessory();
        },
        true
    );

    window.visualViewport?.addEventListener("resize", placeAccessory);
    window.visualViewport?.addEventListener("scroll", placeAccessory);
    window.addEventListener("resize", placeAccessory);
}

installAndroidDescriptionEditor();
