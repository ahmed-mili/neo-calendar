import { DesktopRoute } from "./deepLink";
import { selectLastDesktopRoute } from "./routeDelivery";

describe("selectLastDesktopRoute", () => {
    const current: DesktopRoute = { type: "task", taskId: "existing" };

    it("keeps the current route when every URL is invalid", () => {
        expect(
            selectLastDesktopRoute(
                ["https://example.com", "neo-calendar://event/ignored"],
                current
            )
        ).toBe(current);
    });

    it("returns the last valid task route", () => {
        expect(
            selectLastDesktopRoute(
                [
                    "neo-calendar://task/first",
                    "https://example.com",
                    "neo-calendar://task/test%40task",
                ],
                null
            )
        ).toEqual({ type: "task", taskId: "test@task" });
    });
});
