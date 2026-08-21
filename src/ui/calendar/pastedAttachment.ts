/**
 * What the clipboard can leave on an event.
 *
 * Attaching a file meant opening a dialog and finding it on disk, which is a
 * long way round for the commonest case by far: a screenshot, already on the
 * clipboard, one keystroke away. Pressing Ctrl+V over the panel now files it
 * beside the note like any other attachment.
 *
 * The decisions live here rather than in the paste handler because they are the
 * part worth being sure about: what may be written at all, and under what name.
 */

/** The types worth keeping, and the extension each is filed under. */
const KEPT: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
};

/** What images are called, wherever a link has to be recognised as one. */
export const IMAGE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "bmp",
    "avif",
]);

/**
 * The extension a clipboard entry would be filed under, or nothing.
 *
 * Nothing is the answer for text, which every copy carries: pasting a sentence
 * into the panel must put it where the caret is, not write a file beside the
 * note.
 */
export function attachmentExtension(mimeType: string): string | undefined {
    const type = mimeType.split(";")[0].trim().toLowerCase();
    return KEPT[type];
}

/** Two digits, as every part of a stamp is written. */
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The name a pasted file is filed under.
 *
 * A copied file brings its own, and that is the name someone will look for
 * afterwards — Windows hands a screenshot over as `image.png`. Only the last
 * segment of it is kept: a name from outside is a name that decides where the
 * file lands, and `../` in one walks out of the attachments folder.
 *
 * Raw bitmap data has no name at all, so it is stamped with the moment it
 * arrived. Anything beats a second file called "untitled".
 */
export function pastedFileName(
    mimeType: string,
    stamp: Date,
    given?: string
): string {
    const own = (given ?? "").split(/[\\/]/).pop()?.trim();
    if (own) return own;

    const extension = attachmentExtension(mimeType) ?? "bin";
    const date = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
        stamp.getDate()
    )}`;
    const time = `${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(
        stamp.getSeconds()
    )}`;
    return `presse-papiers-${date}-${time}.${extension}`;
}

/**
 * Whether a link the note carries should be shown as a picture of itself.
 *
 * Only a file beside the note: a web address is a link to somewhere else and a
 * note is a note, however either one happens to end. A PDF is shown as the file
 * it is — drawing its first page means carrying a PDF renderer.
 */
export function isImageTarget(target: string): boolean {
    if (/^[a-z]+:\/\//i.test(target)) return false;
    let decoded = target;
    try {
        decoded = decodeURIComponent(target);
    } catch {
        // A target that is not valid escaping is read as written.
    }
    const extension = decoded.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTENSIONS.has(extension);
}

/**
 * The type a thumbnail is handed to the browser as.
 *
 * A `data:` URL carries no file name, so the type has to be stated: left to be
 * guessed, a PNG announced as anything else simply does not draw. Read from
 * what the file is called, because that is all a link to it says.
 */
export function imageMimeFor(target: string): string {
    const extension = target.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
    if (extension === "svg") return "image/svg+xml";
    if (IMAGE_EXTENSIONS.has(extension)) return `image/${extension}`;
    // Unknown said plainly: the browser sniffs it and draws it if it can.
    return "application/octet-stream";
}

/**
 * Where an attachment sits, counted from the data folder.
 *
 * The two platforms write the link differently, and both are already in
 * people's notes: the desktop writes it relative to the event's own folder
 * (`.attachments/a.png`), the phone writes the whole path from the data folder
 * (`Calendrier/attachments/a.png`). Reading one as if it were the other doubles
 * the folder, and the file is simply not found — so the link says which it is,
 * by whether it already begins with the folder the event is in.
 */
export function attachmentPathFor(
    eventRelativePath: string,
    target: string
): string {
    const slash = (value: string) => value.split("\\").join("/");
    const event = slash(eventRelativePath);
    const link = slash(target);
    const cut = event.lastIndexOf("/");
    if (cut < 0) return link;
    const folder = event.slice(0, cut);
    return link.startsWith(`${folder}/`) ? link : `${folder}/${link}`;
}
