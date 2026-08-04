import { useEffect, useRef } from "react";

export const HORIZONTAL_DAY_THRESHOLD = 50;
export const VERTICAL_MONTH_THRESHOLD = 120;
const DEFAULT_IDLE_RESET_MS = 150;

type Axis = "horizontal" | "vertical";

interface Options {
    axis: Axis;
    threshold: number;
    onStep: (steps: number) => void;
    idleResetMs?: number;
    enabled?: boolean;
}

export function useWheelNavigation(
    ref: React.RefObject<HTMLElement>,
    opts: Options
): void {
    const { axis, threshold, onStep, idleResetMs, enabled } = opts;
    const onStepRef = useRef(onStep);
    onStepRef.current = onStep;

    useEffect(() => {
        if (enabled === false) return;
        const el = ref.current;
        if (!el) return;

        let accum = 0;
        let idleTimer: number | null = null;
        const resetDelay = idleResetMs ?? DEFAULT_IDLE_RESET_MS;

        const handler = (e: WheelEvent) => {
            const raw =
                axis === "horizontal"
                    ? e.deltaX !== 0
                        ? e.deltaX
                        : e.shiftKey
                        ? e.deltaY
                        : 0
                    : e.shiftKey || e.deltaX !== 0
                    ? 0
                    : e.deltaY;
            if (raw === 0) return;

            e.preventDefault();
            accum += raw;

            const steps = Math.trunc(accum / threshold);
            if (steps !== 0) {
                onStepRef.current(steps);
                accum -= steps * threshold;
            }

            if (idleTimer !== null) window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(() => {
                accum = 0;
                idleTimer = null;
            }, resetDelay);
        };

        el.addEventListener("wheel", handler, { passive: false });
        return () => {
            el.removeEventListener("wheel", handler);
            if (idleTimer !== null) window.clearTimeout(idleTimer);
        };
    }, [ref, axis, threshold, idleResetMs, enabled]);
}
