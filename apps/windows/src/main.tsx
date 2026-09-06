import React from "react";
import ReactDOM from "react-dom";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./themes/fonts.css";
import App from "./App";
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

const root = document.getElementById("root");
if (!root) throw new Error("Neo Calendar root element is missing");

ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    root
);
