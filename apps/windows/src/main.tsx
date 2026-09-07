import React from "react";
import ReactDOM from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./themes/fonts.css";
import App from "./App";
import DesktopWindowShell from "./DesktopWindowShell";
import { createDesktopWindowActions } from "./platform/desktopWindow";
import { installDevConsoleBridge } from "./devConsoleBridge";

installDevConsoleBridge();
import "./themes/catppuccin-mocha.css";
import "./themes/tokyo-night.css";
import "./themes/codex-themes.css";
import "../../../src/ui/calendar/Calendar.css";
import "./desktopDescriptionShortcuts.css";
import "./desktopDescriptionEditor.css";
import "./desktopDescriptionShortcuts";
import "./desktopDescriptionEditor";
import "./App.css";
// After App.css: the shell owns the outermost frame and must win over it.
import "./DesktopWindowShell.css";

const root = document.getElementById("root");
if (!root) throw new Error("Neo Calendar root element is missing");

ReactDOM.render(
    <React.StrictMode>
        {/* The window has no native decorations: this shell draws them, so it
            wraps App rather than living inside it — a calendar crash must not
            take the close button with it. */}
        <DesktopWindowShell
            actions={createDesktopWindowActions(getCurrentWindow())}
        >
            <App />
        </DesktopWindowShell>
    </React.StrictMode>,
    root
);
