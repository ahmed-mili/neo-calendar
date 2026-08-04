import { DesktopRoute, parseDesktopDeepLink } from "./deepLink";

export function selectLastDesktopRoute(
    urls: readonly string[],
    current: DesktopRoute | null
): DesktopRoute | null {
    return urls.reduce<DesktopRoute | null>(
        (route, url) => parseDesktopDeepLink(url) ?? route,
        current
    );
}
