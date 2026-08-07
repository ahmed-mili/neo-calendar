type NeoAndroidWindow = Window & {
    NeoAndroid?: unknown;
    __neoNativeTouchResizeV71?: boolean;
};

type PendingTap = {
    eventId: string;
    target: HTMLElement;
    block: HTMLElement;
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
    createdAt: number;
    timer: number;
};

const neoWindow =
    window as NeoAndroidWindow;

const eventSelector =
    ".nc-event-block[data-event-id]";

const handleSelector =
    ".nc-event-resize-handle, " +
    ".nc-event-resize-handle-top";

const doubleTapWindowMs = 340;

function isAndroidRuntime(): boolean {
    return (
        Boolean(
            neoWindow.NeoAndroid
        ) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body?.classList.contains(
            "nc-platform-android"
        ) === true
    );
}

function readEventColor(
    block: HTMLElement
): string {
    const computed =
        window.getComputedStyle(
            block
        );

    return (
        computed.borderLeftColor ||
        computed.borderTopColor ||
        "currentColor"
    );
}

function clearResizeMode(): void {
    for (const block of Array.from(
        document.querySelectorAll<HTMLElement>(
            eventSelector
        )
    )) {
        block.classList.remove(
            "nc-android-event-resize-selected"
        );

        block.removeAttribute(
            "aria-selected"
        );
    }

    document.documentElement.removeAttribute(
        "data-neo-resize-event-id"
    );
}

function enterResizeMode(
    block: HTMLElement
): void {
    const eventId =
        block.dataset.eventId;

    if (!eventId) {
        return;
    }

    clearResizeMode();

    document.documentElement.setAttribute(
        "data-neo-resize-event-id",
        eventId
    );

    for (const matching of Array.from(
        document.querySelectorAll<HTMLElement>(
            eventSelector
        )
    )) {
        if (
            matching.dataset.eventId !==
            eventId
        ) {
            continue;
        }

        matching.classList.add(
            "nc-android-event-resize-selected"
        );

        matching.style.setProperty(
            "--nc-android-event-color",
            readEventColor(
                matching
            )
        );

        matching.setAttribute(
            "aria-selected",
            "true"
        );
    }
}

function syntheticMouseDown(
    handle: HTMLElement,
    source: PointerEvent
): void {
    handle.dispatchEvent(
        new MouseEvent(
            "mousedown",
            {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                button: 0,
                buttons: 1,
                clientX:
                    source.clientX,
                clientY:
                    source.clientY,
                screenX:
                    source.screenX,
                screenY:
                    source.screenY,
            }
        )
    );
}

function install(): void {
    if (
        neoWindow
            .__neoNativeTouchResizeV71
    ) {
        return;
    }

    neoWindow
        .__neoNativeTouchResizeV71 =
        true;

    let pending:
        | PendingTap
        | null = null;

    let replayingClick =
        false;

    const replay = (
        current: PendingTap
    ) => {
        if (
            pending !== current
        ) {
            return;
        }

        pending = null;
        replayingClick = true;

        current.target.dispatchEvent(
            new MouseEvent(
                "click",
                {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    button: 0,
                    buttons: 0,
                    clientX:
                        current.clientX,
                    clientY:
                        current.clientY,
                    screenX:
                        current.screenX,
                    screenY:
                        current.screenY,
                }
            )
        );

        replayingClick = false;
    };

    window.addEventListener(
        "click",
        (event) => {
            if (
                !isAndroidRuntime() ||
                replayingClick
            ) {
                return;
            }

            const target =
                event.target;

            if (
                !(
                    target instanceof
                    HTMLElement
                )
            ) {
                return;
            }

            if (
                target.closest(
                    handleSelector
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }

            const block =
                target.closest<HTMLElement>(
                    eventSelector
                );

            if (!block) {
                clearResizeMode();
                return;
            }

            const eventId =
                block.dataset.eventId;

            if (!eventId) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            const now =
                performance.now();

            if (
                pending &&
                pending.eventId ===
                    eventId &&
                now -
                    pending.createdAt <=
                    doubleTapWindowMs
            ) {
                window.clearTimeout(
                    pending.timer
                );

                pending = null;

                /*
                 * The double tap is a switch, not a one-way door.
                 *
                 * It is what puts a block into resize mode, so it is also what
                 * takes it out — otherwise the only way back was to tap
                 * somewhere else entirely, and tapping the block you are
                 * working on did nothing at all.
                 */
                if (
                    block.classList.contains(
                        "nc-android-event-resize-selected"
                    )
                ) {
                    clearResizeMode();
                } else {
                    enterResizeMode(
                        block
                    );
                }

                return;
            }

            if (pending) {
                window.clearTimeout(
                    pending.timer
                );

                const old =
                    pending;

                pending = null;
                replay(old);
            }

            const current:
                PendingTap = {
                eventId,
                target,
                block,
                clientX:
                    event.clientX,
                clientY:
                    event.clientY,
                screenX:
                    event.screenX,
                screenY:
                    event.screenY,
                createdAt:
                    now,
                timer: 0,
            };

            current.timer =
                window.setTimeout(
                    () => {
                        replay(
                            current
                        );
                    },
                    doubleTapWindowMs
                );

            pending =
                current;
        },
        true
    );

    window.addEventListener(
        "pointerdown",
        (event) => {
            if (
                !isAndroidRuntime()
            ) {
                return;
            }

            const target =
                event.target;

            if (
                !(
                    target instanceof
                    HTMLElement
                )
            ) {
                return;
            }

            const handle =
                target.closest<HTMLElement>(
                    handleSelector
                );

            if (!handle) {
                /*
                 * An event being resized is not an event being moved.
                 *
                 * Once a double tap has put a block in resize mode, its two
                 * handles are what the finger is aiming at — and they sit on
                 * the block, whose own drag would otherwise start the moment
                 * the finger missed one by a few pixels. Reaching for a handle
                 * and sliding the event across the day instead is the kind of
                 * mistake that has to be undone by hand.
                 *
                 * Only the drag is refused. The pointerdown is stopped before
                 * the grid's sensor hears it, but no default is prevented, so
                 * the tap that follows still lands: tapping the block still
                 * opens it, and tapping away still leaves resize mode.
                 */
                const selected =
                    target.closest<HTMLElement>(
                        eventSelector
                    );

                if (
                    selected?.classList.contains(
                        "nc-android-event-resize-selected"
                    )
                ) {
                    event.stopImmediatePropagation();
                }

                return;
            }

            const block =
                handle.closest<HTMLElement>(
                    eventSelector
                );

            if (
                !block ||
                !block.classList.contains(
                    "nc-android-event-resize-selected"
                )
            ) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                handle.setPointerCapture(
                    event.pointerId
                );
            } catch {
                // Pointer capture is optional.
            }

            syntheticMouseDown(
                handle,
                event
            );
        },
        true
    );

    new MutationObserver(() => {
        const eventId =
            document.documentElement.getAttribute(
                "data-neo-resize-event-id"
            );

        if (!eventId) {
            return;
        }

        for (const block of Array.from(
            document.querySelectorAll<HTMLElement>(
                eventSelector
            )
        )) {
            if (
                block.dataset.eventId !==
                eventId
            ) {
                continue;
            }

            block.classList.add(
                "nc-android-event-resize-selected"
            );

            block.style.setProperty(
                "--nc-android-event-color",
                readEventColor(
                    block
                )
            );
        }
    }).observe(
        document.documentElement,
        {
            childList: true,
            subtree: true,
        }
    );

    console.info(
        "[NeoNativeTouchResizeV71] installed"
    );
}

if (
    document.readyState ===
    "loading"
) {
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