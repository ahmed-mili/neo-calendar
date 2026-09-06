/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DateTime } from "luxon";
import { TimezonePicker } from "./TimezonePicker";
import { TimezoneMenuContext } from "./TimezoneColumn";

describe("TimezonePicker pendant la navigation du calendrier", () => {
    let host: HTMLDivElement;
    let addTimezone: jest.Mock;
    let format: jest.SpyInstance;
    const winter = new Date(2026, 0, 15, 12);
    const summer = new Date(2026, 6, 15, 12);
    const supportedDescriptor = Object.getOwnPropertyDescriptor(
        Intl,
        "supportedValuesOf"
    );

    function render(referenceDate: Date, canAdd = true, recent: string[] = []) {
        act(() => {
            ReactDOM.render(
                <TimezoneMenuContext.Provider
                    value={{
                        labels: {},
                        primaryTimezone: "Europe/Paris",
                        recentTimezones: recent,
                        onRemoveRecent: jest.fn(),
                        onChange: jest.fn(),
                        onRename: jest.fn(),
                        onMakePrimary: jest.fn(),
                        onRemove: jest.fn(),
                        onChangeHome: jest.fn(),
                    }}
                >
                    <TimezonePicker
                        referenceDate={referenceDate}
                        onAddTimezone={canAdd ? addTimezone : undefined}
                    />
                </TimezoneMenuContext.Provider>,
                host
            );
        });
    }

    function open() {
        act(() => {
            Simulate.click(host.querySelector(".nc-tz-add")!);
        });
    }

    function options(): HTMLElement[] {
        return Array.from(document.querySelectorAll('[role="option"]'));
    }

    beforeEach(() => {
        host = document.createElement("div");
        document.body.append(host);
        addTimezone = jest.fn();
        Object.defineProperty(Intl, "supportedValuesOf", {
            configurable: true,
            value: () => ["UTC", "Europe/Paris", "America/New_York"],
        });
        format = jest.spyOn(DateTime.prototype, "toFormat");
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        jest.restoreAllMocks();
        if (supportedDescriptor) {
            Object.defineProperty(
                Intl,
                "supportedValuesOf",
                supportedDescriptor
            );
        } else {
            Reflect.deleteProperty(Intl, "supportedValuesOf");
        }
    });

    it("ne formate aucune liste fermée, même lorsque la date et les favoris changent", () => {
        render(winter);
        expect(host.querySelector(".nc-tz-primary")?.textContent).toBe("GMT+1");
        render(summer, true, ["America/New_York"]);
        expect(host.querySelector(".nc-tz-primary")?.textContent).toBe("GMT+2");
        expect(options()).toHaveLength(0);
        expect(format).not.toHaveBeenCalled();
    });

    it("construit la liste à l'ouverture avec la dernière date et les favoris en tête", () => {
        render(winter);
        render(summer, true, ["America/New_York"]);
        open();
        expect(options()).toHaveLength(3);
        expect(options()[0].textContent).toContain("New York");
        expect(options()[0].textContent).toContain("Recent");
        expect(
            options().find((el) => el.textContent?.includes("Paris"))
                ?.textContent
        ).toContain("GMT+02:00");
    });

    it("actualise les décalages si la date change pendant que la liste est ouverte", () => {
        render(winter);
        open();
        expect(options()[1].textContent).toContain("GMT+01:00");
        render(summer);
        expect(options()[1].textContent).toContain("GMT+02:00");
    });

    it("filtre sans reformater les fuseaux et ajoute le fuseau choisi", () => {
        render(winter);
        open();
        format.mockClear();
        act(() => {
            Simulate.change(document.querySelector("input")!, {
                target: { value: "paris" },
            } as unknown as React.SyntheticEvent);
        });
        expect(options()).toHaveLength(1);
        expect(format).not.toHaveBeenCalled();
        act(() => Simulate.click(options()[0]));
        expect(addTimezone).toHaveBeenCalledWith("Europe/Paris");
        expect(options()).toHaveLength(0);
        render(summer);
        expect(format).not.toHaveBeenCalled();
    });

    it.each(["escape", "blur", "toggle"])(
        "cesse les calculs après fermeture par %s et actualise à la réouverture",
        (close) => {
            render(winter);
            open();
            act(() => {
                const input = document.querySelector("input")!;
                if (close === "escape")
                    Simulate.keyDown(input, { key: "Escape" });
                else if (close === "blur") Simulate.blur(input);
                else Simulate.click(host.querySelector(".nc-tz-add")!);
            });
            format.mockClear();
            render(summer);
            expect(format).not.toHaveBeenCalled();
            expect(options()).toHaveLength(0);
            act(() =>
                Simulate.keyDown(host.querySelector(".nc-tz-add")!, {
                    key: "Enter",
                })
            );
            expect(options()[1].textContent).toContain("GMT+02:00");
        }
    );

    it("ne prépare aucune liste quand l'ajout n'est pas disponible", () => {
        render(winter, false);
        open();
        expect(options()).toHaveLength(0);
        expect(format).not.toHaveBeenCalled();
    });
});
