/** @jest-environment jsdom */
import {
    HOUR_HEIGHT_COMMAND_EVENT,
    requestHourHeight,
} from "./hourHeightCommands";

describe("requestHourHeight", () => {
    it("dispatches the exact command as the event detail", () => {
        const heard: string[] = [];
        const onCommand = (event: Event) =>
            heard.push((event as CustomEvent<string>).detail);
        window.addEventListener(HOUR_HEIGHT_COMMAND_EVENT, onCommand);

        requestHourHeight("increase");
        requestHourHeight("decrease");
        requestHourHeight("reset");

        window.removeEventListener(HOUR_HEIGHT_COMMAND_EVENT, onCommand);
        expect(heard).toEqual(["increase", "decrease", "reset"]);
    });
});
