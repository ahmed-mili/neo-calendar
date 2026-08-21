import {
    attachmentExtension,
    isImageTarget,
    pastedFileName,
} from "./pastedAttachment";

const stamp = new Date(2026, 7, 21, 9, 15, 0);

describe("what the clipboard is holding", () => {
    it("keeps the pictures", () => {
        expect(attachmentExtension("image/png")).toBe("png");
        expect(attachmentExtension("image/jpeg")).toBe("jpg");
        expect(attachmentExtension("image/webp")).toBe("webp");
    });

    // The other half of the ask: a PDF is a file worth keeping on an event,
    // and it arrives on the clipboard the same way a picture does.
    it("keeps a PDF", () => {
        expect(attachmentExtension("application/pdf")).toBe("pdf");
    });

    /*
     * And nothing else. Every copy carries text — pasting a sentence into the
     * panel must put it where the caret is, not write a file beside the note.
     */
    it("lets text through untouched", () => {
        expect(attachmentExtension("text/plain")).toBeUndefined();
        expect(attachmentExtension("text/html")).toBeUndefined();
        expect(attachmentExtension("")).toBeUndefined();
    });

    it("ignores the case and the parameters a type may carry", () => {
        expect(attachmentExtension("IMAGE/PNG")).toBe("png");
        expect(attachmentExtension("image/jpeg; charset=binary")).toBe("jpg");
    });
});

describe("the name a pasted file is filed under", () => {
    /*
     * A copied file brings its own name, and that is the name someone will look
     * for afterwards. Windows hands a screenshot over as "image.png", which is
     * exactly what the reference shows above the thumbnail.
     */
    it("is the one the file already had", () => {
        expect(pastedFileName("image/png", stamp, "image.png")).toBe(
            "image.png"
        );
        expect(pastedFileName("application/pdf", stamp, "facture.pdf")).toBe(
            "facture.pdf"
        );
    });

    // Raw bitmap data has no name at all. A stamp beats "sans-titre" the moment
    // there are two of them.
    it("is the moment it was pasted, when it had none", () => {
        expect(pastedFileName("image/png", stamp)).toBe(
            "presse-papiers-20260821-091500.png"
        );
    });

    it("is stamped in the extension the type calls for", () => {
        expect(pastedFileName("application/pdf", stamp)).toBe(
            "presse-papiers-20260821-091500.pdf"
        );
    });

    /*
     * A name from outside is a name that decides where the file lands: `..` in
     * it walks out of the attachments folder. The native side refuses those
     * too, but a name that never leaves here cannot be refused late.
     */
    it("keeps a name from wandering out of its folder", () => {
        expect(pastedFileName("image/png", stamp, "../../evade.png")).toBe(
            "evade.png"
        );
        expect(pastedFileName("image/png", stamp, "a/b/c.png")).toBe("c.png");
        expect(pastedFileName("image/png", stamp, "   ")).toBe(
            "presse-papiers-20260821-091500.png"
        );
    });

    // A file named for something else is still that something else: renaming
    // "notes.txt" to ".png" would make the thumbnail lie about it.
    it("leaves an unexpected extension alone", () => {
        expect(pastedFileName("image/png", stamp, "capture.jpeg")).toBe(
            "capture.jpeg"
        );
    });
});

describe("what gets a picture of itself in the panel", () => {
    it("is anything the note links to as an image", () => {
        expect(isImageTarget(".attachments/image.png")).toBe(true);
        expect(isImageTarget(".attachments/PHOTO.JPG")).toBe(true);
        expect(isImageTarget(".attachments/dessin.svg")).toBe(true);
    });

    // A PDF is shown as the file it is, with its name: drawing its first page
    // means carrying a PDF renderer, and the reference does not show one.
    it("is not a PDF, nor a note, nor a web address", () => {
        expect(isImageTarget(".attachments/facture.pdf")).toBe(false);
        expect(isImageTarget("https://example.com/a.png")).toBe(false);
        expect(isImageTarget("obsidian://open?file=a.png")).toBe(false);
    });

    it("survives a target written with URL escapes", () => {
        expect(isImageTarget(".attachments/mon%20image.png")).toBe(true);
    });
});
