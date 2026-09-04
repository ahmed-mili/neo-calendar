import { useEffect, useRef } from "react";
import {
    clampHourHeight,
    currentHourHeight,
    restingHourHeight,
    setHourHeight,
} from "./calendarConstants";
import { scrollForAnchor } from "./useAxisLock";

/**
 * Ctrl + molette agrandit l'heure, sur PC.
 *
 * C'est le pincement du téléphone avec l'entrée d'une souris : le même nombre
 * bouge — la hauteur d'une heure, écrite sur la grille en `--nc-hour-height` —
 * et tout ce qui est mesuré en heures suit tout seul, sans qu'un rendu React
 * ait à passer sur les événements. Le reste de l'interface ne bouge pas : ce
 * n'est pas un zoom de page, c'est une échelle de temps.
 *
 * La molette nue est laissée tranquille. Elle fait défiler la grille depuis
 * toujours, et le navigateur le fait mieux que nous.
 *
 * Le geste est repris au navigateur par `preventDefault`. Ctrl + molette est sa
 * commande de zoom de page, et un zoom de page par-dessus celui-ci mettrait
 * l'interface entière à une échelle que rien n'a prévue. La fenêtre Tauri la
 * refuse déjà (`zoomHotkeysEnabled` est faux par défaut), mais la même grille
 * tourne dans un navigateur pendant `npm run dev`, où il faut le dire.
 */

/** Ce qu'un cran de molette multiplie la hauteur d'une heure. */
export const WHEEL_ZOOM_PER_NOTCH = 1.1;

/** Ce qu'un cran vaut en pixels, tel que Chromium l'envoie. */
export const WHEEL_NOTCH_PX = 100;

/** Une ligne, quand la molette compte en lignes plutôt qu'en pixels. */
export const WHEEL_LINE_PX = 16;

/** Une page, même chose. */
export const WHEEL_PAGE_PX = 400;

/**
 * Ce qu'un seul événement peut faire, au plus.
 *
 * Un pavé tactile lancé envoie des deltas sans commune mesure avec un cran de
 * souris, et rien n'en garantit l'ordre de grandeur. Sans plafond, un seul
 * événement pouvait traverser toute la plage d'un bout à l'autre : le zoom
 * n'aurait pas bougé, il aurait sauté.
 */
export const WHEEL_MAX_PX_PER_EVENT = 2 * WHEEL_NOTCH_PX;

/** Sans molette pendant ce temps, le geste est fini. */
export const WHEEL_ZOOM_IDLE_MS = 150;

/** Ce que l'événement demande, en pixels, borné à ce qu'une image peut porter. */
export function wheelPixels(deltaY: number, deltaMode: number): number {
    const px =
        deltaMode === 1
            ? deltaY * WHEEL_LINE_PX
            : deltaMode === 2
            ? deltaY * WHEEL_PAGE_PX
            : deltaY;
    return Math.max(
        -WHEEL_MAX_PX_PER_EVENT,
        Math.min(WHEEL_MAX_PX_PER_EVENT, px)
    );
}

/**
 * La hauteur d'heure après ce cran de molette.
 *
 * Multiplicatif, comme le pincement : un cran vers le haut puis un cran vers le
 * bas ramènent où l'on était, ce qu'une addition de pixels ne ferait pas.
 * Vers le haut la molette compte négativement, et vers le haut on agrandit.
 */
export function zoomedHourHeight(
    startHourHeight: number,
    deltaY: number,
    deltaMode = 0
): number {
    const px = wheelPixels(deltaY, deltaMode);
    return clampHourHeight(
        startHourHeight * WHEEL_ZOOM_PER_NOTCH ** (-px / WHEEL_NOTCH_PX)
    );
}

export interface WheelZoomOptions {
    /** Appelé dans l'image où l'échelle a changé, pour ce qui se mesure en
        pixels et qu'aucun rendu ne va rafraîchir. */
    onScaleChange?: () => void;
    /** Appelé une fois la molette arrêtée, pour ce qui n'est posé qu'au rendu —
        la bande des journées entières et ses barres. */
    onScaleSettled?: () => void;
}

export function useWheelZoom(
    ref: React.RefObject<HTMLElement>,
    hostRef: React.RefObject<HTMLElement>,
    enabled = true,
    options: WheelZoomOptions = {}
): void {
    // Lu à travers une ref, pour qu'un rappel qui change n'ait jamais à
    // déposer et reposer l'écoute au milieu d'un geste.
    const optionsRef = useRef(options);
    optionsRef.current = options;

    useEffect(() => {
        const element = ref.current;
        const host = hostRef.current;
        if (!enabled || !element || !host) return;

        /** L'heure du jour visée par le curseur, et où le curseur se tient sous
            le haut de la grille. C'est ce couple qui ne doit pas bouger. */
        let anchorHours = 0;
        let offsetY = 0;
        let frame = 0;
        let idle: number | null = null;

        /** Un nombre écrit, un défilement corrigé, une fois par image. */
        const draw = () => {
            frame = 0;
            const hourHeight = currentHourHeight();
            host.style.setProperty("--nc-hour-height", `${hourHeight}px`);

            // Relire la hauteur règle la mise en page que la ligne au-dessus
            // vient d'invalider — exprès, et une seule fois, parce que la
            // correction ci-dessous se mesure sur le jour neuf.
            element.scrollTop = scrollForAnchor(
                anchorHours,
                hourHeight,
                offsetY,
                element.scrollHeight - element.clientHeight
            );

            optionsRef.current.onScaleChange?.();
        };

        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();

            const hourHeight = currentHourHeight();
            const next = zoomedHourHeight(
                hourHeight,
                event.deltaY,
                event.deltaMode
            );
            if (next === hourHeight) return;

            // L'ancre n'est relevée qu'entre deux images. Pendant qu'une image
            // est en attente, le défilement n'a pas encore été corrigé : le
            // relire donnerait une heure visée fausse, et deux crans dans la
            // même image feraient dériver la grille sous le curseur.
            if (!frame) {
                offsetY = event.clientY - element.getBoundingClientRect().top;
                anchorHours = (element.scrollTop + offsetY) / hourHeight;
                frame = requestAnimationFrame(draw);
            }
            setHourHeight(next);

            if (idle !== null) window.clearTimeout(idle);
            idle = window.setTimeout(() => {
                idle = null;
                optionsRef.current.onScaleSettled?.();
            }, WHEEL_ZOOM_IDLE_MS);
        };

        element.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            element.removeEventListener("wheel", onWheel);
            if (frame) cancelAnimationFrame(frame);
            if (idle !== null) window.clearTimeout(idle);

            // La variable meurt avec la grille qui la portait ; le nombre que
            // le JavaScript garde, lui, survivrait. Les deux ont déjà divergé
            // une fois, et le jour visible était plus long que le jour logique,
            // avec des heures fantômes après minuit.
            host.style.removeProperty("--nc-hour-height");
            setHourHeight(restingHourHeight());
        };
    }, [ref, hostRef, enabled]);
}
