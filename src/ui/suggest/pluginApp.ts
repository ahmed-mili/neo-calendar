import { App } from "obsidian";

/**
 * Lightweight access to the Obsidian `App` for UI helpers that live deep in the
 * React tree (e.g. the event panel) where prop-drilling `app` would be noisy.
 * Set once in the plugin's `onload`; always present while any UI is mounted.
 */
let pluginApp: App | null = null;

export function setPluginApp(app: App): void {
    pluginApp = app;
}

export function getPluginApp(): App {
    if (!pluginApp) {
        throw new Error(
            "Neo Calendar: app accessed before plugin onload set it."
        );
    }
    return pluginApp;
}
