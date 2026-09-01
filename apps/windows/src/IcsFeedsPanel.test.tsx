/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import IcsFeedsPanel, { formatLastIcsSync } from "./IcsFeedsPanel";
import type { IcsFeedSubscription } from "./platform/icsFeedPreferences";
import type { IcsRuntimeStateByFeed } from "./platform/icsSyncScheduler";
import { applyLanguage } from "../../../src/ui/i18n";

function feed(
    overrides: Partial<IcsFeedSubscription> = {}
): IcsFeedSubscription {
    return {
        id: "feed-1",
        calendarPath: "Cours",
        name: "Emploi du temps",
        url: "https://example.test/calendar.ics",
        active: true,
        ...overrides,
    };
}

describe("formatLastIcsSync", () => {
    it("renders the French success wording", () => {
        expect(formatLastIcsSync("2026-08-30T18:05:00")).toBe(
            "Dernière synchro. le 30/08/2026 à 18h05"
        );
    });
});

describe("IcsFeedsPanel", () => {
    let host: HTMLDivElement;
    const noop = () => {};
    const asyncNoop = () => {};

    const baseProps = () => ({
        open: true,
        calendarId: "cal-1",
        calendarName: "Cours",
        feeds: [] as IcsFeedSubscription[],
        runtimeStates: {} as IcsRuntimeStateByFeed,
        defaultRefreshMinutes: 60 as const,
        onClose: noop,
        onAdd: jest.fn(),
        onEdit: jest.fn(),
        onRemove: jest.fn(),
        onRefreshNow: jest.fn(),
        onApplyFrequencyToAll: jest.fn(),
    });

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-ics-panel")
            .forEach((node) => node.remove());
        applyLanguage("fr");
    });

    const render = (props: ReturnType<typeof baseProps>) => {
        act(() => {
            ReactDOM.render(React.createElement(IcsFeedsPanel, props), host);
        });
    };

    it("shows an empty state with no feeds", () => {
        render(baseProps());
        expect(document.body.textContent).toContain("Aucun lien ICS");
    });

    it("shows one source with its add button enabled", () => {
        const props = baseProps();
        props.feeds = [feed()];
        render(props);

        const nameInput = document.body.querySelector(
            "input.nc-ics-feed-row__name"
        ) as HTMLInputElement;
        expect(nameInput.value).toBe("Emploi du temps");
        const addButton = Array.from(
            document.body.querySelectorAll("button")
        ).find((button) => button.textContent?.includes("Ajouter un lien ICS"));
        expect(addButton).toBeTruthy();
        expect(addButton?.disabled).toBe(false);
    });

    it("disables adding once five feeds exist, with an explanation", () => {
        const props = baseProps();
        props.feeds = Array.from({ length: 5 }, (_, index) =>
            feed({ id: `feed-${index}`, name: `Flux ${index}` })
        );
        render(props);

        const addButton = Array.from(
            document.body.querySelectorAll("button")
        ).find((button) => button.textContent?.includes("Ajouter un lien ICS"));
        expect(addButton?.disabled).toBe(true);
        expect(document.body.textContent).toContain(
            "Ce calendrier a déjà le maximum de cinq liens ICS."
        );
    });

    it("rejects an invalid URL inline without calling onAdd", () => {
        const props = baseProps();
        render(props);

        const nameInput = document.body.querySelector(
            "input[name='ics-feed-name']"
        ) as HTMLInputElement;
        const urlInput = document.body.querySelector(
            "input[name='ics-feed-url']"
        ) as HTMLInputElement;
        const form = document.body.querySelector(
            ".nc-ics-panel__add-form"
        ) as HTMLFormElement;

        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )?.set;
            setter?.call(nameInput, "Mon flux");
            nameInput.dispatchEvent(new Event("input", { bubbles: true }));
            setter?.call(urlInput, "not-a-url");
            urlInput.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => {
            form.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true })
            );
        });

        expect(props.onAdd).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("n'est pas valide");
    });

    it("rejects a URL already used by another feed on the same calendar", () => {
        const props = baseProps();
        props.feeds = [feed({ url: "https://example.test/dup.ics" })];
        render(props);

        const nameInput = document.body.querySelector(
            "input[name='ics-feed-name']"
        ) as HTMLInputElement;
        const urlInput = document.body.querySelector(
            "input[name='ics-feed-url']"
        ) as HTMLInputElement;
        const form = document.body.querySelector(
            ".nc-ics-panel__add-form"
        ) as HTMLFormElement;

        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )?.set;
            setter?.call(nameInput, "Doublon");
            nameInput.dispatchEvent(new Event("input", { bubbles: true }));
            setter?.call(urlInput, "https://example.test/dup.ics");
            urlInput.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => {
            form.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true })
            );
        });

        expect(props.onAdd).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("déjà utilisé");
    });

    it("shows a loading state while a feed is syncing", () => {
        const props = baseProps() as ReturnType<typeof baseProps> & {
            syncingFeedIds: Set<string>;
        };
        props.feeds = [feed()];
        (props as any).syncingFeedIds = new Set(["feed-1"]);
        render(props);
        expect(document.body.textContent).toContain("Synchronisation…");
    });

    it("shows never-synced when a feed has no runtime state", () => {
        const props = baseProps();
        props.feeds = [feed()];
        render(props);
        expect(document.body.textContent).toContain("Jamais synchronisé");
    });

    it("shows the last-success wording after a successful sync", () => {
        const props = baseProps();
        props.feeds = [feed()];
        props.runtimeStates = {
            "feed-1": {
                lastAttemptAt: "2026-08-30T18:05:00",
                lastSuccessAt: "2026-08-30T18:05:00",
                knownEventCount: 3,
                missingCounts: {},
            },
        };
        render(props);
        expect(document.body.textContent).toContain(
            "Dernière synchro. le 30/08/2026 à 18h05"
        );
    });

    it("keeps the last success date visible next to an error", () => {
        const props = baseProps();
        props.feeds = [feed()];
        props.runtimeStates = {
            "feed-1": {
                lastAttemptAt: "2026-08-30T19:00:00",
                lastSuccessAt: "2026-08-30T18:05:00",
                lastError: "Réponse HTTP 500",
                knownEventCount: 3,
                missingCounts: {},
            },
        };
        render(props);
        expect(document.body.textContent).toContain("Réponse HTTP 500");
        expect(document.body.textContent).toContain(
            "Dernière synchro. le 30/08/2026 à 18h05"
        );
    });

    it("changes a feed's own refresh frequency", () => {
        const props = baseProps();
        props.feeds = [feed()];
        render(props);

        const select = document.body.querySelector(
            "select[name='ics-feed-frequency']"
        ) as HTMLSelectElement;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLSelectElement.prototype,
                "value"
            )?.set;
            setter?.call(select, "15");
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });

        expect(props.onEdit).toHaveBeenCalledWith("feed-1", {
            refreshMinutes: 15,
        });
    });

    it("always allows a manual refresh, regardless of due-state", () => {
        const props = baseProps();
        props.feeds = [feed()];
        render(props);

        const refreshButton = document.body.querySelector(
            "button[data-testid='ics-refresh-now']"
        ) as HTMLButtonElement;
        expect(refreshButton.disabled).toBe(false);
        act(() => refreshButton.click());
        expect(props.onRefreshNow).toHaveBeenCalledWith("feed-1");
    });

    it("removes a feed without offering to delete its notes", () => {
        const props = baseProps();
        props.feeds = [feed()];
        render(props);

        const removeButton = document.body.querySelector(
            "button[data-testid='ics-remove-feed']"
        ) as HTMLButtonElement;
        act(() => removeButton.click());

        expect(props.onRemove).toHaveBeenCalledWith("feed-1");
        expect(document.body.textContent).not.toMatch(/supprim.*note/i);
    });

    it("shows a summary once more than one feed exists", () => {
        const props = baseProps();
        props.feeds = [
            feed({ id: "feed-1", name: "Flux 1" }),
            feed({ id: "feed-2", name: "Flux 2" }),
        ];
        render(props);
        expect(document.body.textContent).toContain("2");
        expect(
            document.body.querySelector(".nc-ics-panel__summary")
        ).toBeTruthy();
    });

    it("applies a frequency to every link only after confirmation", async () => {
        const props = baseProps();
        props.feeds = [
            feed({ id: "feed-1", refreshMinutes: 15 }),
            feed({ id: "feed-2", refreshMinutes: 30 }),
        ];
        render(props);

        const applyButton = Array.from(
            document.body.querySelectorAll("button")
        ).find((button) =>
            button.textContent?.includes("Appliquer à tous les liens")
        ) as HTMLButtonElement;
        act(() => applyButton.click());

        // Not applied yet: a confirmation dialog stands between the click and
        // the action.
        expect(props.onApplyFrequencyToAll).not.toHaveBeenCalled();

        const confirmButton = Array.from(
            document.body.querySelectorAll(".nc-confirm-dialog footer button")
        ).find(
            (button) => !button.className.includes("cancel")
        ) as HTMLButtonElement;
        expect(confirmButton).toBeTruthy();
        await act(async () => {
            confirmButton.click();
            await Promise.resolve();
        });

        expect(props.onApplyFrequencyToAll).toHaveBeenCalledWith(60);
    });
});
