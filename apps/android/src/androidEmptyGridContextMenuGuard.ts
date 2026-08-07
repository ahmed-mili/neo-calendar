type NeoAndroidWindow = Window & {
    NeoAndroid?: unknown;
    __neoEmptyGridContextMenuGuardV77?: boolean;
};

const neoWindow = window as NeoAndroidWindow;

const emptyGridSurfaceSelector = [
    ".nc-timegrid-day",
    ".nc-days-row",
    ".nc-main-scroller",
    ".nc-timegrid-wrapper",
].join(",");

function isAndroidRuntime(): boolean {
    return (
        Boolean(neoWindow.NeoAndroid) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body?.classList.contains(
            "nc-platform-android"
        ) === true
    );
}

function normalizedText(element: Element): string {
    return (element.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

function isEmptyGridMenu(menu: Element): boolean {
    const text = normalizedText(menu);

    return (
        text.includes("create event") &&
        text.includes("paste event")
    );
}

function removeEmptyGridMenus(): void {
    for (const menu of Array.from(
        document.querySelectorAll<HTMLElement>(
            ".nc-context-menu"
        )
    )) {
        if (!isEmptyGridMenu(menu)) {
            continue;
        }

        menu.remove();
    }

    for (const line of Array.from(
        document.querySelectorAll<HTMLElement>(
            ".nc-context-line"
        )
    )) {
        line.remove();
    }
}

function blockEmptyGridContextMenu(event: Event): void {
    if (!isAndroidRuntime()) {
        return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    if (
        target.closest(".nc-event-block") ||
        target.closest(".nc-event-popup") ||
        target.closest(".nc-sidebar") ||
        target.closest("input, textarea, [contenteditable='true']")
    ) {
        return;
    }

    if (!target.closest(emptyGridSurfaceSelector)) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    window.requestAnimationFrame(
        removeEmptyGridMenus
    );
}

function install(): void {
    if (
        !isAndroidRuntime() ||
        neoWindow.__neoEmptyGridContextMenuGuardV77
    ) {
        return;
    }

    neoWindow.__neoEmptyGridContextMenuGuardV77 = true;

    /*
     * React receives onContextMenu after this capture listener.
     * Stopping it here prevents CalendarApp from creating the desktop
     * "Create event / Paste event" menu on Android.
     */
    window.addEventListener(
        "contextmenu",
        blockEmptyGridContextMenu,
        {
            capture: true,
            passive: false,
        }
    );

    /*
     * Fallback for a menu already queued by React before the guard runs,
     * or restored during a re-render.
     */
    new MutationObserver(
        removeEmptyGridMenus
    ).observe(
        document.documentElement,
        {
            childList: true,
            subtree: true,
        }
    );

    removeEmptyGridMenus();

    console.info(
        "[NeoEmptyGridContextMenuGuardV77] installed"
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        install,
        {
            once: true,
        }
    );
} else {
    install();
}

export {};