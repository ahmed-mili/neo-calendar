/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "./descriptionLinkShortcut";
import { applyLanguage } from "../i18n";

function Harness({ onWrite }: { onWrite: (value: string) => void }) {
    const [description, setDescription] = React.useState("");
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={(value) => {
                onWrite(value);
                setDescription(value);
            }}
            onCommit={() => {}}
            eventId="Calendrier/2026-08-28.md"
            vaults={[]}
            items={[]}
        />
    );
}

describe("Ctrl+K description link dialog", () => {
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
        applyLanguage("fr");
    });

    it("se referme d'un appui hors d'elle, pas d'un appui dedans", () => {
        act(() => {
            ReactDOM.render(<Harness onWrite={jest.fn()} />, container);
        });
        const section = container.querySelector(
            ".nc-description-section"
        ) as HTMLDivElement;
        act(() => {
            section.dispatchEvent(
                new Event(OPEN_DESCRIPTION_LINK_DIALOG_EVENT)
            );
        });
        const dialog = document.querySelector(
            ".nc-description-add-link-dialog"
        ) as HTMLDivElement;
        expect(dialog).toBeTruthy();
        const press = () => new Event("pointerdown", { bubbles: true });

        act(() => {
            dialog.querySelector("input")?.dispatchEvent(press());
        });
        expect(
            document.querySelector(".nc-description-add-link-dialog")
        ).toBeTruthy();

        act(() => {
            document.body.dispatchEvent(press());
        });
        expect(
            document.querySelector(".nc-description-add-link-dialog")
        ).toBeNull();
    });

    it("opens the requested modal and writes the link into the description", async () => {
        const onWrite = jest.fn();
        act(() => {
            ReactDOM.render(<Harness onWrite={onWrite} />, container);
        });

        const section = container.querySelector(
            ".nc-description-section"
        ) as HTMLDivElement;
        expect(section).toBeTruthy();

        act(() => {
            section.dispatchEvent(
                new Event(OPEN_DESCRIPTION_LINK_DIALOG_EVENT)
            );
        });

        const dialog = document.querySelector(
            ".nc-description-add-link-dialog"
        ) as HTMLDivElement;
        expect(dialog).toBeTruthy();
        expect(dialog.getAttribute("aria-label")).toBe("Ajouter un Lien");
        expect(dialog.textContent).toContain("Ajouter un Lien");
        expect(dialog.textContent).toContain("Confirmer");

        const label = dialog.querySelector(
            'input[aria-label="Texte"]'
        ) as HTMLInputElement;
        const target = dialog.querySelector(
            'input[aria-label="Lien"]'
        ) as HTMLInputElement;
        expect(label).toBeTruthy();
        expect(target).toBeTruthy();

        act(() => Simulate.change(label, { target: { value: "OpenAI" } }));
        act(() =>
            Simulate.change(target, {
                target: { value: "https://example.com/path" },
            })
        );

        const confirm = dialog.querySelector(
            ".nc-description-link-confirm"
        ) as HTMLButtonElement;
        await act(async () => {
            Simulate.click(confirm);
            await Promise.resolve();
        });

        expect(onWrite).toHaveBeenCalledWith(
            "[OpenAI](https://example.com/path)"
        );
        expect(
            document.querySelector(".nc-description-add-link-dialog")
        ).toBeNull();

        const written = container.querySelector(
            ".nc-description-inline-link"
        ) as HTMLElement;
        expect(written).toBeTruthy();
        expect(written.textContent).toBe("OpenAI");
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
        expect(container.querySelector(".nc-panel-textarea")).toBeNull();

        const editDialog = document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLDivElement;
        expect(editDialog).toBeTruthy();
        const fields = editDialog.querySelectorAll("input");
        expect((fields[0] as HTMLInputElement).value).toBe("OpenAI");
        expect((fields[1] as HTMLInputElement).value).toBe(
            "https://example.com/path"
        );
    });
});
