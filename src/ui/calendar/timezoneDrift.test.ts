import {
    acceptTimezoneChange,
    declineTimezoneChange,
    detectTimezoneDrift,
    holdShownTimezone,
} from "./timezoneDrift";

describe("le calendrier face à un fuseau qui change", () => {
    it("ne dit rien au premier lancement, il note seulement où l'on est", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Paris",
                lastSeenSystemTimezone: undefined,
            })
        ).toEqual({ kind: "remember", systemZone: "Europe/Paris" });
    });

    it("se tait tant que le système ne bouge pas", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Paris",
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({ kind: "settled" });
    });

    it("demande en arrivant dans un autre fuseau", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Zurich",
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({ kind: "ask", from: "Europe/Paris", to: "Europe/Zurich" });
    });

    // Sans fuseau choisi, la grille suivait le système : ce qu'elle montrait,
    // c'est ce que le système annonçait la dernière fois.
    it("part de ce que la grille montrait, pas d'un fuseau choisi absent", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Asia/Tokyo",
                primaryTimezone: undefined,
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({ kind: "ask", from: "Europe/Paris", to: "Asia/Tokyo" });
    });

    it("respecte le fuseau épinglé plutôt que le dernier fuseau système", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Zurich",
                primaryTimezone: "America/New_York",
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({
            kind: "ask",
            from: "America/New_York",
            to: "Europe/Zurich",
        });
    });

    // Quelqu'un qui travaille déjà à l'heure de Zurich n'a pas à valider son
    // propre choix en descendant de l'avion.
    it("ne demande rien quand la grille montre déjà le fuseau où l'on arrive", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Zurich",
                primaryTimezone: "Europe/Zurich",
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({ kind: "remember", systemZone: "Europe/Zurich" });
    });

    // Paris passe de +01:00 à +02:00 deux fois par an sans que personne n'ait
    // voyagé : comparer les noms IANA, et non les décalages, évite de poser la
    // question à chaque changement d'heure.
    it("ignore le passage à l'heure d'été", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Paris",
                primaryTimezone: "Europe/Paris",
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({ kind: "settled" });
    });

    it("ne conclut rien d'un système muet", () => {
        expect(
            detectTimezoneDrift({
                systemZone: "",
                lastSeenSystemTimezone: "Europe/Paris",
            })
        ).toEqual({ kind: "settled" });
    });
});

describe("une fois la question posée", () => {
    const drift = { from: "Europe/Paris", to: "Europe/Zurich" };

    // C'est ce gel qui donne son sens au refus : sans lui, la grille aurait
    // déjà basculé pendant que la question s'affiche.
    it("gèle l'affichage sur le fuseau connu le temps de répondre", () => {
        expect(holdShownTimezone(drift)).toEqual({
            primaryTimezone: "Europe/Paris",
            lastSeenSystemTimezone: "Europe/Paris",
        });
    });

    it("accepter fait adopter le fuseau du système", () => {
        expect(acceptTimezoneChange(drift)).toEqual({
            primaryTimezone: "Europe/Zurich",
            lastSeenSystemTimezone: "Europe/Zurich",
        });
    });

    it("refuser garde le fuseau affiché", () => {
        expect(declineTimezoneChange(drift).primaryTimezone).toBe(
            "Europe/Paris"
        );
    });

    // Retenir le fuseau refusé est ce qui empêche la question de revenir à
    // chaque réveil de l'application pendant tout le séjour.
    it("refuser ne fait pas reposer la question au réveil suivant", () => {
        const resolved = declineTimezoneChange(drift);

        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Zurich",
                primaryTimezone: resolved.primaryTimezone,
                lastSeenSystemTimezone: resolved.lastSeenSystemTimezone,
            })
        ).toEqual({ kind: "settled" });
    });

    it("mais repose la question en repartant vers un troisième fuseau", () => {
        const resolved = declineTimezoneChange(drift);

        expect(
            detectTimezoneDrift({
                systemZone: "Asia/Tokyo",
                primaryTimezone: resolved.primaryTimezone,
                lastSeenSystemTimezone: resolved.lastSeenSystemTimezone,
            })
        ).toEqual({ kind: "ask", from: "Europe/Paris", to: "Asia/Tokyo" });
    });

    it("accepter puis rentrer chez soi redemande, dans l'autre sens", () => {
        const resolved = acceptTimezoneChange(drift);

        expect(
            detectTimezoneDrift({
                systemZone: "Europe/Paris",
                primaryTimezone: resolved.primaryTimezone,
                lastSeenSystemTimezone: resolved.lastSeenSystemTimezone,
            })
        ).toEqual({ kind: "ask", from: "Europe/Zurich", to: "Europe/Paris" });
    });
});
