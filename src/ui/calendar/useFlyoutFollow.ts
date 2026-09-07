import * as React from "react";

/**
 * Un menu reste collé au champ qui l'a ouvert.
 *
 * Les menus de la fiche sont portalisés hors d'elle et posés en coordonnées
 * d'écran, calculées une seule fois à l'ouverture. Sur téléphone la fiche, elle,
 * n'arrête pas de bouger : elle glisse vers son ancre en 300 ms, se traîne au
 * doigt, défile sous son propre contenu et rétrécit quand le clavier monte. Le
 * menu, lui, restait là où la ligne était — on l'a vu posé au milieu de la
 * grille, à des centaines de pixels de son champ.
 *
 * Aucun évènement ne raconte ces mouvements-là : une transition ne prévient pas
 * pendant qu'elle court, et un `transform` ne déclenche ni `scroll` ni
 * `resize`. Ce qui est observable, c'est la position du champ, et c'est donc
 * elle qu'on regarde — une mesure par image, tant que le menu est ouvert, et un
 * replacement seulement quand elle a changé. Rien ne tourne quand aucun menu
 * n'est ouvert.
 */
export function useFlyoutFollow(
    open: boolean,
    anchorRef: React.RefObject<HTMLElement | null>,
    place: () => void
): void {
    const placeRef = React.useRef(place);
    placeRef.current = place;

    React.useEffect(() => {
        if (!open) return;
        const element = anchorRef.current;
        if (!element || typeof requestAnimationFrame !== "function") return;

        let frame = 0;
        let last = "";

        const read = () => {
            const box = element.getBoundingClientRect();
            return [
                Math.round(box.top),
                Math.round(box.left),
                Math.round(box.width),
                Math.round(box.height),
            ].join(":");
        };

        // La position d'ouverture est déjà posée par l'appelant : on part d'elle
        // pour ne pas replacer le menu une fois de plus dès la première image.
        last = read();

        const watch = () => {
            const now = read();
            if (now !== last) {
                last = now;
                placeRef.current();
            }
            frame = requestAnimationFrame(watch);
        };

        frame = requestAnimationFrame(watch);
        return () => cancelAnimationFrame(frame);
    }, [open, anchorRef]);
}
