/*
 * How a release is named on the Releases page.
 *
 * Its number, and nothing else — the way the projects one actually installs
 * from do it. "Neo Calendar v1.9.0" repeated down a page says the name of the
 * repository fourteen times and the one thing that differs once.
 *
 * The exception is a release that carries only one of the two applications,
 * which happens whenever a version changed only one of them: it says which,
 * so the list stays readable without opening anything.
 *
 * The suffix looks like a semver pre-release identifier and is not one. This
 * is a display title; the git tag stays `v1.2.3`, and nothing here is ever
 * marked as a pre-release — a version published from this repository is a
 * version meant to be installed. There is no trial channel.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {string} tag e.g. "v1.14.0"
 * @param {readonly string[]} assetNames the files the release actually carries
 */
export function releaseTitle(tag, assetNames) {
    const names = assetNames ?? [];
    const android = names.some((name) => name.toLowerCase().endsWith(".apk"));
    const windows = names.some((name) => name.toLowerCase().endsWith(".exe"));

    // Both, or neither: nothing to qualify. A release with no packages at all
    // should not exist, and if one does its number is still its name.
    if (android === windows) return tag;
    return android ? `${tag}-android` : `${tag}-windows`;
}

const invokedScript = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : undefined;

if (invokedScript === import.meta.url) {
    const [tag] = process.argv.slice(2);
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const names = chunks
        .join("")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    process.stdout.write(releaseTitle(tag, names) + "\n");
}
