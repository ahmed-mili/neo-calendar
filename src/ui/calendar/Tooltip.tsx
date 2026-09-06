import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { isAndroidRuntime } from "./CalendarUtils";

/**
 * L'infobulle de l'application, en remplacement de l'attribut `title` natif.
 *
 * Une seule couche portee sur le <body> ecoute les survols de toute l'app, au
 * lieu d'un composant enveloppant chaque bouton : les declencheurs sont des
 * dizaines de boutons d'icone deja ecrits, et un attribut se pose sans toucher
 * a leur arbre ni a leurs propres gestionnaires de souris.
 *
 * Le texte accessible reste porte par le declencheur (`aria-label`) : cette
 * couche ne fait que le rendu visuel.
 */

/** Attribut a poser sur le declencheur ; sa valeur est le texte affiche. */
export const TOOLTIP_ATTR = "data-nc-tooltip";

const SELECTOR = `[${TOOLTIP_ATTR}]`;

/** Delai de survol avant apparition (convention des infobulles). */
export const TOOLTIP_DELAY_MS = 400;

/** Espace entre le declencheur et l'infobulle. */
const GAP = 6;
/** Marge minimale conservee contre les bords de l'ecran. */
const MARGIN = 8;

export interface TooltipRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface TooltipPlacement {
    left: number;
    top: number;
    side: "above" | "below";
}

/**
 * Au-dessus du declencheur par defaut, en dessous quand le haut manque de
 * place ; toujours centre horizontalement, et toujours dans l'ecran.
 */
export function placeTooltip(
    anchor: TooltipRect,
    tooltip: { width: number; height: number },
    viewport: { width: number; height: number }
): TooltipPlacement {
    const above = anchor.top - GAP - tooltip.height;
    const below = anchor.top + anchor.height + GAP;
    const side: "above" | "below" =
        above < MARGIN && below + tooltip.height <= viewport.height - MARGIN
            ? "below"
            : "above";

    const centered = anchor.left + anchor.width / 2 - tooltip.width / 2;
    const maxLeft = Math.max(MARGIN, viewport.width - tooltip.width - MARGIN);
    const left = Math.min(Math.max(centered, MARGIN), maxLeft);

    return {
        left,
        top: side === "above" ? Math.max(above, MARGIN) : below,
        side,
    };
}

interface Shown {
    label: string;
    anchor: TooltipRect;
}

export default function TooltipLayer() {
    const [shown, setShown] = useState<Shown | null>(null);
    const anchorRef = useRef<HTMLElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);

    const hide = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        anchorRef.current = null;
        setShown(null);
    }, []);

    const schedule = useCallback((element: HTMLElement, immediate: boolean) => {
        const label = element.getAttribute(TOOLTIP_ATTR);
        if (!label) return;
        if (anchorRef.current === element) return;
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        anchorRef.current = element;
        const reveal = () => {
            timerRef.current = null;
            // Le declencheur a pu disparaitre pendant le delai.
            if (!element.isConnected) return;
            const box = element.getBoundingClientRect();
            setShown({
                label,
                anchor: {
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                },
            });
        };
        if (immediate) reveal();
        else timerRef.current = setTimeout(reveal, TOOLTIP_DELAY_MS);
    }, []);

    useEffect(() => {
        // Sur telephone il n'y a pas de survol : la couche ne sert a rien et un
        // appui long ne doit pas faire apparaitre de bulle.
        if (isAndroidRuntime()) return;

        const onOver = (event: MouseEvent) => {
            const target = (event.target as Element | null)?.closest?.(
                SELECTOR
            ) as HTMLElement | null;
            if (target) schedule(target, false);
            else if (anchorRef.current) hide();
        };
        const onOut = (event: MouseEvent) => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const to = event.relatedTarget as Node | null;
            if (to && anchor.contains(to)) return;
            hide();
        };
        const onFocus = (event: FocusEvent) => {
            const target = (event.target as Element | null)?.closest?.(
                SELECTOR
            ) as HTMLElement | null;
            // Au clavier, l'infobulle accompagne le focus sans delai.
            if (target) schedule(target, true);
            else if (anchorRef.current) hide();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") hide();
        };

        document.addEventListener("mouseover", onOver, true);
        document.addEventListener("mouseout", onOut, true);
        document.addEventListener("focusin", onFocus);
        document.addEventListener("focusout", hide);
        document.addEventListener("keydown", onKey, true);
        // Un clic ouvre presque toujours autre chose par dessus : la bulle doit
        // partir avec le geste, pas rester accrochee au bouton relache.
        document.addEventListener("pointerdown", hide, true);
        window.addEventListener("scroll", hide, true);
        window.addEventListener("blur", hide);
        return () => {
            document.removeEventListener("mouseover", onOver, true);
            document.removeEventListener("mouseout", onOut, true);
            document.removeEventListener("focusin", onFocus);
            document.removeEventListener("focusout", hide);
            document.removeEventListener("keydown", onKey, true);
            document.removeEventListener("pointerdown", hide, true);
            window.removeEventListener("scroll", hide, true);
            window.removeEventListener("blur", hide);
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, [schedule, hide]);

    useLayoutEffect(() => {
        const bubble = bubbleRef.current;
        if (!bubble || !shown) return;
        const box = bubble.getBoundingClientRect();
        const place = placeTooltip(
            shown.anchor,
            { width: box.width, height: box.height },
            { width: window.innerWidth, height: window.innerHeight }
        );
        // Pose directe plutot qu'un second rendu : la mesure depend du rendu et
        // repasser par l'etat ferait clignoter la bulle a sa position brute.
        bubble.style.left = `${place.left}px`;
        bubble.style.top = `${place.top}px`;
        bubble.style.visibility = "visible";
    }, [shown]);

    if (!shown) return null;

    return ReactDOM.createPortal(
        <div
            ref={bubbleRef}
            className="nc-tooltip"
            role="tooltip"
            data-nc-popup-portal="true"
            style={{ visibility: "hidden" }}
        >
            {shown.label}
        </div>,
        document.body
    );
}
