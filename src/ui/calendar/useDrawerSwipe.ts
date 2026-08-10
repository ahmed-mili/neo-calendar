import { useEffect, useRef } from "react";

/** How far from the left edge a touch may land and still open the drawer. Wide
    enough to hit reliably, narrow enough to leave the grid's own scrolling and
    drag-to-create alone. */
export const EDGE_ZONE_PX = 24;

/** Past this share of the drawer's width, releasing settles it open. */
export const OPEN_THRESHOLD = 0.5;

/** A flick faster than this (px/ms) decides the outcome on its own, whatever
    distance the finger covered. */
export const VELOCITY_THRESHOLD = 0.4;

/** Below this the move is still ambiguous, so neither the drawer nor the grid
    claims it. */
const DIRECTION_LOCK_PX = 8;

/** On the body while a finger is actually moving the panel. */
const DRAGGING_CLASS = "nc-drawer-dragging";

/** On the body from the first drag until the panel has settled. It outlives
    DRAGGING_CLASS so the open-by-button animation, which is suppressed while a
    gesture owns the panel, cannot fire again the moment the finger lifts. */
const GESTURE_CLASS = "nc-drawer-gesture";

/** How long the panel takes to travel home on its own. Matches the opening
    animation, so closing reads as opening in reverse. */
const SETTLE_MS = 300;

/** Decelerates hard at the end: a panel this size arriving at a constant rate
    reads as a jump however long it is given. Matched in mobile.css. */
const EASING = "cubic-bezier(0.05, 0.7, 0.1, 1)";

// The Android drawer stays mounted off-screen when it is closed. Keeping one
// element alive lets CSS transition both directions without re-attaching an
// entry keyframe after a finger-driven gesture settles.
const PANEL_SELECTOR = ".nc-sidebar";
const CALENDAR_SELECTOR = ".nc-main";

/** Strength of the overlay that dims the calendar with the drawer fully out. */
const DIM_OPACITY = 0.4;

/** The overlay's opacity lives here; mobile.css reads it on .nc-main::after.
    Dimming used to be a brightness() filter, which repainted the entire grid on
    every frame of the drag — the panel could not stay under the finger. */
const DIM_PROPERTY = "--nc-drawer-dim";

export function canStartDrawerGesture({
    x,
    isOpen,
}: {
    x: number;
    isOpen: boolean;
}): boolean {
    // An open drawer can be pushed back from anywhere: the panel itself, or the
    // dimmed calendar beside it.
    if (isOpen) return true;
    return x < EDGE_ZONE_PX;
}

export function isVerticalGesture(dx: number, dy: number): boolean {
    return Math.abs(dy) > Math.abs(dx);
}

export function drawerDragProgress({
    startX,
    currentX,
    drawerWidth,
    startedOpen,
    startProgress,
}: {
    startX: number;
    currentX: number;
    drawerWidth: number;
    startedOpen?: boolean;
    startProgress?: number;
}): number {
    const travelled = (currentX - startX) / drawerWidth;
    const origin = startProgress ?? (startedOpen ? 1 : 0);
    const progress = origin + travelled;
    return Math.min(1, Math.max(0, progress));
}

export function settleDrawerOpen({
    progress,
    velocity,
}: {
    progress: number;
    velocity: number;
}): boolean {
    if (velocity > VELOCITY_THRESHOLD) return true;
    if (velocity < -VELOCITY_THRESHOLD) return false;
    return progress > OPEN_THRESHOLD;
}

interface Gesture {
    startX: number;
    startY: number;
    startedOpen: boolean;
    startProgress: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    progress: number;
    dragging: boolean;
}

function readDrawerWidth(): number {
    const declared = getComputedStyle(document.body).getPropertyValue(
        "--nc-android-drawer-width"
    );
    const parsed = parseFloat(declared);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Math.min(window.innerWidth * 0.88, 360);
}

/** Reads the composited position when a new gesture interrupts a settle. This
    runs once at direction lock, never during frame-by-frame movement. */
export function drawerVisualProgress(
    left: number,
    drawerWidth: number
): number {
    if (!Number.isFinite(left) || drawerWidth <= 0) return 0;
    return Math.min(1, Math.max(0, 1 + left / drawerWidth));
}

export interface DrawerSwipeControls {
    /** Slides out before React switches to the closed resting state, so a tap
        on the calendar never cuts the transition short. */
    requestClose: () => void;
}

/**
 * Drives the Android drawer from touch events.
 *
 * The panel's transform is written straight onto the element, frame by frame.
 * Both obvious alternatives are far slower: React state re-renders the tree on
 * every frame of a finger drag, and a CSS custom property set on <body> is
 * inherited by the whole document, so each write invalidates every node's style
 * and still leaves a calc() to resolve on the main thread. Setting a transform
 * on one already-composited element costs neither.
 */
export function useDrawerSwipe({
    enabled,
    isOpen,
    onOpenChange,
}: {
    enabled: boolean;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}): DrawerSwipeControls {
    const openRef = useRef(isOpen);
    const changeRef = useRef(onOpenChange);
    const closeRef = useRef<() => void>(() => undefined);

    openRef.current = isOpen;
    changeRef.current = onOpenChange;

    useEffect(() => {
        if (!enabled || typeof document === "undefined") {
            closeRef.current = () => changeRef.current(false);
            return;
        }

        const body = document.body;
        let gesture: Gesture | null = null;
        let panel: HTMLElement | null = null;
        let calendar: HTMLElement | null = null;
        let width = 0;
        let frame = 0;
        let pending = 0;
        let settleTimer = 0;

        const findElements = () => {
            panel = document.querySelector(PANEL_SELECTOR);
            calendar = document.querySelector(CALENDAR_SELECTOR);
        };

        const dimFor = (progress: number) => String(DIM_OPACITY * progress);

        const paint = (progress: number) => {
            if (!panel) findElements();
            if (panel) {
                const offset = (progress - 1) * width;
                panel.style.transform = "translate3d(" + offset + "px, 0, 0)";
            }
            if (calendar) {
                calendar.style.setProperty(DIM_PROPERTY, dimFor(progress));
            }
        };

        const glide = (progress: number) => {
            if (!panel) findElements();
            if (panel) {
                panel.style.transition =
                    "transform " + SETTLE_MS + "ms " + EASING;
                panel.style.transform =
                    "translate3d(" + (progress - 1) * width + "px, 0, 0)";
            }
            if (calendar) {
                calendar.style.setProperty(DIM_PROPERTY, dimFor(progress));
            }
        };

        const release = () => {
            if (panel) {
                panel.style.transform = "";
                panel.style.transition = "";
            }
            if (calendar) {
                calendar.style.removeProperty(DIM_PROPERTY);
            }
            panel = null;
            calendar = null;
        };

        // Touch events outpace the screen, so only the last position before
        // each frame is worth painting.
        const schedule = (progress: number) => {
            pending = progress;
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                paint(pending);
            });
        };

        const cancelFrame = () => {
            if (!frame) return;
            window.cancelAnimationFrame(frame);
            frame = 0;
        };

        /** Freezes an in-flight transition at the exact composited position.
            A forced layout is intentional here: it happens only when a gesture
            reverses an animation, and prevents the next transition coalescing
            with the freeze into a visible jump. */
        const freezeAtCurrentPosition = () => {
            cancelFrame();
            findElements();
            width = readDrawerWidth();
            const progress = panel
                ? drawerVisualProgress(
                      panel.getBoundingClientRect().left,
                      width
                  )
                : openRef.current
                ? 1
                : 0;
            if (panel) panel.style.transition = "none";
            paint(progress);
            if (panel) void panel.offsetWidth;
            return progress;
        };

        const clearVisualState = () => {
            cancelFrame();
            release();
            body.classList.remove(DRAGGING_CLASS);
            body.classList.remove(GESTURE_CLASS);
        };

        /** Runs the opening animation backwards, then lets React unmount. */
        const glideClosed = () => {
            if (settleTimer) window.clearTimeout(settleTimer);
            settleTimer = 0;
            freezeAtCurrentPosition();
            if (!panel) {
                changeRef.current(false);
                return;
            }

            body.classList.add(GESTURE_CLASS);
            body.classList.remove(DRAGGING_CLASS);
            glide(0);

            settleTimer = window.setTimeout(() => {
                settleTimer = 0;
                changeRef.current(false);
                clearVisualState();
            }, SETTLE_MS);
        };

        const glideOpen = () => {
            if (settleTimer) window.clearTimeout(settleTimer);
            settleTimer = 0;
            freezeAtCurrentPosition();
            body.classList.add(GESTURE_CLASS);
            body.classList.remove(DRAGGING_CLASS);
            if (!openRef.current) changeRef.current(true);
            glide(1);

            settleTimer = window.setTimeout(() => {
                settleTimer = 0;
                if (!gesture) clearVisualState();
            }, SETTLE_MS);
        };

        /** Multi-touch and pointer cancellation return to the side where the
            gesture began. They never leave an inline transform or timer behind. */
        const cancelGesture = () => {
            if (!gesture) return;
            const restoreOpen = gesture.startedOpen;
            const wasDragging = gesture.dragging;
            gesture = null;
            if (!wasDragging) return;
            cancelFrame();
            if (restoreOpen) glideOpen();
            else glideClosed();
        };

        closeRef.current = glideClosed;

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                cancelGesture();
                return;
            }

            const touch = event.touches[0];
            if (
                !canStartDrawerGesture({
                    x: touch.clientX,
                    isOpen: openRef.current || !!settleTimer,
                })
            ) {
                return;
            }

            width = readDrawerWidth();
            gesture = {
                startX: touch.clientX,
                startY: touch.clientY,
                startedOpen: openRef.current,
                startProgress: openRef.current ? 1 : 0,
                lastX: touch.clientX,
                lastTime: event.timeStamp,
                velocity: 0,
                progress: openRef.current ? 1 : 0,
                dragging: false,
            };
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!gesture) return;

            if (event.touches.length !== 1) {
                cancelGesture();
                return;
            }

            const touch = event.touches[0];
            const dx = touch.clientX - gesture.startX;
            const dy = touch.clientY - gesture.startY;

            if (!gesture.dragging) {
                if (
                    Math.abs(dx) < DIRECTION_LOCK_PX &&
                    Math.abs(dy) < DIRECTION_LOCK_PX
                ) {
                    return;
                }

                if (isVerticalGesture(dx, dy)) {
                    gesture = null;
                    return;
                }

                if (settleTimer) window.clearTimeout(settleTimer);
                settleTimer = 0;
                body.classList.add(GESTURE_CLASS);
                body.classList.add(DRAGGING_CLASS);

                // Re-sample at direction lock, not touch-down. If a previous
                // settle moved during those first 8px, continuing from the old
                // position would produce a visible jump.
                gesture.startProgress = freezeAtCurrentPosition();
                gesture.progress = gesture.startProgress;
                gesture.startX = touch.clientX;
                gesture.lastX = touch.clientX;
                gesture.lastTime = event.timeStamp;
                gesture.velocity = 0;
                gesture.dragging = true;

                // React only hears the two resting states, never every frame.
                if (!gesture.startedOpen) changeRef.current(true);
            }

            const elapsed = event.timeStamp - gesture.lastTime;
            if (elapsed > 0) {
                gesture.velocity = (touch.clientX - gesture.lastX) / elapsed;
                gesture.lastX = touch.clientX;
                gesture.lastTime = event.timeStamp;
            }

            gesture.progress = drawerDragProgress({
                startX: gesture.startX,
                currentX: touch.clientX,
                drawerWidth: width,
                startProgress: gesture.startProgress,
            });

            schedule(gesture.progress);

            if (event.cancelable) event.preventDefault();
        };

        const onTouchEnd = () => {
            if (!gesture) return;

            const wasDragging = gesture.dragging;
            const settled = wasDragging
                ? settleDrawerOpen({
                      progress: gesture.progress,
                      velocity: gesture.velocity,
                  })
                : gesture.startedOpen;

            gesture = null;
            cancelFrame();

            if (!wasDragging) {
                // A tap during a running settle must not cancel that settle.
                return;
            }

            if (!settled) {
                glideClosed();
                return;
            }

            glideOpen();
        };

        const onTouchCancel = () => {
            cancelGesture();
        };

        document.addEventListener("touchstart", onTouchStart, {
            passive: true,
        });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd, { passive: true });
        document.addEventListener("touchcancel", onTouchCancel, {
            passive: true,
        });

        return () => {
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", onTouchCancel);
            if (settleTimer) window.clearTimeout(settleTimer);
            clearVisualState();
        };
    }, [enabled]);

    return {
        requestClose: () => closeRef.current(),
    };
}
