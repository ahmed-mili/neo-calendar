/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import JumuaChoiceDialog from "./JumuaChoiceDialog";
import { applyLanguage, t } from "../../../src/ui/i18n";

/*
 * Les séances de Jumu'a d'un calendrier se choisissent parmi celles des
 * mosquées enregistrées : on suit les horaires d'une mosquée et l'on fait la
 * Jumu'a dans une autre. Tout décocher, c'est revenir à celles de la mosquée.
 */
describe("JumuaChoiceDialog", () => {
    let host: HTMLDivElement;
    let picked: Array<string[] | null>;

    const choices = [
        { time: "12:30", mosques: ["Alkitab wa Sunnah"] },
        { time: "13:00", mosques: ["Villejuif", "Kremlin-Bicêtre"] },
        { time: "13:45", mosques: ["Kremlin-Bicêtre"] },
    ];

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
            .querySelectorAll(".nc-choice-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (selected: string[], inherited: string[]) => {
        act(() => {
            ReactDOM.render(
                React.createElement(JumuaChoiceDialog, {
                    choices,
                    selected,
                    inherited,
                    onPick: (times: string[] | null) => picked.push(times),
                    onClose: () => {},
                }),
                host
            );
        });
    };

    const options = () =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="checkbox"]'));
    const optionNamed = (text: string) => {
        const found = options().find((o) => o.textContent?.includes(text));
        if (!found) throw new Error(`Ligne absente : ${text}`);
        return found;
    };

    it("offers every sitting once, naming its mosques", () => {
        render(["13:00"], ["13:00"]);
        expect(options()).toHaveLength(3);
        expect(optionNamed("13:00").textContent).toContain("Villejuif");
        expect(optionNamed("13:00").textContent).toContain("Kremlin-Bicêtre");
        expect(optionNamed("13:00").getAttribute("aria-checked")).toBe("true");
        expect(optionNamed("12:30").getAttribute("aria-checked")).toBe("false");
    });

    it("ticks another sitting without closing, keeping the list sorted", () => {
        render(["13:45"], ["13:00"]);
        act(() => {
            optionNamed("12:30").click();
        });
        expect(picked).toEqual([["12:30", "13:45"]]);
    });

    it("hands back null once the last sitting is unticked", () => {
        render(["13:45"], ["13:00"]);
        act(() => {
            optionNamed("13:45").click();
        });
        expect(picked).toEqual([null]);
    });

    it("says which sittings are the followed mosque's own", () => {
        render(["13:45"], ["13:00"]);
        expect(optionNamed("13:00").textContent).toContain(
            t("Followed mosque")
        );
        expect(optionNamed("13:45").textContent).not.toContain(
            t("Followed mosque")
        );
    });
});
