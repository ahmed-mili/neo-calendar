import { RefObject, useEffect, useRef } from "react";

export const PANEL_SWIPE_CLOSE_THRESHOLD = 0.33;
export const PANEL_SWIPE_VELOCITY_THRESHOLD = 0.45;

const DIRECTION_LOCK_PX = 8;
const SETTLE_MS = 260;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

interface Gesture {
    startX: number;
    startY: number;
    startProgress: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    progress: number;
    dragging: boolean;
}

export function calendarPanelSwipeProgress({
    startProgress,
    startX,
    currentX,
    panelWidth,
}: {
    startProgress: number;
    startX: number;
    currentX: number;
    panelWidth: number;
}): number {
    if (panelWidth <= 0) return 0;
    return Math.min(
        1,
        Math.max(0, startProgress + (currentX - startX) / panelWidth)
    );
}

export function calendarPanelVisualProgress(
    panelRight: number,
    viewportWidth: number,
    panelWidth: number
): number {
    if (panelWidth <= 0) return 0;
    return Math.min(1, Math.max(0, (panelRight - viewportWidth) / panelWidth));
}

export function shouldCloseCalendarPanel({
    progress,
    velocity,
}: {
    progress: number;
    velocity: number;
}): boolean {
    if (velocity > PANEL_SWIPE_VELOCITY_THRESHOLD) return true;
    if (velocity < -PANEL_SWIPE_VELOCITY_THRESHOLD) return false;
    return progress > PANEL_SWIPE_CLOSE_THRESHOLD;
}

export interface CalendarPanelSwipeControls {
    requestBack: () => void;
}

/**
 * Makes the Android calendar-events panel follow a horizontal touch.
 *
 * React only receives the final back action. During the gesture, transform and
 * opacity are written directly to their already-composited elements, at most
 * once per animation frame, so a long event list is never re-rendered per pixel.
 */
export function useCalendarEventsPanelSwipe({
    enabled,
    open,
    panelRef,
    backdropRef,
    onBack,
}: {
    enabled: boolean;
    open: boolean;
    panelRef: RefObject<HTMLElement>;
    backdropRef: RefObject<HTMLElement>;
    onBack: () => void;
}): CalendarPanelSwipeControls {
    const openRef = useRef(open);
    const backRef = useRef(onBack);
    const requestBackRef = useRef<() => void>(() => undefined);

    openRef.current = open;
    backRef.current = onBack;

    useEffect(() => {
        if (!enabled || typeof document === "undefined") {
            requestBackRef.current = () => backRef.current();
            return;
        }

        let gesture: Gesture | null = null;
        let frame = 0;
        let pendingProgress = 0;
        let settleTimer = 0;

        const panelWidth = () =>
            panelRef.current?.getBoundingClientRect().width ||
            Math.min(window.innerWidth * 0.88, 360);

        const paint = (progress: number, width: number) => {
            const panel = panelRef.current;
            const backdrop = backdropRef.current;
            if (panel) {
                panel.style.transform =
                    "translate3d(" + progress * width + "px, 0, 0)";
            }
            if (backdrop) backdrop.style.opacity = String(1 - progress);
        };

        const cancelFrame = () => {
            if (!frame) return;
            window.cancelAnimationFrame(frame);
            frame = 0;
        };

        const release = () => {
            cancelFrame();
            const panel = panelRef.current;
            const backdrop = backdropRef.current;
            if (panel) {
                panel.style.transform = "";
                panel.style.transition = "";
            }
            if (backdrop) {
                backdrop.style.opacity = "";
                backdrop.style.transition = "";
            }
        };

        const freeze = () => {
            cancelFrame();
            const panel = panelRef.current;
            const width = panelWidth();
            const progress = panel
                ? calendarPanelVisualProgress(
                      panel.getBoundingClientRect().right,
                      window.innerWidth,
                      width
                  )
                : 0;

            if (panel) panel.style.transition = "none";
            if (backdropRef.current)
                backdropRef.current.style.transition = "none";
            paint(progress, width);
            if (panel) void panel.offsetWidth;
            return { progress, width };
        };

        const glide = (progress: number, width: number) => {
            const reduced =
                typeof window.matchMedia === "function" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const duration = reduced ? 0 : SETTLE_MS;
            const panel = panelRef.current;
            const backdrop = backdropRef.current;
            if (panel) {
                panel.style.transition =
                    "transform " + duration + "ms " + EASING;
            }
            if (backdrop) {
                backdrop.style.transition =
                    "opacity " + duration + "ms " + EASING;
            }
            paint(progress, width);
            return duration;
        };

        const clearSettle = () => {
            if (!settleTimer) return;
            window.clearTimeout(settleTimer);
            settleTimer = 0;
        };

        const settleOpen = () => {
            clearSettle();
            const { width } = freeze();
            const duration = glide(0, width);
            settleTimer = window.setTimeout(() => {
                settleTimer = 0;
                if (!gesture) release();
            }, duration);
        };

        const settleClosed = () => {
            gesture = null;
            clearSettle();
            const { width } = freeze();
            const duration = glide(1, width);
            settleTimer = window.setTimeout(() => {
                settleTimer = 0;
                backRef.current();
                // React 17 commits state updates from timers synchronously. The
                // next frame is still a safe boundary if that ever changes.
                window.requestAnimationFrame(release);
            }, duration);
        };

        requestBackRef.current = settleClosed;

        const cancelGesture = () => {
            if (!gesture) return;
            const wasDragging = gesture.dragging;
            gesture = null;
            if (wasDragging) settleOpen();
        };

        const schedule = (progress: number, width: number) => {
            pendingProgress = progress;
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                paint(pendingProgress, width);
            });
        };

        const onTouchStart = (event: TouchEvent) => {
            const panel = panelRef.current;
            if (
                !openRef.current ||
                !panel ||
                event.touches.length !== 1 ||
                !panel.contains(event.target as Node)
            ) {
                if (event.touches.length !== 1) cancelGesture();
                return;
            }

            const touch = event.touches[0];
            gesture = {
                startX: touch.clientX,
                startY: touch.clientY,
                startProgress: 0,
                lastX: touch.clientX,
                lastTime: event.timeStamp,
                velocity: 0,
                progress: 0,
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
                if (Math.abs(dy) > Math.abs(dx)) {
                    gesture = null;
                    return;
                }

                clearSettle();
                const frozen = freeze();
                // A leftward gesture belongs to event dragging while the panel
                // is fully open. It can only reverse a panel already settling.
                if (dx < 0 && frozen.progress === 0) {
                    gesture = null;
                    return;
                }

                gesture.startProgress = frozen.progress;
                gesture.progress = frozen.progress;
                gesture.startX = touch.clientX;
                gesture.lastX = touch.clientX;
                gesture.lastTime = event.timeStamp;
                gesture.velocity = 0;
                gesture.dragging = true;
            }

            const elapsed = event.timeStamp - gesture.lastTime;
            if (elapsed > 0) {
                gesture.velocity = (touch.clientX - gesture.lastX) / elapsed;
                gesture.lastX = touch.clientX;
                gesture.lastTime = event.timeStamp;
            }

            const width = panelWidth();
            gesture.progress = calendarPanelSwipeProgress({
                startProgress: gesture.startProgress,
                startX: gesture.startX,
                currentX: touch.clientX,
                panelWidth: width,
            });
            schedule(gesture.progress, width);
            if (event.cancelable) event.preventDefault();
        };

        const onTouchEnd = () => {
            if (!gesture) return;
            const wasDragging = gesture.dragging;
            const close = wasDragging
                ? shouldCloseCalendarPanel({
                      progress: gesture.progress,
                      velocity: gesture.velocity,
                  })
                : false;
            gesture = null;
            if (!wasDragging) return;
            if (close) settleClosed();
            else settleOpen();
        };

        document.addEventListener("touchstart", onTouchStart, {
            passive: true,
        });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd, { passive: true });
        document.addEventListener("touchcancel", cancelGesture, {
            passive: true,
        });

        return () => {
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", cancelGesture);
            clearSettle();
            release();
        };
    }, [enabled, panelRef, backdropRef]);

    return {
        requestBack: () => requestBackRef.current(),
    };
}
