import { readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const windowsAppDirectory = path.resolve(scriptDirectory, "..");

export function formatInstallerName(productName, version) {
    return `${productName.replaceAll(" ", "-")}-Setup-${version}.exe`;
}

export function signaturePath(installerPath) {
    return `${installerPath}.sig`;
}
export async function renameInstaller(appDirectory = windowsAppDirectory) {
    const tauriDirectory = path.join(appDirectory, "src-tauri");
    const configPath = path.join(tauriDirectory, "tauri.conf.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const installerDirectory = path.join(
        tauriDirectory,
        "target",
        "release",
        "bundle",
        "nsis",
    );
    const sourcePrefix = `${config.productName}_${config.version}_`;
    const candidates = (await readdir(installerDirectory)).filter(
        (filename) =>
            filename.startsWith(sourcePrefix) && filename.endsWith("-setup.exe"),
    );

    if (candidates.length !== 1) {
        throw new Error(
            `Expected one NSIS installer for ${config.productName} ${config.version}, found ${candidates.length}.`,
        );
    }

    const sourcePath = path.join(installerDirectory, candidates[0]);
    const targetPath = path.join(
        installerDirectory,
        formatInstallerName(config.productName, config.version),
    );

    await rm(targetPath, { force: true });
    await rename(sourcePath, targetPath);

    const sourceSignature = signaturePath(sourcePath);
    const targetSignature = signaturePath(targetPath);
    try {
        await rm(targetSignature, { force: true });
        await rename(sourceSignature, targetSignature);
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }

    return targetPath;
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    renameInstaller()
        .then((installerPath) => console.log(installerPath))
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
