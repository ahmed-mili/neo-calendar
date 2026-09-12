/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { applyLanguage } from "../i18n";

function Harness({
    initial,
    onWrite,
}: {
    initial: string;
    onWrite?: (value: string) => void;
}) {
    const [description, setDescription] = React.useState(initial);
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={(value) => {
                onWrite?.(value);
                setDescription(value);
            }}
            onCommit={() => {}}
            eventId="Calendrier/2026-09-12.md"
            vaults={[]}
            items={[]}
        />
    );
}

describe("l'aperçu vivant d'un marqueur de ligne", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });

    const render = (props: React.ComponentProps<typeof Harness>) => {
        act(() => {
            ReactDOM.render(<Harness {...props} />, container);
        });
    };

    /** Le champ où l'on écrit : celui de la ligne ouverte, ou le champ seul
     *  d'une description qui n'a encore ni marqueur ni lien. */
    const field = () =>
        container.querySelector(
            ".nc-panel-checklist-edit, .nc-panel-textarea"
        ) as HTMLTextAreaElement;

    /** Écrit dans ce champ comme une frappe le ferait, curseur à la fin. */
    const type = (value: string) => {
        const input = field();
        input.value = value;
        input.selectionStart = value.length;
        input.selectionEnd = value.length;
        act(() => Simulate.change(input));
    };

    /** Ouvre la ligne en cliquant sur ce qu'elle dit. */
    const openLine = () => {
        const line = container.querySelector(
            ".nc-panel-checklist-line, .nc-panel-checklist-text"
        );
        if (line instanceof HTMLElement) act(() => Simulate.click(line));
    };

    it("rend le tiret en puce dès qu'il est tapé", () => {
        render({ initial: "courses" });
        openLine();

        type("- courses");

        expect(
            container.querySelector(".nc-panel-checklist-bullet")
        ).toBeTruthy();
        // Le champ ne tient plus que ce qui suit la puce.
        expect(field().value).toBe("courses");
    });

    it("laisse le crochet en texte tant que la case n'est pas fermée", () => {
        render({ initial: "" });
        openLine();

        type("- [");

        expect(
            container.querySelector(".nc-panel-checklist-bullet")
        ).toBeTruthy();
        expect(
            container.querySelector(
                '.nc-panel-checklist-line [role="checkbox"]'
            )
        ).toBeNull();
        expect(field().value).toBe("[");
    });

    it("rend la case dès que le crochet se ferme", () => {
        render({ initial: "" });
        openLine();

        type("- [ ]");

        const box = container.querySelector(
            '.nc-panel-checklist-line [role="checkbox"]'
        ) as HTMLButtonElement;
        expect(box).toBeTruthy();
        expect(box.getAttribute("aria-checked")).toBe("false");
        expect(field().value).toBe("");
    });

    it("rouvre la case au retour arrière, curseur derrière le crochet", () => {
        render({ initial: "- [ ] courses" });
        openLine();

        const input = field();
        expect(input.value).toBe("courses");
        input.selectionStart = 0;
        input.selectionEnd = 0;
        act(() => Simulate.keyDown(input, { key: "Backspace" }));

        // La ligne montre ses caractères, la case n'est plus dessinée.
        const reopened = field();
        expect(reopened.value).toBe("- [ ] courses");
        expect(
            container.querySelector(
                '.nc-panel-checklist-line [role="checkbox"]'
            )
        ).toBeNull();
        expect(reopened.selectionStart).toBe(5);
    });

    it("rouvre la case à la flèche gauche, et la referme en repassant dans le titre", () => {
        render({ initial: "- [x] courses" });
        openLine();

        const input = field();
        input.selectionStart = 0;
        input.selectionEnd = 0;
        act(() => Simulate.keyDown(input, { key: "ArrowLeft" }));
        expect(field().value).toBe("- [x] courses");

        const reopened = field();
        reopened.selectionStart = 8;
        reopened.selectionEnd = 8;
        act(() => Simulate.select(reopened));

        expect(field().value).toBe("courses");
        expect(
            container.querySelector(
                '.nc-panel-checklist-line [role="checkbox"]'
            )
        ).toBeTruthy();
    });

    it("garde le marqueur rendu sur les lignes qu'on n'écrit pas", () => {
        render({ initial: "- [ ] une\n- deux" });

        expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(1);
        expect(
            container.querySelectorAll(".nc-panel-checklist-bullet")
        ).toHaveLength(1);
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
    });
});
