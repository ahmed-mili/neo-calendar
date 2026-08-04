/**
 * Ou poser un menu flottant ancre a un bouton (selecteur de vue, de calendrier,
 * de recurrence...).
 *
 * Les menus du panneau s'ouvraient TOUJOURS vers le bas, avec pour seule
 * protection un plancher de hauteur : `maxHeight = max(vh - top - 12, 140)`.
 * Ce plancher garantit une hauteur lisible mais ne repositionne rien — des que
 * le bouton descend sous `vh - 152`, le menu depasse le bas de l'ecran et ses
 * dernieres options deviennent inatteignables. Le cas se produit sur telephone
 * quand le clavier virtuel ampute la hauteur, et plus generalement des que le
 * bouton ancre est bas.
 *
 * La regle ici est celle de tous les menus deroulants : ouvrir vers le bas par
 * defaut, basculer vers le haut quand le bas ne peut pas offrir une hauteur
 * lisible et que le haut fait mieux.
 */

export interface FlyoutAnchor {
    /** Bord haut du bouton, en coordonnees viewport. */
    top: number;
    /** Bord bas du bouton, en coordonnees viewport. */
    bottom: number;
}

export interface FlyoutOptions {
    /** Espace entre le bouton et le menu. */
    gap: number;
    /** Marge minimale conservee contre le bord de l'ecran. */
    margin: number;
    /** En dessous de cette hauteur, le cote est juge inutilisable. */
    minHeight: number;
}

export interface FlyoutPlacement {
    /** Ancrage par le HAUT (menu sous le bouton), ou null. */
    top: number | null;
    /** Ancrage par le BAS (menu au-dessus du bouton), ou null. Exprime en
        distance depuis le bas du viewport, donc utilisable tel quel en CSS
        `bottom` — la hauteur du menu n'a pas besoin d'etre connue d'avance. */
    bottom: number | null;
    maxHeight: number;
    /** Cote retenu, pour les tests et le debogage. */
    side: "below" | "above";
}

export function placeFlyout(
    anchor: FlyoutAnchor,
    viewportHeight: number,
    opts: FlyoutOptions
): FlyoutPlacement {
    const { gap, margin, minHeight } = opts;

    const spaceBelow = viewportHeight - (anchor.bottom + gap) - margin;
    const spaceAbove = anchor.top - gap - margin;

    // On ne bascule que si le bas est vraiment trop court ET que le haut fait
    // mieux : a place egale, rester en dessous evite un menu qui saute d'un
    // cote a l'autre pour quelques pixels.
    const goAbove = spaceBelow < minHeight && spaceAbove > spaceBelow;

    if (goAbove) {
        return {
            top: null,
            bottom: viewportHeight - anchor.top + gap,
            // Jamais moins que le plancher : mieux vaut un menu qui defile
            // qu'un menu ecrase a quelques pixels.
            maxHeight: Math.max(spaceAbove, minHeight),
            side: "above",
        };
    }

    return {
        top: anchor.bottom + gap,
        bottom: null,
        maxHeight: Math.max(spaceBelow, minHeight),
        side: "below",
    };
}
