import { useEffect, useLayoutEffect, useRef } from "react";

const useRevealLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;
const EVENT_SURFACES =
    ".nc-event-block, .nc-month-event, .nc-list-event, .nc-cep-card, .nc-allday-hidden-count";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** One reveal per app mount, after the initial folder read, before its first paint. */
export function useStartupReveal(ready: boolean) {
    const ref = useRef<HTMLElement>(null);
    const started = useRef(false);
    const surfaces = useRef<{ element: HTMLElement; opacity: string }[]>([]);
    const animations = useRef(new Set<Animation>());

    useRevealLayoutEffect(() => {
        const main = ref.current;
        if (!main || started.current) return;

        if (surfaces.current.length === 0) {
            const windowRoot =
                main.closest<HTMLElement>(".nc-desktop-window-shell") ?? main;
            const wallpaper = document.getElementById(
                "nc-wallpaper-render-layer"
            );
            surfaces.current = [
                windowRoot,
                ...(wallpaper ? [wallpaper] : []),
            ].map((element) => ({ element, opacity: element.style.opacity }));
        }

        if (!ready) {
            for (const { element } of surfaces.current)
                element.style.opacity = "0";
            return;
        }

        started.current = true;
        for (const { element, opacity } of surfaces.current)
            element.style.opacity = opacity;
        if (window.matchMedia?.(REDUCED_MOTION).matches || !main.animate)
            return;

        const reveal = (element: HTMLElement, duration: number) => {
            // The empty endpoint uses the underlying CSS opacity, including
            // dimmed calendars. No forwards fill can override later UI states.
            const animation = element.animate([{ opacity: 0 }, {}], {
                duration,
                easing: "ease-out",
            });
            animations.current.add(animation);
            animation.onfinish = () => {
                animations.current.delete(animation);
                animation.cancel();
            };
        };
        for (const { element } of surfaces.current) reveal(element, 500);
        // Snapshot only the events present at launch: scrolling, syncing and
        // switching views must never restart an entrance animation.
        main.querySelectorAll<HTMLElement>(EVENT_SURFACES).forEach((element) =>
            reveal(element, 950)
        );
    }, [ready]);

    useEffect(() => {
        const media = window.matchMedia?.(REDUCED_MOTION);
        const cancel = () => {
            animations.current.forEach((animation) => animation.cancel());
            animations.current.clear();
        };
        const onMotionChange = () => {
            if (media?.matches) cancel();
        };
        media?.addEventListener?.("change", onMotionChange);
        return () => {
            media?.removeEventListener?.("change", onMotionChange);
            cancel();
            for (const { element, opacity } of surfaces.current)
                element.style.opacity = opacity;
        };
    }, []);

    return ref;
}
