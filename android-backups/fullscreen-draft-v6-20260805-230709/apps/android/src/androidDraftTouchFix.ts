type DraftState = {
    startMs: number;
    endMs: number;
    allDay: boolean;
};

type NeoWindow = Window & {
    NeoAndroid?: unknown;
    __neoCalendarAndroidDraftState?: DraftState | null;
    __neoDraftTouchV5?: boolean;
};

type Resize = {
    pointerId: number;
    edge: "top" | "bottom";
    handle: HTMLElement;
    preview: HTMLElement;
    startY: number;
    startTop: number;
    startHeight: number;
    pixelsPerHour: number;
    startMs: number;
    endMs: number;
};

const neo = window as NeoWindow;
const previewSelector =
    '.nc-selection-mirror[data-draft-preview="true"]';
const handleSelector =
    ".nc-draft-preview-resize, " +
    ".nc-draft-preview-resize-top, " +
    ".nc-draft-preview-resize-bottom";
const quarterHourMs = 15 * 60 * 1000;

let resize: Resize | null = null;
let creating = false;

function isAndroid(): boolean {
    return (
        Boolean(neo.NeoAndroid) ||
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body?.classList.contains("nc-platform-android") === true
    );
}

function isBlocked(target: Element): boolean {
    return Boolean(
        target.closest(
            ".nc-event-block, " +
                previewSelector +
                ", .nc-event-popup, .nc-sidebar, " +
                "button, input, textarea, select, a, " +
                '[role="button"], [contenteditable="true"]'
        )
    );
}

function oneTap(event: MouseEvent): void {
    if (!isAndroid() || creating || event.button !== 0) return;

    const target = event.target;
    if (!(target instanceof Element) || isBlocked(target)) return;

    const day = target.closest<HTMLElement>(".nc-timegrid-day");
    if (!day) return;

    const hit =
        document.elementFromPoint(event.clientX, event.clientY) ?? target;

    if (!(hit instanceof Element) || isBlocked(hit)) return;

    const destination =
        hit.closest<HTMLElement>(".nc-timegrid-slot") ??
        hit.closest<HTMLElement>(".nc-timegrid-day") ??
        day;

    event.preventDefault();
    event.stopImmediatePropagation();

    creating = true;

    destination.dispatchEvent(
        new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: 2,
            button: 0,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
        })
    );

    setTimeout(() => {
        creating = false;
    }, 0);
}

function mouse(
    target: EventTarget,
    type: "mousedown" | "mousemove" | "mouseup",
    source: PointerEvent
): void {
    target.dispatchEvent(
        new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            button: 0,
            buttons: type === "mouseup" ? 0 : 1,
            clientX: source.clientX,
            clientY: source.clientY,
            screenX: source.screenX,
            screenY: source.screenY,
        })
    );
}

function pxPerHour(element: HTMLElement): number {
    const day =
        element.closest<HTMLElement>(".nc-timegrid-day") ??
        document.querySelector<HTMLElement>(".nc-timegrid-day");

    const slot = day?.querySelector<HTMLElement>(".nc-timegrid-slot");
    const height = slot?.getBoundingClientRect().height ?? 0;

    return height > 8 ? height : 64;
}

function begin(event: PointerEvent): void {
    if (!isAndroid()) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const handle = target.closest<HTMLElement>(handleSelector);
    if (!handle) return;

    const preview = handle.closest<HTMLElement>(previewSelector);
    if (!preview) return;

    const state = neo.__neoCalendarAndroidDraftState;
    const rect = preview.getBoundingClientRect();

    event.preventDefault();
    event.stopImmediatePropagation();

    resize = {
        pointerId: event.pointerId,
        edge:
            handle.classList.contains("nc-draft-preview-resize-top") ||
            handle.dataset.neoResizeEdge === "top"
                ? "top"
                : "bottom",
        handle,
        preview,
        startY: event.clientY,
        startTop: preview.offsetTop,
        startHeight: rect.height,
        pixelsPerHour: pxPerHour(handle),
        startMs: state?.startMs ?? 0,
        endMs: state?.endMs ?? 0,
    };

    document.documentElement.classList.add("nc-android-draft-resizing");

    try {
        handle.setPointerCapture(event.pointerId);
    } catch {}

    mouse(handle, "mousedown", event);
}

function move(event: PointerEvent): void {
    const current = resize;
    if (!current || event.pointerId !== current.pointerId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const raw = event.clientY - current.startY;
    const stepPx = current.pixelsPerHour / 4;
    const snapped = Math.round(raw / stepPx) * stepPx;
    const minHeight = Math.max(stepPx, 12);

    if (current.edge === "top") {
        const limited = Math.min(
            snapped,
            current.startHeight - minHeight
        );

        current.preview.style.top =
            `${current.startTop + limited}px`;
        current.preview.style.height =
            `${current.startHeight - limited}px`;
    } else {
        current.preview.style.height =
            `${Math.max(minHeight, current.startHeight + snapped)}px`;
    }

    mouse(window, "mousemove", event);

    if (current.startMs > 0 && current.endMs > current.startMs) {
        const steps = Math.round(
            (raw / current.pixelsPerHour) * 4
        );
        const delta = steps * quarterHourMs;

        const startMs =
            current.edge === "top"
                ? Math.min(
                      current.startMs + delta,
                      current.endMs - quarterHourMs
                  )
                : current.startMs;

        const endMs =
            current.edge === "bottom"
                ? Math.max(
                      current.endMs + delta,
                      current.startMs + quarterHourMs
                  )
                : current.endMs;

        window.dispatchEvent(
            new CustomEvent("neo-calendar-android-draft-resize", {
                detail: { startMs, endMs },
            })
        );
    }
}

function end(event: PointerEvent): void {
    const current = resize;
    if (!current || event.pointerId !== current.pointerId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    mouse(window, "mouseup", event);

    try {
        current.handle.releasePointerCapture(event.pointerId);
    } catch {}

    current.preview.style.removeProperty("top");
    current.preview.style.removeProperty("height");

    resize = null;
    document.documentElement.classList.remove(
        "nc-android-draft-resizing"
    );
}

function hideViewNote(): void {
    const popup = document.querySelector<HTMLElement>(
        ".nc-event-popup--draft, .nc-event-popup--android-draft"
    );

    if (!popup) return;

    for (const element of popup.querySelectorAll<HTMLElement>(
        "button, [role='button']"
    )) {
        const text = element.textContent?.trim().toLowerCase();

        if (text === "view note" || text === "voir la note") {
            element.style.display = "none";
        }
    }
}

function install(): void {
    if (neo.__neoDraftTouchV5) return;
    neo.__neoDraftTouchV5 = true;

    window.addEventListener("click", oneTap, true);
    window.addEventListener("pointerdown", begin, {
        capture: true,
        passive: false,
    });
    window.addEventListener("pointermove", move, {
        capture: true,
        passive: false,
    });
    window.addEventListener("pointerup", end, {
        capture: true,
        passive: false,
    });
    window.addEventListener("pointercancel", end, {
        capture: true,
        passive: false,
    });

    new MutationObserver(hideViewNote).observe(
        document.documentElement,
        { childList: true, subtree: true }
    );

    hideViewNote();
    console.info("[NeoDraftTouchV5] installed");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {
        once: true,
    });
} else {
    install();
}

export {};