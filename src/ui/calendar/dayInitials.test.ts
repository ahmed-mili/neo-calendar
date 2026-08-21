import { dayInitialsFrom } from "./dayInitials";

describe("the letter a weekday is chosen by", () => {
    /*
     * The circles on the recurrence screen were labelled M T W T F S S in a
     * French interface: the letters were written into the source in English and
     * never asked the language what a day is called.
     */
    it("comes from the language the calendar is speaking", () => {
        expect(dayInitialsFrom("di,lu,ma,me,je,ve,sa")).toEqual({
            U: "D",
            M: "L",
            T: "M",
            W: "M",
            R: "J",
            F: "V",
            S: "S",
        });
    });

    it("says the same in English", () => {
        expect(dayInitialsFrom("su,mo,tu,we,th,fr,sa")).toEqual({
            U: "S",
            M: "M",
            T: "T",
            W: "W",
            R: "T",
            F: "F",
            S: "S",
        });
    });

    // A day whose name starts with an accent keeps it: dropping accents is how
    // a French interface ends up looking machine-translated.
    it("keeps whatever letter the name actually starts with", () => {
        expect(dayInitialsFrom("é,b,c,d,e,f,g").U).toBe("É");
    });
});
