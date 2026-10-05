/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { applyLanguage } from "../i18n";
import {
    docOf,
    editorViewIn,
    selectIn,
    stubEditorLayout,
    typeInto,
} from "./description/editorTestSupport";

beforeAll(stubEditorLayout);

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

/* What the old line-by-line rows protected: a marker written in the field is
   drawn as soon as it is complete, stays raw while it is being written, and the
   lines the caret is not on keep their drawn marker. */
describe("live preview of a line marker", () => {
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

    const render = (initial: string) => {
        act(() => {
            ReactDOM.render(<Harness initial={initial} />, container);
        });
        return editorViewIn(container);
    };
    const boxes = () => container.querySelectorAll(".nc-desc-checkbox");
    const bullets = () => container.querySelectorAll(".nc-desc-bullet");

    it("draws the dash as a bullet as soon as it is typed", () => {
        const view = render("");
        act(() => typeInto(view, "- courses"));
        expect(bullets()).toHaveLength(1);
        expect(docOf(view)).toBe("- courses");
    });

    it("leaves the bracket as text until the box is closed", () => {
        const view = render("");
        act(() => typeInto(view, "- ["));
        expect(boxes()).toHaveLength(0);
        expect(docOf(view)).toBe("- [");
    });

    it("draws the box once the marker is complete", () => {
        const view = render("");
        act(() => typeInto(view, "- [ ] "));
        expect(boxes()).toHaveLength(1);
        expect(boxes()[0].getAttribute("aria-checked")).toBe("false");
        expect(docOf(view)).toBe("- [ ] ");
    });

    it("shows the raw marker while the caret is inside it, the box otherwise", () => {
        const view = render("- [ ] courses");
        // Only a focused editor reveals anything.
        act(() => view.focus());
        act(() => selectIn(view, 7));
        expect(boxes()).toHaveLength(1);
        act(() => selectIn(view, 3));
        expect(boxes()).toHaveLength(0);
        expect(
            container.querySelector(".cm-content")?.textContent
        ).toContain("- [ ] courses");
        act(() => selectIn(view, 7));
        expect(boxes()).toHaveLength(1);
    });

    it("keeps the drawn marker on the lines being left alone", () => {
        const view = render("- [ ] une\n- deux\nfin");
        act(() => selectIn(view, "- [ ] une\n- deux\nfin".length));
        expect(boxes()).toHaveLength(1);
        expect(bullets()).toHaveLength(1);
        expect(container.querySelector("textarea")).toBeNull();
    });

    it("draws a checked task struck and muted", () => {
        const view = render("- [x] fait\nfin");
        act(() => selectIn(view, 14));
        expect(boxes()[0].getAttribute("aria-checked")).toBe("true");
        expect(container.querySelector(".nc-desc-done")).not.toBeNull();
    });
});
