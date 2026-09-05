import "../../windows/src/themes/wallpaperEffects";
import "./androidEmptyGridContextMenuGuard";
import "./androidDraftSelection";
import "./resizeObserverGuard";
import React from "react";
import ReactDOM from "react-dom";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "../../windows/src/themes/fonts.css";
import App from "../../windows/src/App";
import "../../windows/src/themes/catppuccin-mocha.css";
import "../../windows/src/themes/tokyo-night.css";
import "../../windows/src/themes/codex-themes.css";
import "../../../src/ui/calendar/Calendar.css";
import "../../windows/src/App.css";
import "./mobile.css";
import "./draftPreview.css";
import "./descriptionToolbar.css";
import "./androidDescriptionEditor";

/* NEO_ANDROID_RUNTIME_V3_START */
document.documentElement.classList.add("nc-platform-android");
document.documentElement.dataset.neoCalendarPlatform = "android";
document.body.classList.add("nc-platform-android");
console.info("[NeoAndroidV3] runtime classes ready");
/* NEO_ANDROID_RUNTIME_V3_END */

function showFatalError(error: unknown): void {
    const message =
        error instanceof Error
            ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}`
            : String(error);

    console.error("Neo Calendar Android fatal error", error);

    document.body.innerHTML = `
        <main style="box-sizing:border-box;min-height:100vh;padding:24px;background:#11111b;color:#cdd6f4;font-family:system-ui,sans-serif;overflow:auto">
            <h1 style="font-size:20px;margin:0 0 12px">Neo Calendar n’a pas pu démarrer</h1>
            <p style="line-height:1.5;color:#bac2de">Une erreur JavaScript a empêché l’affichage de l’application.</p>
            <pre style="white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;border-radius:12px;background:#1e1e2e;color:#f38ba8;font-size:12px;line-height:1.45">${message.replace(
                /[&<>"']/g,
                (character) =>
                    ({
                        "&": "&amp;",
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#039;",
                    }[character] ?? character)
            )}</pre>
        </main>`;
}

window.addEventListener("error", (event) =>
    showFatalError(event.error ?? event.message)
);
window.addEventListener("unhandledrejection", (event) =>
    showFatalError(event.reason)
);

/* The splash screen stays up until the calendar has its events, so the app
   never shows a bare wallpaper while it finishes loading. The shell gives up
   waiting on its own after a few seconds. */
window.addEventListener("neo-calendar-ready", () => {
    const shell = (
        window as Window & {
            NeoAndroid?: { interfaceReady?: () => void };
        }
    ).NeoAndroid;
    shell?.interfaceReady?.();
});

try {
    const root = document.getElementById("root");
    if (!root) throw new Error("Neo Calendar root missing");
    ReactDOM.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
        root
    );
} catch (error) {
    showFatalError(error);
}
