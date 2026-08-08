type NeoAndroidDraftState = {
    startMs: number;
    endMs: number;
    allDay: boolean;
};

type NeoAndroidWindow = Window & {
    NeoAndroid?: unknown;
    __neoCalendarAndroidDraftSelectionInstalled?: boolean;
    __neoCalendarAndroidDraftState?: NeoAndroidDraftState | null;
};

type TapState = {
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    target: Element;
};

type ResizeState = {
    pointerId: number;
    edge: "top" | "bottom";
    startY: number;
    originalStartMs: number;
    originalEndMs: number;
    pixelsPerHour: number;
    lastStartMs: number;
    lastEndMs: number;
    handle: HTMLElement;
};

const neoWindow = window as NeoAndroidWindow;
const DRAFT_SELECTOR = '.nc-selection-mirror[data-draft-preview="true"]';
const HANDLE_SELECTOR = ".nc-draft-preview-resize";
const MIN_DURATION_MS = 15 * 60 * 1000;

function isAndroidRuntime(): boolean {
    return (
        Boolean(neoWindow.NeoAndroid) ||
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body?.classList.contains("nc-platform-android") === true ||
        document.documentElement.dataset.neoCalendarPlatform === "android"
    );
}

function opaqueColor(source: string): string {
    const value = source.trim();

    const rgb = value.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i
    );

    if (rgb) {
        return `rgb(${Math.round(Number(rgb[1]))}, ${Math.round(
            Number(rgb[2])
        )}, ${Math.round(Number(rgb[3]))})`;
    }

    const hex = value.match(/^#([0-9a-f]{6})/i);

    if (hex) {
        return `#${hex[1]}`;
    }

    return "#4db6ff";
}

function readDraftColor(preview: HTMLElement): string {
    const inlineColor = preview.style.backgroundColor;

    if (inlineColor) {
        return opaqueColor(inlineColor);
    }

    return opaqueColor(window.getComputedStyle(preview).backgroundColor);
}

function ensureDraftHandles(): void {
    const previews = Array.from(
        document.querySelectorAll<HTMLElement>(DRAFT_SELECTOR)
    );

    for (const preview of previews) {
        preview.style.setProperty(
            "--nc-android-draft-color",
            readDraftColor(preview)
        );

        const existingBottom = preview.querySelector<HTMLElement>(
            `${HANDLE_SELECTOR}:not(.nc-draft-preview-resize-top)`
        );

        if (existingBottom) {
            existingBottom.classList.add(
                "nc-draft-preview-resize-bottom"
            );
            existingBottom.dataset.neoResizeEdge = "bottom";
            existingBottom.setAttribute(
                "aria-label",
                "Resize event end"
            );
        }

        let topHandle = preview.querySelector<HTMLElement>(
            ".nc-draft-preview-resize-top"
        );

        if (!topHandle) {
            topHandle = document.createElement("div");
            topHandle.className =
                "nc-draft-preview-resize nc-draft-preview-resize-top";
            topHandle.dataset.neoResizeEdge = "top";
            topHandle.dataset.neoAndroidCreated = "true";
            topHandle.setAttribute("role", "button");
            topHandle.setAttribute(
                "aria-label",
                "Resize event start"
            );
            preview.appendChild(topHandle);
        }
    }
}

function readPixelsPerHour(handle: HTMLElement): number {
    const day =
        handle.closest<HTMLElement>(".nc-timegrid-day") ??
        document.querySelector<HTMLElement>(".nc-timegrid-day");

    const slot = day?.querySelector<HTMLElement>(".nc-timegrid-slot");
    const height = slot?.getBoundingClientRect().height ?? 0;

    return height > 8 ? height : 64;
}

function emitResize(startMs: number, endMs: number): void {
    window.dispatchEvent(
        new CustomEvent("neo-calendar-android-draft-resize", {
            detail: { startMs, endMs },
        })
    );
}

function dispatchSingleTapSelection(
    target: Element,
    clientX: number,
    clientY: number
): void {
    const hit =
        document.elementFromPoint(clientX, clientY) ??
        target;

    if (!(hit instanceof Element)) {
        return;
    }

    if (
        hit.closest(".nc-event-block") ||
        hit.closest(DRAFT_SELECTOR) ||
        hit.closest("button, input, textarea, select, a")
    ) {
        return;
    }

    const day = hit.closest<HTMLElement>(".nc-timegrid-day");

    if (!day) {
        return;
    }

    const dispatchTarget = hit.closest(".nc-timegrid-slot") ?? hit;

    dispatchTarget.dispatchEvent(
        new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            button: 0,
            buttons: 0,
            clientX,
            clientY,
        })
    );

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(ensureDraftHandles);
    });
}

function installAndroidDraftSelection(): void {
    if (neoWindow.__neoCalendarAndroidDraftSelectionInstalled) {
        return;
    }

    neoWindow.__neoCalendarAndroidDraftSelectionInstalled = true;

    let tapState: TapState | null = null;
    let resizeState: ResizeState | null = null;
    let refreshQueued = false;

    const queueRefresh = (): void => {
        if (refreshQueued) {
            return;
        }

        refreshQueued = true;

        window.requestAnimationFrame(() => {
            refreshQueued = false;
            ensureDraftHandles();
        });
    };

    document.addEventListener(
        "pointerdown",
        (event) => {
            if (
                !isAndroidRuntime() ||
                event.pointerType === "mouse"
            ) {
                return;
            }

            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const handle = target.closest<HTMLElement>(HANDLE_SELECTOR);

            if (handle) {
                const preview = handle.closest<HTMLElement>(DRAFT_SELECTOR);
                const draft = neoWindow.__neoCalendarAndroidDraftState;

                if (!preview || !draft || draft.allDay) {
                    return;
                }

                const edge =
                    handle.dataset.neoResizeEdge === "top"
                        ? "top"
                        : "bottom";

                event.preventDefault();
                event.stopImmediatePropagation();

                resizeState = {
                    pointerId: event.pointerId,
                    edge,
                    startY: event.clientY,
                    originalStartMs: draft.startMs,
                    originalEndMs: draft.endMs,
                    pixelsPerHour: readPixelsPerHour(handle),
                    lastStartMs: draft.startMs,
                    lastEndMs: draft.endMs,
                    handle,
                };

                try {
                    handle.setPointerCapture(event.pointerId);
                } catch {
                    // Pointer capture is optional in Android WebView.
                }

                tapState = null;
                return;
            }

            if (
                target.closest(".nc-event-block") ||
                target.closest(DRAFT_SELECTOR) ||
                target.closest("button, input, textarea, select, a")
            ) {
                tapState = null;
                return;
            }

            if (!target.closest(".nc-timegrid-day")) {
                tapState = null;
                return;
            }

            tapState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                moved: false,
                target,
            };
        },
        true
    );

    window.addEventListener(
        "pointermove",
        (event) => {
            if (
                resizeState &&
                event.pointerId === resizeState.pointerId
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();

                const deltaY = event.clientY - resizeState.startY;
                const quarterHours = Math.round(
                    (deltaY / resizeState.pixelsPerHour) * 4
                );
                const deltaMs = quarterHours * MIN_DURATION_MS;

                let nextStartMs = resizeState.originalStartMs;
                let nextEndMs = resizeState.originalEndMs;

                if (resizeState.edge === "top") {
                    nextStartMs = Math.min(
                        resizeState.originalStartMs + deltaMs,
                        resizeState.originalEndMs - MIN_DURATION_MS
                    );
                } else {
                    nextEndMs = Math.max(
                        resizeState.originalEndMs + deltaMs,
                        resizeState.originalStartMs + MIN_DURATION_MS
                    );
                }

                if (
                    nextStartMs !== resizeState.lastStartMs ||
                    nextEndMs !== resizeState.lastEndMs
                ) {
                    resizeState.lastStartMs = nextStartMs;
                    resizeState.lastEndMs = nextEndMs;
                    emitResize(nextStartMs, nextEndMs);
                }

                return;
            }

            if (
                tapState &&
                event.pointerId === tapState.pointerId
            ) {
                const distance = Math.hypot(
                    event.clientX - tapState.startX,
                    event.clientY - tapState.startY
                );

                if (distance > 12) {
                    tapState.moved = true;
                }
            }
        },
        true
    );

    const finishPointer = (event: PointerEvent): void => {
        if (
            resizeState &&
            event.pointerId === resizeState.pointerId
        ) {
            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                resizeState.handle.releasePointerCapture(event.pointerId);
            } catch {
                // The WebView may already have released capture.
            }

            resizeState = null;
            queueRefresh();
            return;
        }

        if (
            !tapState ||
            event.pointerId !== tapState.pointerId
        ) {
            return;
        }

        const completedTap = !tapState.moved;
        const target = tapState.target;
        const clientX = event.clientX;
        const clientY = event.clientY;

        tapState = null;

        if (!completedTap) {
            return;
        }

        window.setTimeout(() => {
            dispatchSingleTapSelection(
                target,
                clientX,
                clientY
            );
        }, 0);
    };

    window.addEventListener("pointerup", finishPointer, true);
    window.addEventListener(
        "pointercancel",
        (event) => {
            if (
                resizeState &&
                event.pointerId === resizeState.pointerId
            ) {
                resizeState = null;
            }

            if (
                tapState &&
                event.pointerId === tapState.pointerId
            ) {
                tapState = null;
            }
        },
        true
    );

    const observer = new MutationObserver(queueRefresh);

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    queueRefresh();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        installAndroidDraftSelection,
        { once: true }
    );
} else {
    installAndroidDraftSelection();
}

export {};