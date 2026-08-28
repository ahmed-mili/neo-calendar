/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";

function Harness({ initial = "" }: { initial?: string }) {
    const [description, setDescription] = React.useState(initial);
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId="Calendrier/2026-08-28.md"
            vaults={[]}
            items={[]}
            onPickAttachment={async () => {}}
        />
    );
}

describe("description toolbar keyboard editing", () => {
    let container: HTMLDivElement;
    let animationFrames: FrameRequestCallback[];
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        animationFrames = [];
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        };
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(container));
        container.remove();
        window.requestAnimationFrame = originalRequestAnimationFrame;
    });

    const flushAnimationFrames = () => {
        const callbacks = animationFrames.splice(0);
        act(() => callbacks.forEach((callback) => callback(0)));
    };

    it("keeps a real textarea focused when the checklist command changes renderer", () => {
        act(() => ReactDOM.render(<Harness />, container));

        const field = container.querySelector(
            "textarea[data-description-input='true']"
        ) as HTMLTextAreaElement;
        expect(field).toBeTruthy();
        act(() => field.focus());
        field.setSelectionRange(0, 0);

        const checklist = container.querySelector(
            "button[data-format-command='checklist']"
        ) as HTMLButtonElement;
        expect(checklist).toBeTruthy();
        act(() => {
            Simulate.mouseDown(checklist, { button: 0 });
            Simulate.click(checklist);
        });
        flushAnimationFrames();

        const editor = document.activeElement as HTMLTextAreaElement;
        expect(editor).toBeInstanceOf(HTMLTextAreaElement);
        expect(editor.classList.contains("nc-panel-checklist-edit")).toBe(true);

        act(() => Simulate.change(editor, { target: { value: "hello" } }));
        expect(editor.value).toBe("hello");

        act(() => Simulate.change(editor, { target: { value: "hell" } }));
        expect(editor.value).toBe("hell");
    });

    it("opens the checklist line for typing when formatting an existing checklist", () => {
        act(() => ReactDOM.render(<Harness initial="- [ ] Existing" />, container));
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();

        const bold = container.querySelector(
            "button[data-format-command='bold']"
        ) as HTMLButtonElement;
        act(() => {
            Simulate.mouseDown(bold, { button: 0 });
            Simulate.click(bold);
        });
        flushAnimationFrames();

        const editor = document.activeElement as HTMLTextAreaElement;
        expect(editor).toBeInstanceOf(HTMLTextAreaElement);
        expect(editor.classList.contains("nc-panel-checklist-edit")).toBe(true);
    });
});
