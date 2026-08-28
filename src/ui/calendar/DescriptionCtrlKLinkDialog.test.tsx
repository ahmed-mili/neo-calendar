/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "./descriptionLinkShortcut";
import { applyLanguage } from "../i18n";

function Harness({
    onAddLink,
}: {
    onAddLink: (eventId: string, markdown: string) => Promise<void>;
}) {
    const [description, setDescription] = React.useState("");
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId="Calendrier/2026-08-28.md"
            vaults={[]}
            items={[]}
            onAddLink={onAddLink}
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
        act(() => ReactDOM.unmountComponentAtNode(container));
        container.remove();
        applyLanguage("fr");
    });

    it("opens the requested modal and saves a labelled web link", async () => {
        const onAddLink = jest.fn(async () => {});
        act(() => {
            ReactDOM.render(<Harness onAddLink={onAddLink} />, container);
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

        expect(onAddLink).toHaveBeenCalledWith(
            "Calendrier/2026-08-28.md",
            "[OpenAI](https://example.com/path)"
        );
        expect(
            document.querySelector(".nc-description-add-link-dialog")
        ).toBeNull();
    });
});
