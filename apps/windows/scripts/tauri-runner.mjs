import { spawnSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
} from "node:fs";
import { homedir } from "node:os";
import {
    basename,
    dirname,
    join,
    resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const forwardedArguments = process.argv.slice(2);

const shouldCopyBuild =
    forwardedArguments.length === 0 ||
    forwardedArguments[0] === "build";

const tauriArguments =
    forwardedArguments.length === 0
        ? ["build"]
        : forwardedArguments;

/*
 * On lance directement le script JavaScript de Tauri avec Node.
 * Cela évite l'erreur Windows spawnSync tauri.cmd EINVAL.
 */
const tauriCli = join(
    appDirectory,
    "node_modules",
    "@tauri-apps",
    "cli",
    "tauri.js"
);

if (!existsSync(tauriCli)) {
    console.error(
        `Tauri CLI introuvable : ${tauriCli}\n` +
        `Exécute d'abord : npm install`
    );
    process.exit(1);
}

console.log("\n=== Neo Calendar / Tauri ===\n");
console.log(`Commande : tauri ${tauriArguments.join(" ")}\n`);

const result = spawnSync(
    process.execPath,
    [tauriCli, ...tauriArguments],
    {
        cwd: appDirectory,
        stdio: "inherit",
        env: {
            ...process.env,

            // Limite la chauffe du processeur.
            // Mets "8" pour compiler plus vite.
            CARGO_BUILD_JOBS:
                process.env.CARGO_BUILD_JOBS ?? "4",
        },
    }
);

if (result.error) {
    console.error("\nErreur de lancement de Tauri :");
    console.error(result.error);
    process.exit(1);
}

if (result.status !== 0) {
    process.exit(result.status ?? 1);
}

/*
 * En mode dev, on ne copie aucun fichier.
 */
if (!shouldCopyBuild) {
    process.exit(0);
}

function findExecutables(directory, resultFiles = []) {
    if (!existsSync(directory)) {
        return resultFiles;
    }

    for (const entry of readdirSync(directory, {
        withFileTypes: true,
    })) {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            findExecutables(fullPath, resultFiles);
        } else if (
            entry.isFile() &&
            entry.name.toLowerCase().endsWith(".exe")
        ) {
            resultFiles.push(fullPath);
        }
    }

    return resultFiles;
}

const targetDirectory = join(
    appDirectory,
    "src-tauri",
    "target"
);

const executables = findExecutables(targetDirectory);

const installers = executables
    .filter((file) => {
        const normalized = file
            .replaceAll("\\", "/")
            .toLowerCase();

        return (
            normalized.includes("/release/bundle/nsis/") &&
            normalized.endsWith("-setup.exe")
        );
    })
    .sort(
        (a, b) =>
            statSync(b).mtimeMs -
            statSync(a).mtimeMs
    );

const rawExecutables = executables
    .filter((file) => {
        const normalized = file
            .replaceAll("\\", "/")
            .toLowerCase();

        return (
            normalized.includes("/release/") &&
            !normalized.includes("/bundle/") &&
            basename(file).toLowerCase() ===
                "neo-calendar.exe"
        );
    })
    .sort(
        (a, b) =>
            statSync(b).mtimeMs -
            statSync(a).mtimeMs
    );

const source =
    installers[0] ??
    rawExecutables[0];

if (!source) {
    console.error(
        "\nLa compilation a réussi, mais aucun fichier .exe n'a été trouvé."
    );
    process.exit(1);
}

const downloadsDirectory = join(
    homedir(),
    "Downloads"
);

mkdirSync(downloadsDirectory, {
    recursive: true,
});

const isInstaller = installers.includes(source);

const destination = join(
    downloadsDirectory,
    isInstaller
        ? "NeoCalendar-latest-setup.exe"
        : "NeoCalendar-latest.exe"
);

copyFileSync(source, destination);

console.log("\n==========================================");
console.log("Nouvel exécutable créé avec succès :");
console.log(destination);
console.log("==========================================\n");

if (process.platform === "win32") {
    spawnSync(
        "explorer.exe",
        ["/select,", destination],
        {
            stdio: "ignore",
        }
    );
}
