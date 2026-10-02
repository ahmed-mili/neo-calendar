#!/usr/bin/env node
/*
 * Pose le syncthing.exe officiel de la version épinglée là où Tauri l'attend
 * (`bundle.externalBin` : apps/windows/src-tauri/binaries/syncthing-x86_64-pc-windows-msvc.exe).
 *
 * Même méthode et mêmes épinglages que le moteur Android (apps/android/native/syncthing/version.env) :
 *   1. `sha256sum.txt.asc` de la release est vérifié par gpg avec la clé de release épinglée (empreinte
 *      FBA2E162F2F44657B38F0309E5665F9BD5970C47) : une signature absente, invalide ou d'une autre clé échoue ;
 *   2. le SHA-256 de l'archive doit être celui de ce fichier signé ET celui épinglé dans le dépôt ;
 *   3. le SHA-256 de l'exécutable extrait doit être celui épinglé.
 * Tout écart arrête le build. Sans réseau, un exécutable déjà posé et conforme à l'épinglage suffit.
 *
 *   node scripts/fetch-syncthing-windows.mjs      affiche le chemin du binaire sur la dernière ligne
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const syncthingDir = path.join(root, "apps", "android", "native", "syncthing");
export const SIDECAR = path.join(
    root,
    "apps",
    "windows",
    "src-tauri",
    "binaries",
    "syncthing-x86_64-pc-windows-msvc.exe"
);

/** Les lignes `CLÉ=valeur` de version.env. */
export function parsePins(text) {
    return Object.fromEntries(
        text
            .split(/\r?\n/)
            .filter((line) => /^[A-Z0-9_]+=/.test(line))
            .map((line) => [
                line.slice(0, line.indexOf("=")),
                line.slice(line.indexOf("=") + 1).trim(),
            ])
    );
}

export function sha256Hex(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

/** Le SHA-256 d'une archive dans un `sha256sum.txt` (« <hex>  <nom> » ou « <hex> *<nom> »). */
export function hashFromSums(sums, archiveName) {
    for (const line of sums.split(/\r?\n/)) {
        const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
        if (match && match[2] === archiveName) return match[1];
    }
    throw new Error(`${archiveName} est absent de sha256sum.txt`);
}

/**
 * Lit le statut machine de gpg (`--status-fd`) : la signature doit être valide ET faite par la clé épinglée.
 * Une mauvaise signature (BADSIG), une clé inconnue ou une autre empreinte échouent.
 */
export function assertSignedBy(statusText, fingerprint) {
    const lines = statusText.split(/\r?\n/);
    if (lines.some((line) => line.startsWith("[GNUPG:] BADSIG")))
        throw new Error("signature de sha256sum.txt INVALIDE");
    const valid = lines.filter((line) => line.startsWith("[GNUPG:] VALIDSIG"));
    if (!valid.some((line) => line.trim().split(/\s+/).pop() === fingerprint))
        throw new Error(
            "aucune signature valide de la clé de release épinglée"
        );
}

function gpgCommand() {
    const candidates = [
        process.env.GPG,
        "gpg",
        "C:\\Program Files\\Git\\usr\\bin\\gpg.exe",
        "C:\\Program Files (x86)\\GnuPG\\bin\\gpg.exe",
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0)
            return candidate;
    }
    throw new Error("gpg est introuvable (installer Git for Windows ou Gpg4win, ou définir GPG)");
}

/**
 * Vérifie `sha256sum.txt.asc` avec la clé épinglée et rend le texte signé. gpg tourne dans le dossier de travail avec
 * des chemins RELATIFS : le gpg de Git for Windows (MSYS) et celui de Gpg4win n'écrivent pas les chemins Windows
 * de la même façon, un chemin relatif se lit pareil des deux côtés.
 */
function verifiedSums(work, pins) {
    const gpg = gpgCommand();
    copyFileSync(path.join(syncthingDir, "release-key.asc"), path.join(work, "release-key.asc"));
    mkdirSync(path.join(work, "gnupg-home"), { recursive: true, mode: 0o700 });
    const run = (args) =>
        spawnSync(gpg, ["--batch", "--homedir", "gnupg-home", ...args], { cwd: work, encoding: "utf8" });
    const imported = run(["--import", "release-key.asc"]);
    if (imported.status !== 0) throw new Error(`import de la clé impossible : ${imported.stderr}`);
    const fingerprints = run(["--with-colons", "--list-keys"])
        .stdout.split(/\r?\n/)
        .filter((line) => line.startsWith("fpr:"))
        .map((line) => line.split(":")[9]);
    if (!fingerprints.includes(pins.SYNCTHING_KEY_FINGERPRINT))
        throw new Error("la clé release-key.asc n'a pas l'empreinte épinglée");
    const verified = run(["--status-fd", "1", "--output", "sha256sum.txt", "--decrypt", "sha256sum.txt.asc"]);
    assertSignedBy(verified.stdout, pins.SYNCTHING_KEY_FINGERPRINT);
    return readFileSync(path.join(work, "sha256sum.txt"), "utf8");
}

async function download(url, destination) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function extract(archive, folder) {
    // Windows 10 et suivants fournissent bsdtar, qui lit les .zip ; ailleurs, unzip.
    const windows = process.platform === "win32";
    const command = windows
        ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "unzip";
    const args = windows ? ["-xf", archive, "-C", folder] : ["-o", "-q", archive, "-d", folder];
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`extraction impossible : ${result.stderr}`);
}

export async function fetchSyncthingWindows() {
    const pins = parsePins(readFileSync(path.join(syncthingDir, "version.env"), "utf8"));
    const wantedExe = pins.SYNCTHING_WINDOWS_EXE_SHA256;
    if (existsSync(SIDECAR) && sha256Hex(readFileSync(SIDECAR)) === wantedExe) return SIDECAR;

    const version = pins.SYNCTHING_VERSION;
    const name = `syncthing-windows-amd64-${version}`;
    const archiveName = `${name}.zip`;
    const base = `https://github.com/syncthing/syncthing/releases/download/${version}`;
    const work = mkdtempSync(path.join(tmpdir(), "nc-syncthing-"));
    try {
        await download(`${base}/${archiveName}`, path.join(work, archiveName));
        await download(`${base}/sha256sum.txt.asc`, path.join(work, "sha256sum.txt.asc"));

        const signedHash = hashFromSums(verifiedSums(work, pins), archiveName);
        const archiveHash = sha256Hex(readFileSync(path.join(work, archiveName)));
        if (archiveHash !== signedHash)
            throw new Error(`SHA-256 de ${archiveName} différent de celui du fichier signé`);
        if (archiveHash !== pins.SYNCTHING_WINDOWS_ZIP_SHA256)
            throw new Error(`SHA-256 de ${archiveName} différent de l'épinglage du dépôt`);

        extract(path.join(work, archiveName), work);
        const exe = path.join(work, name, "syncthing.exe");
        if (sha256Hex(readFileSync(exe)) !== wantedExe)
            throw new Error("SHA-256 de syncthing.exe différent de l'épinglage du dépôt");

        mkdirSync(path.dirname(SIDECAR), { recursive: true });
        const temporary = `${SIDECAR}.neo-tmp`;
        writeFileSync(temporary, readFileSync(exe));
        renameSync(temporary, SIDECAR);
        return SIDECAR;
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    try {
        console.log(await fetchSyncthingWindows());
    } catch (error) {
        console.error(`ERREUR : ${error.message}`);
        process.exit(1);
    }
}
