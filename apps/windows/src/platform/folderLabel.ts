/**
 * A folder path, as a person would name it.
 *
 * Android hands back a document-tree URI rather than a path, and it is not
 * meant to be read:
 *
 *     content://com.android.externalstorage.documents/tree/primary%3ANeo%20Calendar
 *
 * Taking the last segment of that gives `primary%3ANeo%20Calendar`, which is
 * what the add-calendar dialog was showing. Two things are in the way: the
 * segment is percent-encoded, and it carries the storage volume (`primary:`)
 * in front of the name. Both are plumbing.
 */
export function folderDisplayName(path: string): string {
    const last = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
    if (!last) return path;

    let decoded = last;
    try {
        decoded = decodeURIComponent(last);
    } catch {
        // A stray % that is not an escape throws. The raw segment is still a
        // better label than nothing, so keep it.
    }

    // `primary:Neo Calendar` → `Neo Calendar`. Only when something follows:
    // a path that genuinely ends in a colon keeps what it has.
    const colon = decoded.lastIndexOf(":");
    if (colon >= 0 && colon < decoded.length - 1) {
        return decoded.slice(colon + 1);
    }
    return decoded;
}

/**
 * Whether the path is worth showing in full underneath the name.
 *
 * A real path tells you where the folder is. A `content://` URI tells you
 * nothing you could act on — it is an opaque handle, and printing it only
 * makes the dialog look broken.
 */
export function isReadablePath(path: string): boolean {
    return !/^content:\/\//i.test(path);
}
