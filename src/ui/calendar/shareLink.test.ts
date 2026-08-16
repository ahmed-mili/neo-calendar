import { isShareLink, needsResolving } from "./shareLink";

describe("isShareLink", () => {
    it("knows a site's own share address", () => {
        expect(isShareLink("https://vm.tiktok.com/ZN88G1NAU/")).toBe(true);
        expect(isShareLink("https://vt.tiktok.com/ZSjKq1abc/")).toBe(true);
        expect(isShareLink("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    });

    it("knows the shorteners that exist for nothing else", () => {
        expect(isShareLink("https://bit.ly/3xYzAbc")).toBe(true);
        expect(isShareLink("https://t.co/abc123XY")).toBe(true);
        expect(isShareLink("https://lnkd.in/eXaMpLe")).toBe(true);
    });

    // An ordinary address says what it points at, and must never be rewritten
    // to wherever it happens to redirect today — that is how a link ends up
    // stored as a login page.
    it("leaves an address that says what it points at", () => {
        expect(
            isShareLink(
                "https://www.tiktok.com/@fatwasfr/video/7645383659813391648"
            )
        ).toBe(false);
        expect(isShareLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
            false
        );
        expect(isShareLink("https://example.com/blog/how-it-works")).toBe(
            false
        );
    });

    it("does not read a share subdomain's ordinary pages as codes", () => {
        expect(
            isShareLink("https://share.example.com/help/getting-started")
        ).toBe(false);
        expect(isShareLink("https://s.example.com/2026/08/16/a-post")).toBe(
            false
        );
    });

    it("keeps its hands off anything that is not a web address", () => {
        expect(isShareLink("mailto:someone@example.com")).toBe(false);
        expect(isShareLink("Notes/Reading list.md")).toBe(false);
        expect(isShareLink("")).toBe(false);
    });
});

describe("needsResolving", () => {
    it("asks only about web links", () => {
        expect(needsResolving("https://bit.ly/3xYzAbc", "web")).toBe(true);
        expect(needsResolving("https://bit.ly/3xYzAbc", "attachment")).toBe(
            false
        );
        expect(needsResolving("Notes/Reading list.md", "note")).toBe(false);
    });

    // Once a share has been looked through, the note holds where it went: the
    // address is its own record of having been resolved.
    it("stops asking once the link says where it goes", () => {
        expect(
            needsResolving(
                "https://www.tiktok.com/@fatwasfr/video/7645383659813391648",
                "web"
            )
        ).toBe(false);
    });
});
