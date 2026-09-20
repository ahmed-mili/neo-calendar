/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import PrayerMosqueDialog from "./PrayerMosqueDialog";
import { PRAYER_TIMETABLES } from "../../../src/ui/calendar/prayerTimetables";
import { applyLanguage } from "../../../src/ui/i18n";

describe("PrayerMosqueDialog", () => {
    let host: HTMLDivElement;
    let chosen: Array<string | null>;

    beforeEach(() => {
        applyLanguage("fr");
        chosen = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-prayer-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (mosqueId: string | null = null) => {
        act(() => {
            ReactDOM.render(
                React.createElement(PrayerMosqueDialog, {
                    open: true,
                    calendarName: "الْإِسْلَامُ",
                    mosqueId,
                    reminderMinutes: [0],
                    jumua: null,
                    onClose: () => {},
                    onChoose: (id) => chosen.push(id),
                    onReminderChange: () => {},
                    onJumuaChange: () => {},
                }),
                host
            );
        });
    };

    const options = () =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        );

    it("offers every mosque, plus a way to follow none", () => {
        render();
        expect(options()).toHaveLength(PRAYER_TIMETABLES.length + 1);
        expect(options()[0].textContent).toContain("Aucun horaire");
        for (const timetable of PRAYER_TIMETABLES) {
            expect(document.body.textContent).toContain(timetable.name);
        }
    });

    /*
     * L'année que la table couvre est affichée parce qu'un calendrier importé
     * pour 2026 ne dira rien de 2027 : sans elle, une grille sans traits au
     * 1er janvier ressemblerait à une panne plutôt qu'à un PDF à réimporter.
     */
    it("says which year each timetable covers, and its Jumu'a sessions", () => {
        render();
        const first = PRAYER_TIMETABLES[0];
        const row = options().find((option) =>
            option.textContent?.includes(first.name)
        );
        expect(row?.textContent).toContain(String(first.year));
        expect(row?.textContent).toContain(first.jumua[0]);
    });

    it("marks the mosque already followed", () => {
        const id = PRAYER_TIMETABLES[1].id;
        render(id);
        const selected = options().filter(
            (option) => option.getAttribute("aria-checked") === "true"
        );
        expect(selected).toHaveLength(1);
        expect(selected[0].textContent).toContain(PRAYER_TIMETABLES[1].name);
    });

    it("hands back the chosen mosque, and null for none", () => {
        render();
        act(() => {
            options()[1].click();
        });
        expect(chosen).toEqual([PRAYER_TIMETABLES[0].id]);

        render(PRAYER_TIMETABLES[0].id);
        act(() => {
            options()[0].click();
        });
        expect(chosen).toEqual([PRAYER_TIMETABLES[0].id, null]);
    });

    it("says what the lines will be and how to see the whole day", () => {
        render();
        const hint = document.querySelector(".nc-prayer-dialog__hint");
        expect(hint?.textContent).toContain("prochaine prière");
        expect(hint?.textContent).toContain("P");
    });
});

/*
 * La couleur des traits se règle là où se choisit la mosquée.
 *
 * Elle suivait celle du calendrier sans qu'on puisse en décider, et un vert
 * foncé lisible dans une pastille se perd en trait de deux pixels sur un fond
 * d'écran. Tant que personne n'y touche, la couleur du calendrier reste la
 * réponse : le réglage ne s'invente pas une valeur par défaut à lui.
 */
describe("the colour of the prayer lines, in the dialog", () => {
    let host: HTMLDivElement;
    let colours: Array<string | null>;

    beforeEach(() => {
        applyLanguage("fr");
        colours = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-prayer-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (color: string | null) => {
        act(() => {
            ReactDOM.render(
                React.createElement(PrayerMosqueDialog, {
                    open: true,
                    calendarName: "الْإِسْلَامُ",
                    mosqueId: PRAYER_TIMETABLES[0].id,
                    color,
                    calendarColor: "#045d05",
                    reminderMinutes: [0],
                    jumua: null,
                    onClose: () => {},
                    onChoose: () => {},
                    onColorChange: (hex: string | null) => colours.push(hex),
                    onReminderChange: () => {},
                    onJumuaChange: () => {},
                }),
                host
            );
        });
    };

    const swatch = () =>
        document.querySelector<HTMLButtonElement>(".nc-prayer-dialog__swatch");
    const line = () =>
        document.querySelector<HTMLElement>(".nc-prayer-dialog__swatch-line");

    it("shows the calendar's own colour when none was chosen", () => {
        render(null);
        expect(line()?.style.background).toBe("rgb(4, 93, 5)");
    });

    it("shows the chosen colour once there is one", () => {
        render("#45d97a");
        expect(line()?.style.background).toBe("rgb(69, 217, 122)");
    });

    it("offers to go back to the calendar's colour, but only when it differs", () => {
        render(null);
        expect(document.querySelector(".nc-prayer-dialog__reset")).toBeNull();

        render("#45d97a");
        const reset = document.querySelector<HTMLButtonElement>(
            ".nc-prayer-dialog__reset"
        );
        expect(reset).not.toBeNull();
        act(() => {
            reset?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        // `null` et non la couleur du calendrier : on retire le reglage, on
        // ne fige pas une copie qui cesserait de suivre le calendrier.
        expect(colours).toEqual([null]);
    });

    it("keeps the dialog open when the colour is being picked", () => {
        // Choisir une couleur est un reglage qu'on ajuste en regardant le
        // resultat : refermer la fiche au premier clic obligerait a la rouvrir
        // a chaque essai.
        render("#45d97a");
        act(() => {
            swatch()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(document.querySelector(".nc-prayer-dialog")).not.toBeNull();
    });
});

/*
 * Le rappel des prières se règle là aussi : c'est le même sujet que la
 * mosquée et la couleur. Il n'existe que sur PC, le téléphone ayant son
 * application de mosquée pour ça.
 */
describe("the prayer reminder, in the dialog", () => {
    let host: HTMLDivElement;
    let picked: number[][];

    beforeEach(() => {
        applyLanguage("fr");
        picked = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-prayer-backdrop, .nc-choice-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (reminderMinutes: number[]) => {
        act(() => {
            ReactDOM.render(
                React.createElement(PrayerMosqueDialog, {
                    open: true,
                    calendarName: "Islam",
                    mosqueId: PRAYER_TIMETABLES[0].id,
                    color: null,
                    calendarColor: "#045d05",
                    reminderMinutes,
                    jumua: null,
                    onClose: () => {},
                    onChoose: () => {},
                    onColorChange: () => {},
                    onReminderChange: (minutes: number[]) =>
                        picked.push(minutes),
                    onJumuaChange: () => {},
                }),
                host
            );
        });
    };

    const row = () =>
        document.querySelector<HTMLButtonElement>(
            ".nc-prayer-dialog__reminder"
        );

    it("says what it is set to, in words", () => {
        render([0]);
        expect(row()?.textContent).toContain("Rappel");
        expect(row()?.textContent).toContain("À l'heure de la prière");

        render([0, 10]);
        expect(row()?.textContent).toContain("À l'heure de la prière");
        expect(row()?.textContent).toContain("10 minutes avant");

        render([]);
        expect(row()?.textContent).toContain("Aucun rappel");
    });

    it("opens the list of delays, and hands the choice back", () => {
        render([0]);
        act(() => {
            row()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const choice = Array.from(
            document.querySelectorAll<HTMLElement>('[role="checkbox"]')
        ).find((option) => option.textContent?.includes("10 minutes avant"));
        expect(choice).toBeDefined();
        act(() => {
            choice?.click();
        });
        expect(picked).toEqual([[0, 10]]);
        // La fiche de la mosquée reste ouverte derrière le choix.
        expect(document.querySelector(".nc-prayer-dialog")).not.toBeNull();
    });
});

/*
 * Les séances de Jumu'a se règlent là aussi, mais seulement quand une mosquée
 * est suivie : sans horaires, il n'y a pas de vendredi à corriger.
 */
describe("the Jumu'a sittings, in the dialog", () => {
    let host: HTMLDivElement;
    let picked: Array<string[] | null>;

    beforeEach(() => {
        applyLanguage("fr");
        picked = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-prayer-backdrop, .nc-choice-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (mosqueId: string | null, jumua: string[] | null) => {
        act(() => {
            ReactDOM.render(
                React.createElement(PrayerMosqueDialog, {
                    open: true,
                    calendarName: "Islam",
                    mosqueId,
                    color: null,
                    calendarColor: "#045d05",
                    reminderMinutes: [0],
                    jumua,
                    onClose: () => {},
                    onChoose: () => {},
                    onColorChange: () => {},
                    onReminderChange: () => {},
                    onJumuaChange: (times: string[] | null) =>
                        picked.push(times),
                }),
                host
            );
        });
    };

    const row = () =>
        document.querySelector<HTMLButtonElement>(".nc-prayer-dialog__jumua");

    it("is absent while no mosque is followed", () => {
        render(null, null);
        expect(row()).toBeNull();
    });

    it("shows the followed mosque's sittings until others are chosen", () => {
        const mosque = PRAYER_TIMETABLES[0];
        render(mosque.id, null);
        expect(row()?.textContent).toContain("Jumu'a");
        expect(row()?.textContent).toContain(mosque.jumua.join(" & "));

        render(mosque.id, ["13:45"]);
        expect(row()?.textContent).toContain("13:45");
        expect(row()?.textContent).not.toContain(mosque.jumua.join(" & "));
    });

    it("opens the sittings of every registered mosque, and hands the choice back", () => {
        const mosque = PRAYER_TIMETABLES[0];
        render(mosque.id, null);
        act(() => {
            row()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const choice = Array.from(
            document.querySelectorAll<HTMLElement>('[role="checkbox"]')
        ).find((option) => option.textContent?.includes("13:45"));
        expect(choice).toBeDefined();
        act(() => {
            choice?.click();
        });
        expect(picked).toEqual([[...mosque.jumua, "13:45"].sort()]);
        expect(document.querySelector(".nc-prayer-dialog")).not.toBeNull();
    });
});
