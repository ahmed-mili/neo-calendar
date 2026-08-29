const MENU_OPEN_CLASS = "nc-description-menu-open";
const ACTION_ATTRIBUTE = "data-nc-description-action";
const INSTALLED_KEY = "__neoCalendarDesktopDescriptionEditorInstalled";

type NeoWindow = Window & Record<string, unknown>;

function descriptionRow(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>(".nc-panel-row-desc");
}

function descriptionIcon(row: HTMLElement): HTMLElement | null {
    return row.querySelector<HTMLElement>(":scope > .nc-panel-row-icon");
}

function descriptionToolbar(row: HTMLElement): HTMLElement | null {
    return row.querySelector<HTMLElement>(".nc-description-toolbar");
}

function closeRow(row: HTMLElement): void {
    row.classList.remove(MENU_OPEN_CLASS);
    const icon = descriptionIcon(row);
    icon?.setAttribute("aria-expanded", "false");
}

function closeAll(except?: HTMLElement): void {
    document
        .querySelectorAll<HTMLElement>(`.nc-panel-row-desc.${MENU_OPEN_CLASS}`)
        .forEach((row) => {
            if (row !== except) closeRow(row);
        });
}

function deactivate(row: HTMLElement): void {
    closeRow(row);
    const icon = descriptionIcon(row);
    if (!icon) return;
    icon.removeAttribute(ACTION_ATTRIBUTE);
    icon.removeAttribute("role");
    icon.removeAttribute("tabindex");
    icon.removeAttribute("aria-label");
    icon.removeAttribute("aria-haspopup");
    icon.removeAttribute("aria-expanded");
}

function activate(row: HTMLElement): void {
    const icon = descriptionIcon(row);
    if (!icon) return;
    icon.setAttribute(ACTION_ATTRIBUTE, "add");
    icon.setAttribute("role", "button");
    icon.setAttribute("tabindex", "0");
    icon.setAttribute("aria-label", "Description options");
    icon.setAttribute("aria-haspopup", "menu");
    icon.setAttribute(
        "aria-expanded",
        row.classList.contains(MENU_OPEN_CLASS) ? "true" : "false"
    );
}

function placeMenu(row: HTMLElement): void {
    const icon = descriptionIcon(row);
    const toolbar = descriptionToolbar(row);
    if (!icon || !toolbar) return;

    const rect = icon.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = Math.min(248, Math.max(196, window.innerWidth - margin * 2));
    const estimatedHeight = 318;
    const left = Math.max(
        margin,
        Math.min(rect.left, window.innerWidth - width - margin)
    );
    const roomBelow = window.innerHeight - rect.bottom - gap - margin;
    const top =
        roomBelow >= estimatedHeight
            ? rect.bottom + gap
            : Math.max(margin, rect.top - estimatedHeight - gap);

    toolbar.style.setProperty("--nc-description-menu-left", `${left}px`);
    toolbar.style.setProperty("--nc-description-menu-top", `${top}px`);
    toolbar.style.setProperty("--nc-description-menu-width", `${width}px`);
}

function toggleMenu(row: HTMLElement): void {
    const icon = descriptionIcon(row);
    if (!icon?.hasAttribute(ACTION_ATTRIBUTE)) return;

    if (row.classList.contains(MENU_OPEN_CLASS)) {
        closeRow(row);
        return;
    }

    closeAll(row);
    placeMenu(row);
    row.classList.add(MENU_OPEN_CLASS);
    icon.setAttribute("aria-expanded", "true");
}

export function installDesktopDescriptionEditor(): void {
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
            const section = event.target.closest(".nc-description-section");
            if (!section) return;
            const row = descriptionRow(event.target);
            if (!row) return;
            closeAll(row);
            activate(row);
        },
        true
    );

    document.addEventListener(
        "focusout",
        (event) => {
            const row = descriptionRow(event.target);
            if (!row) return;
            window.setTimeout(() => {
                if (!row.isConnected) return;
                const active = document.activeElement;
                if (active instanceof Node && row.contains(active)) return;
                deactivate(row);
            }, 0);
        },
        true
    );

    document.addEventListener(
        "pointerdown",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const icon = target.closest<HTMLElement>(
                ".nc-panel-row-desc > .nc-panel-row-icon"
            );
            if (icon?.hasAttribute(ACTION_ATTRIBUTE)) {
                const row = descriptionRow(icon);
                if (!row) return;
                event.preventDefault();
                toggleMenu(row);
                return;
            }

            const tool = target.closest(".nc-description-tool");
            if (tool) return;

            const row = descriptionRow(target);
            if (row?.classList.contains(MENU_OPEN_CLASS)) {
                closeRow(row);
                return;
            }
            closeAll();
        },
        true
    );

    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const tool = target.closest(".nc-description-tool");
            if (!tool) return;
            const row = descriptionRow(tool);
            if (row) closeRow(row);
        },
        true
    );

    document.addEventListener(
        "keydown",
        (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (!target.matches(".nc-panel-row-desc > .nc-panel-row-icon")) {
                return;
            }
            if (!target.hasAttribute(ACTION_ATTRIBUTE)) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            const row = descriptionRow(target);
            if (!row) return;
            event.preventDefault();
            event.stopPropagation();
            toggleMenu(row);
        },
        true
    );

    const closeForLayout = () => closeAll();
    window.addEventListener("resize", closeForLayout);
    window.addEventListener("scroll", closeForLayout, true);
}

installDesktopDescriptionEditor();
