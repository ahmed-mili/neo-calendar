/*
 * Which applications a release actually changed.
 *
 * Both packages are built from one repository, one commit, one workflow — but
 * most releases only move one of them. Rebuilding the Windows installer for an
 * Android-only fix costs twelve minutes of Rust and publishes a file identical
 * to the one before it, which tells whoever downloads it nothing.
 *
 * So the paths a release touched decide which packages it builds. One rule is
 * worth stating out loud because it is not what the folder names suggest:
 * `apps/windows/src` feeds BOTH applications. The Android shell renders the
 * Windows screens — `apps/android/src/main.tsx` imports `../../windows/src/App`
 * — so a change there is a change to the phone too. Only `src-tauri` and the
 * desktop's own build files belong to Windows alone.
 *
 * The version files are subtracted first. They change on every release because
 * a release happened, not because anything was built differently, so counting
 * them would make every release look like it touched everything — which is the
 * thing this is here to avoid. `set-version.mjs` owns that list.
 *
 * The cost of that subtraction, stated plainly: a release whose ONLY change is
 * inside `tauri.conf.json`, `Cargo.toml` or `build.gradle.kts` looks empty and
 * builds nothing. Those files carry real configuration as well as the version.
 * Such a release does not happen by itself — config changes travel with code —
 * but if one ever does, run the workflow by hand, which always builds both.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { VERSION_FILES } from "./set-version.mjs";

/** @typedef {{ android: boolean, windows: boolean }} ReleaseScope */

const IGNORED = new Set(VERSION_FILES);

/**
 * Which applications this one path belongs to.
 *
 * @param {string} path repository-relative, forward slashes
 * @returns {ReleaseScope}
 */
export function platformsForPath(path) {
    if (IGNORED.has(path)) return { android: false, windows: false };

    if (path.startsWith("apps/android/")) {
        return { android: true, windows: false };
    }

    // The screens are shared; everything else under apps/windows is the
    // desktop's own — its Rust side, its bundler config, its entry page.
    if (path.startsWith("apps/windows/")) {
        const shared = path.startsWith("apps/windows/src/");
        return { android: shared, windows: true };
    }

    // `src/`, the workflow, the root configuration: both, or unknown, and
    // unknown builds everything rather than quietly skipping something.
    return { android: true, windows: true };
}

/**
 * Which applications a set of changed paths adds up to.
 *
 * An empty list builds both: no paths means we could not work out what changed,
 * and a release that ships nothing is a worse failure than one that rebuilds
 * something unnecessarily.
 *
 * @param {readonly string[]} paths
 * @returns {ReleaseScope}
 */
export function platformsFor(paths) {
    if (!paths || paths.length === 0) return { android: true, windows: true };

    const scope = { android: false, windows: false };
    for (const path of paths) {
        const one = platformsForPath(path);
        scope.android ||= one.android;
        scope.windows ||= one.windows;
    }

    // Everything that changed was a version bump: nothing was really touched,
    // so there is nothing to build.
    return scope;
}

/** The `name=value` lines a GitHub job reads back as its outputs. */
export function asJobOutputs(scope) {
    return `android=${scope.android}\nwindows=${scope.windows}`;
}

/** Reads the changed paths on stdin, one per line, as `git diff --name-only`
    prints them. */
async function readPaths() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return chunks
        .join("")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    const paths = process.stdin.isTTY ? [] : await readPaths();
    process.stdout.write(asJobOutputs(platformsFor(paths)) + "\n");
}
