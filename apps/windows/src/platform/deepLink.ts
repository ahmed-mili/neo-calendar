export type DesktopRoute = { type: "task"; taskId: string };

export function parseDesktopDeepLink(url: string): DesktopRoute | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "neo-calendar:" || parsed.hostname !== "task") {
            return null;
        }

        const encoded = parsed.pathname.replace(/^\//, "");
        if (!encoded || encoded.includes("/")) return null;

        const taskId = decodeURIComponent(encoded);
        if (
            taskId.length > 256 ||
            taskId.trim().length === 0 ||
            /[\u0000-\u001f\u007f]/.test(taskId)
        ) {
            return null;
        }

        return { type: "task", taskId };
    } catch {
        return null;
    }
}
