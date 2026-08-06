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

const PROGRESS_PROPERTY = "--nc-drawer-progress";

/** On the body while a finger is actually moving the panel. */
const DRAGGING_CLASS = "nc-drawer-dragging";

/** On the body from the first drag until the panel has settled. It outlives
    DRAGGING_CLASS so the open-by-button animation, which is suppressed while a
    gesture owns the panel, cannot fire again the moment the finger lifts. */
const GESTURE_CLASS = "nc-drawer-gesture";

/** Matches the CSS transition on the panel, so the property is only dropped
    once the drawer has finished sliding home. */
const SETTLE_MS = 220;

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

/**
 * Drives the Android drawer from touch events.
 *
 * The progress of the drag travels through a CSS custom property rather than
 * React state: going through a render on every frame of a finger drag makes the
 * panel stutter. React is only told when the drawer actually opens or closes.
 */
export function useDrawerSwipe({
    enabled,
    isOpen,
    onOpenChange,
}: {
    enabled: boolean;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}): void {
    const openRef = useRef(isOpen);
    const changeRef = useRef(onOpenChange);

    openRef.current = isOpen;
    changeRef.current = onOpenChange;

    useEffect(() => {
        if (!enabled || typeof document === "undefined") return;

        const body = document.body;
        let gesture: Gesture | null = null;
        let width = 0;
        let frame = 0;
        let pendingProgress = 0;

        // Touch events fire faster than the screen refreshes, so writing the
        // property on every one of them costs style recalculations nobody ever
        // sees. Only the latest value before each frame matters.
        const scheduleProgress = (progress: number) => {
            pendingProgress = progress;
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                body.style.setProperty(
                    PROGRESS_PROPERTY,
                    String(pendingProgress)
                );
            });
        };

        const clearVisualState = () => {
            if (frame) {
                window.cancelAnimationFrame(frame);
                frame = 0;
            }
            body.style.removeProperty(PROGRESS_PROPERTY);
            body.classList.remove(DRAGGING_CLASS);
            body.classList.remove(GESTURE_CLASS);
        };

        const abandon = () => {
            gesture = null;
            clearVisualState();
        };

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
                // panel is then held under the finger by the CSS property.
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

            scheduleProgress(gesture.progress);

            if (event.cancelable) event.preventDefault();
        };

        const onTouchEnd = () => {
            if (!gesture) return;

            const settled = gesture.dragging
                ? settleDrawerOpen({
                      progress: gesture.progress,
                      velocity: gesture.velocity,
                  })
                : gesture.startedOpen;

            // The property has to hold its settled value while the panel slides
            // home: dropping it here would snap the drawer back to fully open
            // for a frame before React took it away.
            if (frame) {
                window.cancelAnimationFrame(frame);
                frame = 0;
            }
            body.style.setProperty(PROGRESS_PROPERTY, settled ? "1" : "0");
            body.classList.remove(DRAGGING_CLASS);
            gesture = null;

            if (settled !== openRef.current) changeRef.current(settled);

            window.setTimeout(() => {
                if (gesture) return;
                body.style.removeProperty(PROGRESS_PROPERTY);
                body.classList.remove(GESTURE_CLASS);
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
            clearVisualState();
        };
    }, [enabled]);
}
