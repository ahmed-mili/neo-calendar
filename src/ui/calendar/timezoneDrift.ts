/**
 * Ce que devient le calendrier quand le téléphone change de fuseau.
 *
 * On descend d'avion à Zurich : le système passe à Europe/Zurich, et toutes les
 * heures affichées glissent d'un cran sans prévenir. Un rendez-vous noté à 14 h
 * à Paris s'affiche à 15 h, et rien ne dit lequel des deux est le bon.
 *
 * Plutôt que de trancher à la place de la personne, on lui pose la question —
 * mais on gèle d'abord l'affichage sur le fuseau qu'elle connaissait, sans quoi
 * « Annuler » n'annulerait rien : la grille aurait déjà bougé.
 *
 * La comparaison porte sur les noms IANA (« Europe/Paris »), jamais sur les
 * décalages : l'heure d'été fait passer Paris de +01:00 à +02:00 deux fois par
 * an sans que l'on ait voyagé, et poser la question à chaque changement d'heure
 * serait une plaie.
 */

export interface TimezoneDriftInput {
    /** Le fuseau que le système annonce maintenant. */
    systemZone: string;
    /** Le fuseau où la grille est dessinée. Absent : celui du système. */
    primaryTimezone?: string;
    /** Le fuseau du système tel qu'on l'avait vu la dernière fois. */
    lastSeenSystemTimezone?: string;
}

export type TimezoneDrift =
    /** Rien à faire : le système n'a pas bougé depuis la dernière fois. */
    | { kind: "settled" }
    /** Le système a bougé, mais la grille montre déjà le bon fuseau. */
    | { kind: "remember"; systemZone: string }
    /** Le système a bougé sous les pieds de la grille : on demande. */
    | { kind: "ask"; from: string; to: string };

/** Ce que l'on écrit dans les réglages une fois la question tranchée. */
export interface TimezoneResolution {
    primaryTimezone: string;
    lastSeenSystemTimezone: string;
}

function isUsableZone(zone: string | undefined): zone is string {
    return typeof zone === "string" && zone.length > 0;
}

export function detectTimezoneDrift(input: TimezoneDriftInput): TimezoneDrift {
    const { systemZone, primaryTimezone, lastSeenSystemTimezone } = input;

    // Un système qui ne sait pas dire son fuseau ne prouve pas un voyage.
    if (!isUsableZone(systemZone)) {
        return { kind: "settled" };
    }

    // Premier lancement : on note où l'on se trouve, sans rien demander. La
    // question n'a de sens qu'entre un avant et un après.
    if (!isUsableZone(lastSeenSystemTimezone)) {
        return { kind: "remember", systemZone };
    }

    if (systemZone === lastSeenSystemTimezone) {
        return { kind: "settled" };
    }

    // Sans fuseau choisi, la grille suivait le système : elle montrait donc ce
    // que le système annonçait la dernière fois.
    const shown = isUsableZone(primaryTimezone)
        ? primaryTimezone
        : lastSeenSystemTimezone;

    // Quelqu'un qui avait épinglé Zurich avant de s'y rendre n'a pas à valider
    // son propre choix en arrivant.
    if (shown === systemZone) {
        return { kind: "remember", systemZone };
    }

    return { kind: "ask", from: shown, to: systemZone };
}

/**
 * L'affichage est gelé sur le fuseau connu le temps que la question soit
 * posée. C'est ce gel qui donne son sens à « Annuler » : sans lui, la grille
 * aurait déjà basculé et refuser ne ferait que la ramener en arrière après
 * coup.
 */
export function holdShownTimezone(drift: {
    from: string;
    to: string;
}): TimezoneResolution {
    return {
        primaryTimezone: drift.from,
        lastSeenSystemTimezone: drift.from,
    };
}

/** « Changer de fuseau horaire » : la grille adopte celui du système. */
export function acceptTimezoneChange(drift: {
    from: string;
    to: string;
}): TimezoneResolution {
    return {
        primaryTimezone: drift.to,
        lastSeenSystemTimezone: drift.to,
    };
}

/**
 * « Annuler » : la grille garde son fuseau, et l'on retient le nouveau fuseau
 * système pour ne pas reposer la même question à chaque réveil de
 * l'application. Repartir vers un troisième fuseau, en revanche, redemandera.
 */
export function declineTimezoneChange(drift: {
    from: string;
    to: string;
}): TimezoneResolution {
    return {
        primaryTimezone: drift.from,
        lastSeenSystemTimezone: drift.to,
    };
}

/**
 * Le fuseau du système, lu à l'instant.
 *
 * Volontairement pas une constante de module : celle-ci se figerait au
 * chargement, et l'application qui dort pendant le vol se réveillerait en
 * croyant être encore au départ.
 */
export function currentSystemTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
        return "";
    }
}
