/**
 * Ce que montre le contrôle de mise à jour, à un instant donné.
 *
 * La mise à jour se télécharge toute seule désormais : on ne demande plus à
 * quelqu'un d'aller la chercher, on lui dit qu'elle arrive, puis qu'elle est
 * là. Le contrôle n'a donc qu'une chose à dire à la fois — un compteur pendant
 * la descente, une proposition ensuite — et rien du tout le reste du temps.
 *
 * Rien du tout, vraiment : un contrôle qui affiche « à jour » est un contrôle
 * qu'il faut lire à chaque lancement pour apprendre qu'il ne s'est rien passé.
 */

/** L'état du contrôle, et le texte qu'il porte. */
export interface UpdateControlState {
    kind: "idle" | "downloading" | "ready";
    /** Le pourcentage, la version, ou rien quand il n'y a rien à écrire. */
    label: string | null;
}

/**
 * @param percent 0..100 pendant la descente, -1 quand la taille du fichier est
 * inconnue — le contrôle tourne alors plutôt que d'inventer un chiffre qui
 * resterait à 0 % et aurait l'air cassé —, `null` quand rien ne descend.
 * @param ready La version téléchargée et prête à poser, ou "" pour aucune.
 */
export function updateControlState({
    percent,
    ready,
}: {
    percent: number | null;
    ready: string;
}): UpdateControlState {
    /* Un téléchargement en cours l'emporte sur une version connue : les deux
       camps annoncent la version dès qu'ils l'ont TROUVÉE, bien avant de
       l'avoir descendue. Ce qui dit que c'est fini, c'est la fin du
       téléchargement (percent revenu à null), et non le compteur atteignant
       100 % — un fichier peut afficher 100 % pendant qu'on le vérifie. */
    if (percent !== null) {
        return { kind: "downloading", label: percent < 0 ? null : `${percent} %` };
    }
    if (!ready) return { kind: "idle", label: null };
    return { kind: "ready", label: ready };
}
