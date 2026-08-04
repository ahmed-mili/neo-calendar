import { getInlineAttributes } from "./DailyNoteCalendar";

describe("inline attributes", () => {
    it("reads a single [key:: value] pair", () => {
        expect(getInlineAttributes("one variable [hello:: world]")).toEqual({
            hello: "world",
        });
    });

    it("reads every pair on the line", () => {
        expect(getInlineAttributes("[first:: a] message [second:: b]")).toEqual(
            {
                first: "a",
                second: "b",
            }
        );
    });

    it("ignores brackets and colons that aren't an attribute", () => {
        expect(
            getInlineAttributes(
                "this is a long string with [some brackets] but no actual:: inline fields"
            )
        ).toEqual({});
    });
});
