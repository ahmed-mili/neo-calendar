const ACCESSORY_ID = "nc-description-android-accessory";
const ACTIVE_CLASS = "nc-description-android-active";
const EXPANDED_CLASS = "nc-description-android-expanded";
const INSTALLED_KEY = "__neoCalendarAndroidDescriptionEditorInstalled";

type NeoWindow = Window & Record<string, unknown>;

let activeSection: HTMLElement | null = null;
let expanded = false;

function descriptionSection(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>(".nc-description-section");
}

function attachmentButton(section: HTMLElement): HTMLButtonElement | null {
    return section.querySelector<HTMLButtonElement>(
        '.nc-description-tool[data-format-command="attachment"]'
    );
}

function accessoryRoot(): HTMLDivElement {
    let root = document.getElementById(ACCESSORY_ID) as HTMLDivElement | null;
    if (root) return root;

    root = document.createElement("div");
    root.id = ACCESSORY_ID;
    root.className = "nc-description-android-accessory";
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", "Description tools");
    root.hidden = true;
    root.innerHTML = `
        <button type="button" class="nc-description-android-accessory-button nc-description-android-attach" data-nc-description-accessory="attachment" aria-label="Attachment" title="Attachment">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21.4 11.6 12.6 20.4a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <button type="button" class="nc-description-android-accessory-button nc-description-android-format-toggle" data-nc-description-accessory="format" aria-label="Formatting" title="Formatting" aria-pressed="false">A</button>
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

function syncAccessory(): void {
    const root = accessoryRoot();
    root.hidden = !activeSection;
    root.dataset.mode = expanded ? "expanded" : "compact";

    const toggle = root.querySelector<HTMLButtonElement>(
        '[data-nc-description-accessory="format"]'
    );
    toggle?.setAttribute("aria-pressed", expanded ? "true" : "false");
    toggle?.setAttribute(
        "aria-label",
        expanded ? "Close formatting" : "Formatting"
    );

    const attach = root.querySelector<HTMLButtonElement>(
        '[data-nc-description-accessory="attachment"]'
    );
    if (attach) {
        const realAttachment = activeSection
            ? attachmentButton(activeSection)
            : null;
        attach.disabled = !realAttachment || realAttachment.disabled;
    }

    if (activeSection) {
        activeSection.classList.add(ACTIVE_CLASS);
        activeSection.classList.toggle(EXPANDED_CLASS, expanded);
    }
    placeAccessory();
}

function deactivate(): void {
    if (activeSection) {
        activeSection.classList.remove(ACTIVE_CLASS, EXPANDED_CLASS);
    }
    activeSection = null;
    expanded = false;
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
    }
    activeSection = section;
    syncAccessory();
}

function toggleFormatting(): void {
    if (!activeSection) return;
    expanded = !expanded;
    syncAccessory();
}

export function installAndroidDescriptionEditor(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;
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
        "pointerdown",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const action = target.closest<HTMLElement>(
                "[data-nc-description-accessory]"
            );
            if (!action) return;
            // Keeping the textarea focused is what keeps the Android keyboard
            // open. The command is applied through React's real toolbar button
            // without letting the accessory itself steal focus.
            event.preventDefault();
        },
        true
    );

    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const action = target.closest<HTMLElement>(
                "[data-nc-description-accessory]"
            );
            if (!action || !activeSection) return;
            event.preventDefault();
            event.stopPropagation();

            if (action.dataset.ncDescriptionAccessory === "format") {
                toggleFormatting();
                return;
            }

            if (action.dataset.ncDescriptionAccessory === "attachment") {
                const button = attachmentButton(activeSection);
                if (button && !button.disabled) button.click();
            }
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
            if (!activeSection.contains(target) && !root?.contains(target)) return;
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
