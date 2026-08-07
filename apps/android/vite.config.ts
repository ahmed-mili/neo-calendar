import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
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
