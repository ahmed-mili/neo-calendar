/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "./descriptionLinkShortcut";
import { applyLanguage } from "../i18n";
import {
    docOf,
    editorViewIn,
    selectIn,
    stubEditorLayout,
} from "./description/editorTestSupport";

beforeAll(stubEditorLayout);

function Harness({
    onWrite,
    initial = "",
}: {
    onWrite: (value: string) => void;
    initial?: string;
}) {
    const [description, setDescription] = React.useState(initial);
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

    describe("le curseur dans un lien", () => {
        const LINE =
            "- [ ] [XFX Mercury (799,99 €)](https://search.brave.com/search?q=XFX) fin";

        const ctrlK = (from: number, to = from) => {
            const view = editorViewIn(container);
            act(() => selectIn(view, from, to));
            act(() => {
                container
                    .querySelector(".nc-description-section")
                    ?.dispatchEvent(
                        new Event(OPEN_DESCRIPTION_LINK_DIALOG_EVENT)
                    );
            });
        };

        it("ouvre la fenêtre du lien, titre et adresse remplis", () => {
            const onWrite = jest.fn();
            act(() => {
                ReactDOM.render(
                    <Harness onWrite={onWrite} initial={LINE} />,
                    container
                );
            });
            // En plein milieu de l'adresse.
            ctrlK(LINE.indexOf("brave"));

            expect(
                document.querySelector(".nc-description-add-link-dialog")
            ).toBeNull();
            const dialog = document.querySelector(
                ".nc-description-inline-link-dialog"
            ) as HTMLElement;
            expect(dialog).toBeTruthy();
            const fields = dialog.querySelectorAll("input");
            expect((fields[0] as HTMLInputElement).value).toBe(
                "XFX Mercury (799,99 €)"
            );
            expect((fields[1] as HTMLInputElement).value).toBe(
                "https://search.brave.com/search?q=XFX"
            );
            expect(onWrite).not.toHaveBeenCalled();
        });

        it("ajoute un lien quand le curseur est contre lui, pas dedans", () => {
            act(() => {
                ReactDOM.render(
                    <Harness onWrite={jest.fn()} initial={LINE} />,
                    container
                );
            });
            ctrlK(LINE.indexOf(") fin") + 1);

            expect(
                document.querySelector(".nc-description-add-link-dialog")
            ).toBeTruthy();
            expect(
                document.querySelector(".nc-description-inline-link-dialog")
            ).toBeNull();
        });
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

        // The link is text in the editor; the caret sits right after it, so
        // its syntax shows (bounds included) until the caret moves away.
        const view = editorViewIn(container);
        expect(docOf(view)).toBe("[OpenAI](https://example.com/path)");
        expect(container.querySelector("textarea")).toBeNull();
        act(() => {
            view.dispatch({
                changes: { from: view.state.doc.length, insert: " fin" },
                selection: { anchor: view.state.doc.length + 4 },
            });
        });
        const written = container.querySelector(".nc-desc-link") as HTMLElement;
        expect(written).toBeTruthy();
        expect(written.textContent).toBe("OpenAI");

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
