/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { EntryKind, PanelHeader } from "./EventPanelRows";
import { t } from "../i18n";

/**
 * Reproduce an Android tap through the native DOM event path rather than
 * calling the React handler directly. WebView dispatches pointer events and
 * then the compatibility click that activates a button.
 */
function androidTap(target: Element): void {
    act(() => {
        target.dispatchEvent(
            new Event("pointerdown", { bubbles: true, cancelable: true })
        );
        target.dispatchEvent(
            new Event("pointerup", { bubbles: true, cancelable: true })
        );
        target.dispatchEvent(
            new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                button: 0,
            })
        );
    });
}

describe("Android event panel kind selector", () => {
    afterEach(() => {
        document.documentElement.classList.remove("nc-platform-android");
        document.body.innerHTML = "";
    });

    it.each([false, true])(
        "switches Event -> Task -> Birthday -> Event by touch (draft=%s)",
        (isDraft) => {
            document.documentElement.classList.add("nc-platform-android");

            const host = document.createElement("div");
            const overlay = document.createElement("div");
            overlay.id = "nc-android-overlay-root";
            document.body.append(host, overlay);

            const onHeaderMouseDown = jest.fn();

            function Harness() {
                const [kind, setKind] = React.useState<EntryKind>("event");
                return (
                    <PanelHeader
                        isDraft={isDraft}
                        isTask={kind === "task"}
                        kind={kind}
                        setKind={setKind}
                        editable={true}
                        eventId={isDraft ? null : "event.md"}
                        menuOpen={false}
                        menuRef={React.createRef<HTMLDivElement>()}
                        headerRef={React.createRef<HTMLDivElement>()}
                        onHeaderMouseDown={onHeaderMouseDown}
                        onToggleMenu={() => {}}
                        onOpenFile={() => {}}
                        onDeleteClick={() => {}}
                        onClose={() => {}}
                    />
                );
            }

            act(() => ReactDOM.render(<Harness />, host));

            const trigger = () =>
                host.querySelector(
                    ".nc-panel-kind-trigger"
                ) as HTMLButtonElement;

            const choose = (
                kind: EntryKind,
                translatedLabel: "Event" | "Task" | "Birthday"
            ) => {
                androidTap(trigger());
                expect(trigger().getAttribute("aria-expanded")).toBe("true");

                const option = overlay.querySelector(
                    `.nc-panel-kind-option[data-kind='${kind}']`
                ) as HTMLButtonElement;
                expect(option).toBeTruthy();
                androidTap(option);

                expect(trigger().textContent).toContain(t(translatedLabel));
                expect(overlay.querySelector(".nc-panel-kind-menu")).toBeNull();
            };

            expect(trigger().textContent).toContain(t("Event"));
            expect(trigger().querySelector("svg")).toBeTruthy();

            choose("task", "Task");
            choose("birthday", "Birthday");
            choose("event", "Event");

            // Tapping the selector must not be interpreted as dragging the
            // bottom-sheet header underneath it.
            expect(onHeaderMouseDown).not.toHaveBeenCalled();
        }
    );
});
