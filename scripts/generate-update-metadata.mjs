import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "ahmed-mili";
const REPOSITORY = "neo-calendar";

export function releaseAssetUrl(tag, filename) {
    return `https://github.com/${OWNER}/${REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
}

export function createMetadata({ version, versionCode, tag, android, windows }) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid release version.");
    if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error("Invalid Android versionCode.");
    if (!/^[0-9a-f]{64}$/.test(android.sha256)) throw new Error("Invalid Android SHA-256.");
    if (!windows.signature.trim()) throw new Error("Missing Tauri updater signature.");

    return {
        android: {
            version,
            versionCode,
            url: releaseAssetUrl(tag, android.filename),
            sha256: android.sha256,
        },
        desktop: {
            version,
            platforms: {
                "windows-x86_64": {
                    signature: windows.signature.trim(),
                    url: releaseAssetUrl(tag, windows.filename),
                },
            },
        },
    };
}

export async function generateUpdateMetadata(androidPath, windowsPath, signaturePath, outputDirectory, tag) {
    const packageManifest = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
    const gradle = await readFile(path.join(repositoryRoot, "apps/android/native/app/build.gradle.kts"), "utf8");
    const versionCode = Number(gradle.match(/versionCode = (\d+)/)?.[1]);
    const apk = await readFile(androidPath);
    const signature = await readFile(signaturePath, "utf8");
    const metadata = createMetadata({
        version: packageManifest.version,
        versionCode,
        tag,
        android: {
            filename: path.basename(androidPath),
            sha256: createHash("sha256").update(apk).digest("hex"),
        },
        windows: {
            filename: path.basename(windowsPath),
            signature,
        },
    });

    await writeFile(path.join(outputDirectory, "latest-android.json"), `${JSON.stringify(metadata.android, null, 2)}\n`);
    await writeFile(path.join(outputDirectory, "latest.json"), `${JSON.stringify(metadata.desktop, null, 2)}\n`);
    return metadata;
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedScript === import.meta.url) {
    const [androidPath, windowsPath, signaturePath, outputDirectory, tag] = process.argv.slice(2);
    generateUpdateMetadata(androidPath, windowsPath, signaturePath, outputDirectory, tag)
        .catch((error) => { console.error(error.message); process.exitCode = 1; });
}