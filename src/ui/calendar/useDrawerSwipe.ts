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
const SETTLE_MS = 240;

const EASING = "cubic-bezier(0.2, 0.85, 0.25, 1)";

const PANEL_SELECTOR = ".nc-sidebar:not(.nc-sidebar-collapsed)";
const SCRIM_SELECTOR = ".nc-mobile-sidebar-scrim";

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
}: {
    startX: number;
    currentX: number;
    drawerWidth: number;
    startedOpen: boolean;
}): number {
    const travelled = (currentX - startX) / drawerWidth;
    const progress = startedOpen ? 1 + travelled : travelled;
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

export interface DrawerSwipeControls {
    /** Slides the panel out before React unmounts it, so closing by tapping the
        calendar looks like the opening run backwards instead of a cut. */
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
        let scrim: HTMLElement | null = null;
        let width = 0;
        let frame = 0;
        let pending = 0;
        let closingTimer = 0;

        const findElements = () => {
            panel = document.querySelector(PANEL_SELECTOR);
            scrim = document.querySelector(SCRIM_SELECTOR);
        };

        const paint = (progress: number) => {
            if (!panel) findElements();
            if (panel) {
                const offset = (progress - 1) * width;
                panel.style.transform = "translate3d(" + offset + "px, 0, 0)";
            }
            if (scrim) scrim.style.opacity = String(progress);
        };

        const glide = (progress: number) => {
            if (!panel) findElements();
            if (panel) {
                panel.style.transition =
                    "transform " + SETTLE_MS + "ms " + EASING;
                panel.style.transform =
                    "translate3d(" + (progress - 1) * width + "px, 0, 0)";
            }
            if (scrim) {
                scrim.style.transition = "opacity " + SETTLE_MS + "ms ease";
                scrim.style.opacity = String(progress);
            }
        };

        const release = () => {
            if (panel) {
                panel.style.transform = "";
                panel.style.transition = "";
            }
            if (scrim) {
                scrim.style.opacity = "";
                scrim.style.transition = "";
            }
            panel = null;
            scrim = null;
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

        const clearVisualState = () => {
            cancelFrame();
            release();
            body.classList.remove(DRAGGING_CLASS);
            body.classList.remove(GESTURE_CLASS);
        };

        const abandon = () => {
            gesture = null;
            clearVisualState();
        };

        /** Runs the opening animation backwards, then lets React unmount. */
        const glideClosed = () => {
            if (closingTimer) return;

            cancelFrame();
            findElements();
            if (!panel) {
                changeRef.current(false);
                return;
            }

            body.classList.add(GESTURE_CLASS);
            body.classList.remove(DRAGGING_CLASS);
            width = readDrawerWidth();
            glide(0);

            closingTimer = window.setTimeout(() => {
                closingTimer = 0;
                clearVisualState();
                changeRef.current(false);
            }, SETTLE_MS);
        };

        closeRef.current = glideClosed;

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                abandon();
                return;
            }

            const touch = event.touches[0];
            if (
                !canStartDrawerGesture({
                    x: touch.clientX,
                    isOpen: openRef.current,
                })
            ) {
                return;
            }

            width = readDrawerWidth();
            gesture = {
                startX: touch.clientX,
                startY: touch.clientY,
                startedOpen: openRef.current,
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
                abandon();
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
                    abandon();
                    return;
                }

                gesture.dragging = true;
                body.classList.add(DRAGGING_CLASS);
                body.classList.add(GESTURE_CLASS);

                // The drawer's contents only mount once React believes it is
                // open, so an opening drag has to say so straight away — the
                // panel is held under the finger from here on.
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
                startedOpen: gesture.startedOpen,
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
                clearVisualState();
                return;
            }

            if (!settled) {
                glideClosed();
                return;
            }

            // Let it fall the rest of the way open on its own rather than
            // snapping to wherever the finger let go.
            body.classList.remove(DRAGGING_CLASS);
            glide(1);

            window.setTimeout(() => {
                if (!gesture && !closingTimer) clearVisualState();
            }, SETTLE_MS);
        };

        const onTouchCancel = () => {
            if (!gesture) return;
            const wasOpen = gesture.startedOpen;
            abandon();
            if (openRef.current !== wasOpen) changeRef.current(wasOpen);
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
            if (closingTimer) window.clearTimeout(closingTimer);
            clearVisualState();
        };
    }, [enabled]);

    return {
        requestClose: () => closeRef.current(),
    };
}
