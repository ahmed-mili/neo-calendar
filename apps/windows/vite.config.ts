import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
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
        outDir: "dist",
        sourcemap: true,
    },
});
