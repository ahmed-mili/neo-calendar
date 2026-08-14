import { mergeRemoteEvents } from "./mergeRemoteEvents";

const record = (id: string, calendarId: string) => ({ id, calendarId });

describe("un abonnement distant qui arrive après coup", () => {
    it("remplace ses propres événements", () => {
        const merged = mergeRemoteEvents(
            [record("a1", "feriés"), record("a2", "feriés")],
            ["feriés"],
            [record("b1", "feriés")]
        );

        expect(merged.map((item) => item.id)).toEqual(["b1"]);
    });

    // Le calendrier reste utilisable pendant que le réseau traîne : ce qu'on y
    // écrit entre-temps ne doit pas disparaître quand le flux se pose.
    it("ne touche pas aux événements locaux", () => {
        const merged = mergeRemoteEvents(
            [record("local", "perso"), record("vieux", "feriés")],
            ["feriés"],
            [record("neuf", "feriés")]
        );

        expect(merged.map((item) => item.id)).toEqual(["local", "neuf"]);
    });

    // Un flux injoignable ne fait pas disparaître les autres.
    it("laisse en place un abonnement qui n'était pas du lot", () => {
        const merged = mergeRemoteEvents(
            [record("x", "sport"), record("y", "feriés")],
            ["feriés"],
            []
        );

        expect(merged.map((item) => item.id)).toEqual(["x"]);
    });

    it("n'enlève rien quand aucun abonnement n'est rafraîchi", () => {
        const current = [record("x", "sport"), record("y", "feriés")];

        expect(mergeRemoteEvents(current, [], [])).toEqual(current);
    });
});
