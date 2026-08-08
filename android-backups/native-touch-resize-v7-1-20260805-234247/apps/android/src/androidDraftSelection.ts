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
    target: Element;
    moved: boolean;
};

type ResizeState = {
    pointerId: number;
    edge: "top" | "bottom";
    handle: HTMLElement;
    startY: number;
    originalStartMs: number;
    originalEndMs: number;
    pixelsPerHour: number;
    lastStartMs: number;
    lastEndMs: number;
};

const neoWindow = window as NeoAndroidWindow;
const draftSelector =
    '.nc-selection-mirror[data-draft-preview="true"]';
const handleSelector = ".nc-draft-preview-resize";
const minimumDurationMs = 15 * 60 * 1000;

function isAndroidRuntime(): boolean {
    return (
        Boolean(neoWindow.NeoAndroid) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body?.classList.contains(
            "nc-platform-android"
        ) === true ||
        document.documentElement.dataset.neoCalendarPlatform ===
            "android"
    );
}

function isInteractive(target: Element): boolean {
    return Boolean(
        target.closest(
            [
                ".nc-event-block",
                draftSelector,
                ".nc-event-popup",
                ".nc-sidebar",
                "button",
                "input",
                "textarea",
                "select",
                "a",
                '[role="button"]',
                '[contenteditable="true"]',
            ].join(",")
        )
    );
}

function readDraftColor(preview: HTMLElement): string {
    const value =
        preview.style.backgroundColor ||
        window.getComputedStyle(preview).backgroundColor;

    const rgba = value.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i
    );

    if (rgba) {
        return `rgb(${Math.round(Number(rgba[1]))}, ${Math.round(
            Number(rgba[2])
        )}, ${Math.round(Number(rgba[3]))})`;
    }

    const hex = value.match(/^#([0-9a-f]{6})/i);
    return hex ? `#${hex[1]}` : "#4db6ff";
}

function ensureHandles(): void {
    const previews = Array.from(
        document.querySelectorAll<HTMLElement>(draftSelector)
    );

    for (const preview of previews) {
        preview.style.setProperty(
            "--nc-android-draft-color",
            readDraftColor(preview)
        );

        const bottom = preview.querySelector<HTMLElement>(
            `${handleSelector}:not(.nc-draft-preview-resize-top)`
        );

        if (bottom) {
            bottom.classList.add(
                "nc-draft-preview-resize-bottom"
            );
            bottom.dataset.neoResizeEdge = "bottom";
            bottom.setAttribute("aria-label", "Resize event end");
        }

        let top = preview.querySelector<HTMLElement>(
            ".nc-draft-preview-resize-top"
        );

        if (!top) {
            top = document.createElement("div");
            top.className =
                "nc-draft-preview-resize nc-draft-preview-resize-top";
            top.dataset.neoResizeEdge = "top";
            top.setAttribute("role", "button");
            top.setAttribute("aria-label", "Resize event start");
            preview.appendChild(top);
        }
    }
}

function pixelsPerHour(element: HTMLElement): number {
    const slot =
        element
            .closest<HTMLElement>(".nc-timegrid-day")
            ?.querySelector<HTMLElement>(".nc-timegrid-slot") ??
        document.querySelector<HTMLElement>(".nc-timegrid-slot");

    const slotHeight = slot?.getBoundingClientRect().height ?? 0;

    if (slotHeight > 8) {
        return slotHeight;
    }

    const cssValue = Number.parseFloat(
        window
            .getComputedStyle(document.body)
            .getPropertyValue("--nc-hour-height")
    );

    return Number.isFinite(cssValue) && cssValue > 8
        ? cssValue
        : 84;
}

function emitResize(startMs: number, endMs: number): void {
    window.dispatchEvent(
        new CustomEvent("neo-calendar-android-draft-resize", {
            detail: { startMs, endMs },
        })
    );
}

function dispatchSingleTap(
    target: Element,
    clientX: number,
    clientY: number
): void {
    const hit =
        document.elementFromPoint(clientX, clientY) ?? target;

    if (!(hit instanceof Element) || isInteractive(hit)) {
        return;
    }

    const day = hit.closest<HTMLElement>(".nc-timegrid-day");

    if (!day) {
        return;
    }

    const destination =
        hit.closest<HTMLElement>(".nc-timegrid-slot") ??
        hit.closest<HTMLElement>(".nc-timegrid-day") ??
        day;

    destination.dispatchEvent(
        new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: 2,
            button: 0,
            buttons: 0,
            clientX,
            clientY,
        })
    );

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(ensureHandles);
    });
}

function installAndroidDraftSelection(): void {
    if (neoWindow.__neoCalendarAndroidDraftSelectionInstalled) {
        return;
    }

    neoWindow.__neoCalendarAndroidDraftSelectionInstalled = true;

    let tapState: TapState | null = null;
    let resizeState: ResizeState | null = null;
    let suppressClickUntil = 0;
    let refreshQueued = false;

    const queueRefresh = (): void => {
        if (refreshQueued) {
            return;
        }

        refreshQueued = true;

        window.requestAnimationFrame(() => {
            refreshQueued = false;
            ensureHandles();
        });
    };

    window.addEventListener(
        "click",
        (event) => {
            if (
                performance.now() > suppressClickUntil ||
                !(event.target instanceof Element) ||
                !event.target.closest(".nc-timegrid-day")
            ) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
        },
        true
    );

    window.addEventListener(
        "pointerdown",
        (event) => {
            if (!isAndroidRuntime()) {
                return;
            }

            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const handle = target.closest<HTMLElement>(
                handleSelector
            );

            if (handle) {
                const preview =
                    handle.closest<HTMLElement>(draftSelector);
                const draft =
                    neoWindow.__neoCalendarAndroidDraftState;

                if (!preview || !draft || draft.allDay) {
                    return;
                }

                event.preventDefault();
                event.stopImmediatePropagation();

                resizeState = {
                    pointerId: event.pointerId,
                    edge:
                        handle.dataset.neoResizeEdge === "top" ||
                        handle.classList.contains(
                            "nc-draft-preview-resize-top"
                        )
                            ? "top"
                            : "bottom",
                    handle,
                    startY: event.clientY,
                    originalStartMs: draft.startMs,
                    originalEndMs: draft.endMs,
                    pixelsPerHour: pixelsPerHour(handle),
                    lastStartMs: draft.startMs,
                    lastEndMs: draft.endMs,
                };

                tapState = null;

                document.documentElement.classList.add(
                    "nc-android-draft-resizing"
                );

                try {
                    handle.setPointerCapture(event.pointerId);
                } catch {
                    // Pointer capture is optional in Android WebView.
                }

                return;
            }

            if (
                isInteractive(target) ||
                !target.closest(".nc-timegrid-day")
            ) {
                tapState = null;
                return;
            }

            tapState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                target,
                moved: false,
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
                const deltaMs =
                    quarterHours * minimumDurationMs;

                let startMs = resizeState.originalStartMs;
                let endMs = resizeState.originalEndMs;

                if (resizeState.edge === "top") {
                    startMs = Math.min(
                        resizeState.originalStartMs + deltaMs,
                        resizeState.originalEndMs -
                            minimumDurationMs
                    );
                } else {
                    endMs = Math.max(
                        resizeState.originalEndMs + deltaMs,
                        resizeState.originalStartMs +
                            minimumDurationMs
                    );
                }

                if (
                    startMs !== resizeState.lastStartMs ||
                    endMs !== resizeState.lastEndMs
                ) {
                    resizeState.lastStartMs = startMs;
                    resizeState.lastEndMs = endMs;
                    emitResize(startMs, endMs);
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
                resizeState.handle.releasePointerCapture(
                    event.pointerId
                );
            } catch {
                // WebView may already have released capture.
            }

            resizeState = null;
            document.documentElement.classList.remove(
                "nc-android-draft-resizing"
            );
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

        suppressClickUntil = performance.now() + 500;

        window.setTimeout(() => {
            dispatchSingleTap(
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
                document.documentElement.classList.remove(
                    "nc-android-draft-resizing"
                );
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

    new MutationObserver(queueRefresh).observe(
        document.documentElement,
        {
            childList: true,
            subtree: true,
        }
    );

    queueRefresh();
    console.info("[NeoAndroidDraftV6] installed");
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