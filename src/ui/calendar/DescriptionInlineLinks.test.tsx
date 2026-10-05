/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import {
    DescriptionSection,
    DescriptionLinkedItem,
} from "./DescriptionSection";
import { applyLanguage } from "../i18n";
import {
    docOf,
    editorViewIn,
    selectIn,
    stubEditorLayout,
} from "./description/editorTestSupport";

beforeAll(stubEditorLayout);

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

const LINK = "[Elgato](https://example.com/mic)";

describe("links written in the description", () => {
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
    const link = () => container.querySelector(".nc-desc-link") as HTMLElement;
    const press = (element: Element, button = 0) =>
        act(() => {
            element.dispatchEvent(
                new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    button,
                })
            );
        });
    const rightClick = (element: Element) =>
        act(() => {
            element.dispatchEvent(
                new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                })
            );
        });
    /** Right click, then the pencil of the small bar: the edit dialog. */
    const openEditDialog = () => {
        rightClick(link());
        const edit = document.querySelector(
            '.nc-description-inline-actions [aria-label="Modifier le lien"]'
        ) as HTMLButtonElement;
        act(() => Simulate.click(edit));
        return document.querySelector(
            ".nc-description-inline-link-dialog"
        ) as HTMLElement;
    };

    it("counts in the description instead of sitting above it", () => {
        render({ initial: LINK });
        expect(link().textContent).toBe("Elgato");
        // No empty field under the link offering to be filled in.
        expect(container.querySelector("textarea")).toBeNull();
        expect(container.textContent).not.toContain("Ajouter une description");
    });

    it("can be preceded by the round task box", () => {
        const onWrite = jest.fn();
        render({ initial: `- [ ] ${LINK}`, onWrite });

        const box = container.querySelector(
            ".nc-panel-checklist-checkbox"
        ) as HTMLButtonElement;
        expect(box).toBeTruthy();
        expect(box.getAttribute("role")).toBe("checkbox");
        expect(box.getAttribute("aria-checked")).toBe("false");
        expect(box.querySelector("svg")).toBeTruthy();
        expect(link().textContent).toBe("Elgato");

        press(box);
        expect(onWrite).toHaveBeenLastCalledWith(`- [x] ${LINK}`);
        expect(
            container
                .querySelector(".nc-panel-checklist-checkbox")
                ?.getAttribute("aria-checked")
        ).toBe("true");
    });

    it("opens with a single click", () => {
        const onOpenLink = jest.fn();
        render({ initial: LINK, onOpenLink });

        press(link());

        expect(onOpenLink).toHaveBeenCalledWith(
            expect.objectContaining({
                target: "https://example.com/mic",
                kind: "web",
            })
        );
    });

    it("gives its commands on a right click, and only then", () => {
        render({ initial: LINK });
        expect(
            document.querySelector(".nc-description-inline-actions")
        ).toBeNull();

        rightClick(link());

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

    /* Removed on purpose, Obsidian does neither: a click BESIDE a link used to
       open its dialog, and Backspace against it as well. */
    it("opens no dialog from a click beside it", () => {
        render({ initial: `${LINK} fin` });
        const view = editorViewIn(container);

        press(container.querySelector(".cm-line") as HTMLElement);
        act(() => selectIn(view, docOf(view).length));

        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(docOf(view)).toBe(`${LINK} fin`);
    });

    it("opens no dialog on Backspace against it, and edits the text instead", () => {
        render({ initial: LINK });
        const view = editorViewIn(container);
        act(() => view.focus());
        act(() => selectIn(view, LINK.length));

        act(() => {
            view.contentDOM.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Backspace",
                    bubbles: true,
                    cancelable: true,
                })
            );
        });

        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(docOf(view)).toBe(LINK.slice(0, -1));
    });

    it("opens its dialog from the small bar, with its name and address", () => {
        render({ initial: LINK });

        const dialog = openEditDialog();

        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain("Modifier le lien");
        const fields = dialog.querySelectorAll("input");
        expect((fields[0] as HTMLInputElement).value).toBe("Elgato");
        expect((fields[1] as HTMLInputElement).value).toBe(
            "https://example.com/mic"
        );
        // The text is not opened: no `[Elgato](...)` shows under the dialog.
        expect(link().textContent).toBe("Elgato");
    });

    it("keeps the link drawn after the cross closes the dialog", () => {
        render({ initial: LINK });
        const dialog = openEditDialog();
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
        expect(link().textContent).toBe("Elgato");
    });

    it("keeps the link drawn after Escape closes the dialog", () => {
        render({ initial: LINK });
        const dialog = openEditDialog();
        act(() => Simulate.keyDown(dialog, { key: "Escape" }));

        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(link().textContent).toBe("Elgato");
    });

    it("closes its dialog on a press outside it, not on a press inside", () => {
        render({ initial: LINK });
        const dialog = openEditDialog();
        const pointerdown = () => new Event("pointerdown", { bubbles: true });

        act(() => {
            dialog.querySelector("input")?.dispatchEvent(pointerdown());
        });
        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeTruthy();

        act(() => {
            document.body.dispatchEvent(pointerdown());
        });
        expect(
            document.querySelector(".nc-description-inline-link-dialog")
        ).toBeNull();
        expect(link().textContent).toBe("Elgato");
    });

    it("rewrites the link from its dialog", () => {
        const onWrite = jest.fn();
        render({ initial: LINK, onWrite });
        const dialog = openEditDialog();
        const [label, address] = Array.from(dialog.querySelectorAll("input"));

        act(() =>
            Simulate.change(label, { target: { value: "Micro" } as any })
        );
        act(() =>
            Simulate.change(address, {
                target: { value: "https://example.com/new" } as any,
            })
        );
        act(() =>
            Simulate.click(
                dialog.querySelector(
                    ".nc-description-link-confirm"
                ) as HTMLButtonElement
            )
        );

        expect(onWrite).toHaveBeenLastCalledWith(
            "[Micro](https://example.com/new)"
        );
        expect(docOf(editorViewIn(container))).toBe(
            "[Micro](https://example.com/new)"
        );
    });

    it("removes the link in one go from its dialog", () => {
        const onWrite = jest.fn();
        render({ initial: LINK, onWrite });
        const dialog = openEditDialog();

        act(() =>
            Simulate.click(
                dialog.querySelector(
                    ".nc-description-link-remove"
                ) as HTMLButtonElement
            )
        );

        expect(onWrite).toHaveBeenLastCalledWith("");
        expect(docOf(editorViewIn(container))).toBe("");
    });
});
