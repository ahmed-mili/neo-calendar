/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import {
    DescriptionSection,
    DescriptionLinkedItem,
} from "./DescriptionSection";
import { applyLanguage } from "../i18n";

function Harness({
    initial,
    onWrite,
    onOpenLink,
}: {
    initial: string;
    onWrite?: (value: string) => void;
    onOpenLink?: (item: DescriptionLinkedItem) => void;
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
            onOpenLink={onOpenLink}
        />
    );
}

describe("les liens écrits dans la description", () => {
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

    it("compte dans la description plutôt que de se poser au-dessus d'elle", () => {
        render({ initial: "[Elgato](https://example.com/mic)" });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        expect(link).toBeTruthy();
        expect(link.textContent).toBe("Elgato");
        // Plus de champ vide sous le lien qui proposerait de le remplir.
        expect(container.querySelector(".nc-panel-textarea")).toBeNull();
        expect(container.textContent).not.toContain("Ajouter une description");
    });

    it("se laisse précéder de la case circulaire des tâches", () => {
        render({ initial: "- [ ] [Elgato](https://example.com/mic)" });

        const box = container.querySelector(
            ".nc-panel-checklist-checkbox"
        ) as HTMLButtonElement;
        expect(box).toBeTruthy();
        expect(box.getAttribute("role")).toBe("checkbox");
        expect(box.getAttribute("aria-checked")).toBe("false");
        expect(box.querySelector("svg")).toBeTruthy();
        expect(
            container.querySelector(".nc-description-inline-link")?.textContent
        ).toBe("Elgato");

        act(() => Simulate.click(box));
        expect(box.getAttribute("aria-checked")).toBe("true");
    });

    it("s'ouvre d'un seul clic", () => {
        const onOpenLink = jest.fn();
        render({ initial: "[Elgato](https://example.com/mic)", onOpenLink });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.click(link));

        expect(onOpenLink).toHaveBeenCalledWith(
            expect.objectContaining({
                target: "https://example.com/mic",
                kind: "web",
            })
        );
    });

    it("rend ses commandes au clic droit, et à lui seul", () => {
        render({ initial: "[Elgato](https://example.com/mic)" });
        expect(
            document.querySelector(".nc-description-inline-actions")
        ).toBeNull();

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.contextMenu(link));

        const actions = document.querySelector(
            ".nc-description-inline-actions"
        ) as HTMLElement;
        expect(actions).toBeTruthy();
        expect(
            actions.querySelector('[aria-label="Modifier le lien"]')
        ).toBeTruthy();
        expect(
            actions.querySelector('[aria-label="Copier le lien"]')
        ).toBeTruthy();
    });

    it("ouvre sa fenêtre d'un clic à côté de lui, sans montrer son markdown", () => {
        render({ initial: "[Elgato](https://example.com/mic)" });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.click(link.parentElement as HTMLElement));

        const dialog = document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLElement;
        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain("Modifier le lien");
        // La ligne n'est pas ouverte : pas de `[Elgato](…)` sous la fenêtre.
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
    });

    it("garde le lien rendu après fermeture par la croix", () => {
        render({ initial: "[Elgato](https://example.com/mic)" });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.click(link.parentElement as HTMLElement));
        const dialog = document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLElement;
        act(() =>
            Simulate.click(
                dialog.querySelector(
                    ".nc-description-link-dialog-close"
                ) as HTMLButtonElement
            )
        );

        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
        expect(
            container.querySelector(".nc-description-inline-link")?.textContent
        ).toBe("Elgato");
    });

    it("garde le lien rendu après fermeture par Échap", () => {
        render({ initial: "[Elgato](https://example.com/mic)" });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.click(link.parentElement as HTMLElement));
        const dialog = document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLElement;
        act(() => Simulate.keyDown(dialog, { key: "Escape" }));

        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
        expect(
            container.querySelector(".nc-description-inline-link")?.textContent
        ).toBe("Elgato");
    });

    it("referme sa fenêtre d'un appui hors d'elle, pas d'un appui dedans", () => {
        render({ initial: "[Elgato](https://example.com/mic)" });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.click(link.parentElement as HTMLElement));
        const dialog = document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLElement;
        const press = () => new Event("pointerdown", { bubbles: true });

        act(() => {
            dialog.querySelector("input")?.dispatchEvent(press());
        });
        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeTruthy();

        act(() => {
            document.body.dispatchEvent(press());
        });
        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
        expect(
            container.querySelector(".nc-description-inline-link")?.textContent
        ).toBe("Elgato");
    });

    it("retire le lien d'un coup depuis sa fenêtre", () => {
        const onWrite = jest.fn();
        render({ initial: "[Elgato](https://example.com/mic)", onWrite });

        const link = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        act(() => Simulate.click(link.parentElement as HTMLElement));

        const dialog = document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLElement;
        expect(dialog).toBeTruthy();

        const remove = dialog.querySelector(
            ".nc-description-link-remove"
        ) as HTMLButtonElement;
        act(() => Simulate.click(remove));

        expect(onWrite).toHaveBeenLastCalledWith("");
    });
});
