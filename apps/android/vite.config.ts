import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

import { version } from "./package.json";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/*
 * The version, baked in at build time.
 *
 * The settings show it at the foot of the page, where every app puts it: it is
 * the first thing anyone needs when something is wrong, and the only thing
 * nobody can read off the screen otherwise. Both apps define it because both
 * build the same settings page — leave it out of one and that build has an
 * undefined global in it.
 */

export default defineConfig({
    define: {
        __NEO_VERSION__: JSON.stringify(version),
    },
    plugins: [react()],
    publicDir: here("../windows/public"),
    base: "./",
    clearScreen: false,
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: [
            {
                find: /^src\//,
                replacement: `${here("../../src")}/`,
            },
            {
                find: "@tauri-apps/api/core",
                replacement: here("./src/platform/core.ts"),
            },
            {
                find: "@tauri-apps/api/path",
                replacement: here("./src/platform/path.ts"),
            },
            {
                find: "@tauri-apps/api/event",
                replacement: here("./src/platform/event.ts"),
            },
            {
                find: "@tauri-apps/plugin-dialog",
                replacement: here("./src/platform/dialog.ts"),
            },
            {
                find: "@tauri-apps/plugin-deep-link",
                replacement: here("./src/platform/deepLink.ts"),
            },
            {
                find: "@tauri-apps/plugin-store",
                replacement: here("./src/platform/store.ts"),
            },
            {
                find: "@tauri-apps/plugin-notification",
                replacement: here("./src/platform/notification.ts"),
            },
            {
                find: "obsidian",
                replacement: here("../windows/src/platform/obsidianShim.ts"),
            },
            {
                find: "../suggest/pluginApp",
                replacement: here("../windows/src/platform/desktopPluginApp.ts"),
            },
        ],
    },
    build: {
        target: "es2021",
        outDir: "dist",
        sourcemap: true,
    },
});
