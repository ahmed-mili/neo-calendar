import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const configPath = path.join(
    repositoryRoot,
    "apps/windows/src-tauri/tauri.conf.json",
);

export const UPDATER_ENDPOINT =
    "https://github.com/ahmed-mili/neo-calendar/releases/latest/download/latest.json";

export function withUpdaterConfig(config, publicKey) {
    const pubkey = publicKey?.trim();
    if (!pubkey || pubkey.length < 40) {
        throw new Error(
            "TAURI_UPDATER_PUBLIC_KEY is missing or does not look like a public key.",
        );
    }

    return {
        ...config,
        bundle: {
            ...config.bundle,
            createUpdaterArtifacts: true,
        },
        plugins: {
            ...config.plugins,
            updater: {
                pubkey,
                endpoints: [UPDATER_ENDPOINT],
                windows: {
                    // Neo Calendar owns the update UI. `passive` would display
                    // a second Windows installer progress window on top of the
                    // in-app dialog; `quiet` performs the same signed install
                    // without that duplicate surface. Tauri still restarts the
                    // app after a successful Windows install by default.
                    installMode: "quiet",
                },
            },
        },
    };
}

export async function configureTauriUpdater() {
    const publicKey = await readFile(
        path.join(repositoryRoot, "apps/windows/src-tauri/updater-public.key"),
        "utf8",
    );
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const configured = withUpdaterConfig(config, publicKey);
    await writeFile(configPath, `${JSON.stringify(configured, null, 4)}\n`);
    return configPath;
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    configureTauriUpdater()
        .then((configuredPath) => console.log(configuredPath))
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
