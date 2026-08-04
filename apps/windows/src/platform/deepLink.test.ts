import { parseDesktopDeepLink } from "./deepLink";

describe("parseDesktopDeepLink", () => {
    it("decodes a task route", () => {
        expect(parseDesktopDeepLink("neo-calendar://task/task%40home")).toEqual(
            {
                type: "task",
                taskId: "task@home",
            }
        );
    });

    it.each([
        "https://task/42",
        "neo-calendar://event/42",
        "neo-calendar://task/",
        "neo-calendar://task/a/b",
        "not a url",
    ])("rejects %s", (value) => {
        expect(parseDesktopDeepLink(value)).toBeNull();
    });
});
