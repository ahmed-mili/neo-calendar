import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

import { version } from "./package.json";

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
    clearScreen: false,
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: [
            {
                find: "obsidian",
                replacement: fileURLToPath(
                    new URL("./src/platform/obsidianShim.ts", import.meta.url)
                ),
            },
            {
                // ShortcutsPanel imports the plugin-wide app singleton. The
                // standalone build supplies a desktop command catalogue so
                // opening the ? panel cannot throw and unmount the app.
                find: "../suggest/pluginApp",
                replacement: fileURLToPath(
                    new URL(
                        "./src/platform/desktopPluginApp.ts",
                        import.meta.url
                    )
                ),
            },
        ],
    },
    server: {
        port: 1420,
        strictPort: true,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
        target: "es2021",
        // Lightning CSS drops unprefixed backdrop-filter when the Safari
        // fallback follows it. Chromium needs the standard property in release.
        cssMinify: "esbuild",
        outDir: "dist",
        sourcemap: true,
    },
});
