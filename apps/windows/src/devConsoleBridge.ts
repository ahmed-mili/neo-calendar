import { invoke } from "@tauri-apps/api/core";

/**
 * Réexpédie console.log/warn/error et les erreurs non attrapées vers le
 * terminal Rust (`debug_log`), qui les imprime dans le même terminal que
 * `npm run dev` — lisible directement, sans ouvrir les DevTools ni faire de
 * capture d'écran. Dev uniquement : `debug_log` est un no-op en release, mais
 * autant ne pas patcher console.* dans le build livré.
 */
export function installDevConsoleBridge(): void {
    if (!import.meta.env.DEV) return;

    const send = (level: string, message: string) => {
        invoke("debug_log", { level, message }).catch(() => {});
    };

    const format = (args: unknown[]): string =>
        args
            .map((arg) => {
                if (typeof arg === "string") return arg;
                if (arg instanceof Error) return arg.stack ?? arg.message;
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            })
            .join(" ");

    (["log", "warn", "error"] as const).forEach((level) => {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            send(level, format(args));
        };
    });

    window.addEventListener("error", (event) => {
        send("error", `Uncaught: ${event.message}\n${event.error?.stack ?? ""}`);
    });
    window.addEventListener("unhandledrejection", (event) => {
        send("error", `Unhandled rejection: ${format([event.reason])}`);
    });
}
