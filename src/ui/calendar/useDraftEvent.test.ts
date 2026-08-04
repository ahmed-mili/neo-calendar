import { pickDraftCalendar } from "./useDraftEvent";

// L'ordre de la liste est celui des sources dans data.json, pas un ordre de
// preference : "Etudes" arrive avant le calendrier par defaut "Productivite".
const editables = () => [
    { id: "local::Etudes" },
    { id: "local::Productivite" },
    { id: "local::Perso" },
];

describe("pickDraftCalendar", () => {
    it("prefere le calendrier par defaut a l'ordre des sources", () => {
        expect(pickDraftCalendar(editables(), "local::Productivite")).toEqual({
            id: "local::Productivite",
        });
    });

    it("retombe sur le premier editable quand le defaut n'est pas editable", () => {
        // Calendrier par defaut en lecture seule (ICS, Google) : il n'est pas
        // dans la liste des editables.
        expect(pickDraftCalendar(editables(), "ical::https://x/y.ics")).toEqual(
            {
                id: "local::Etudes",
            }
        );
    });

    it("retombe sur le premier editable sans calendrier par defaut", () => {
        expect(pickDraftCalendar(editables(), undefined)).toEqual({
            id: "local::Etudes",
        });
    });

    it("renvoie null quand aucun calendrier n'est editable", () => {
        expect(pickDraftCalendar([], "local::Productivite")).toBeNull();
    });
});
