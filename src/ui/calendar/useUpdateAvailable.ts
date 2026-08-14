import * as React from "react";
import { UPDATE_EVENT, pendingUpdateVersion } from "./appUpdates";

/**
 * The version waiting to be installed, or "" when there is none.
 *
 * Read three ways, because none of them is enough alone. Once on mount, for the
 * check that finished before this component existed. On the shell's event, for
 * the check that finishes while it is on screen — the launch check is
 * asynchronous and usually lands after the first paint. And again whenever the
 * tab comes back to the front, which is when a phone returns from the
 * background and the WebView may have missed the event entirely.
 *
 * There is deliberately no polling loop: the answer only ever changes at those
 * three moments, and a timer would ask the bridge forever for a string it
 * already knows.
 */
export function useUpdateAvailable(): string {
    const [version, setVersion] = React.useState(pendingUpdateVersion);

    React.useEffect(() => {
        const read = () => setVersion(pendingUpdateVersion());
        read();
        window.addEventListener(UPDATE_EVENT, read);
        document.addEventListener("visibilitychange", read);
        return () => {
            window.removeEventListener(UPDATE_EVENT, read);
            document.removeEventListener("visibilitychange", read);
        };
    }, []);

    return version;
}
