/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { applyLanguage } from "../i18n";

const NOTE = "- [ ] Micro (99 €)\n- [ ] Plateau (229 €)\nTotal : environ 328 €";

function Harness({ initial }: { initial: string }) {
    const [description, setDescription] = React.useState(initial);
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId="Calendrier/2026-09-12.md"
            vaults={[]}
            items={[]}
        />
    );
}

describe("Ctrl+A dans une description lue ligne par ligne", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        container = document.createElement("div");
        document.body.appendChild(container);
        act(() => {
            ReactDOM.render(<Harness initial={NOTE} />, container);
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });

    /** Ouvre la dernière ligne, celle de prose, et y appuie Ctrl+A. */
    const selectAll = () => {
        const lines = container.querySelectorAll(".nc-panel-checklist-text");
        act(() => Simulate.click(lines[lines.length - 1] as HTMLElement));
        const line = container.querySelector(
            ".nc-panel-checklist-edit"
        ) as HTMLTextAreaElement;
        expect(line).toBeTruthy();
        act(() => Simulate.keyDown(line, { key: "a", ctrlKey: true }));
    };

    it("sélectionne toute la description, pas la seule ligne ouverte", () => {
        selectAll();

        const whole = container.querySelector(
            ".nc-panel-textarea"
        ) as HTMLTextAreaElement;
        expect(whole).toBeTruthy();
        expect(whole.value).toBe(NOTE);
        expect(document.activeElement).toBe(whole);
        expect(whole.selectionStart).toBe(0);
        expect(whole.selectionEnd).toBe(NOTE.length);
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
    });

    it("rend les lignes rendues dès qu'on quitte le champ entier", () => {
        selectAll();
        const whole = container.querySelector(
            ".nc-panel-textarea"
        ) as HTMLTextAreaElement;
        act(() => Simulate.blur(whole));

        expect(container.querySelector(".nc-panel-textarea")).toBeNull();
        expect(
            container.querySelectorAll(".nc-panel-checklist-checkbox").length
        ).toBe(2);
    });

    it("remplace tout ce qui est sélectionné par ce qu'on tape", () => {
        selectAll();
        const whole = container.querySelector(
            ".nc-panel-textarea"
        ) as HTMLTextAreaElement;
        whole.value = "- [ ] repartir de zéro";
        whole.selectionStart = whole.selectionEnd = whole.value.length;
        act(() => Simulate.change(whole));
        act(() => Simulate.keyDown(whole, { key: "Escape" }));

        expect(container.querySelector(".nc-panel-textarea")).toBeNull();
        expect(
            container.querySelectorAll(".nc-panel-checklist-checkbox").length
        ).toBe(1);
        expect(container.textContent).toContain("repartir de zéro");
    });
});
