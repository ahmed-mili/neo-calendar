import * as linkInput from "./linkInput";

type Mention = { start: number; end: number; query: string };

const mentionAt = (value: string, caret: number): Mention | null =>
    (
        linkInput as typeof linkInput & {
            descriptionMentionAt?: (
                text: string,
                position: number
            ) => Mention | null;
        }
    ).descriptionMentionAt?.(value, caret) ?? null;

const withoutMention = (value: string, mention: Mention) =>
    (
        linkInput as typeof linkInput & {
            withoutDescriptionMention?: (
                text: string,
                found: Mention
            ) => { value: string; caret: number };
        }
    ).withoutDescriptionMention?.(value, mention) ?? null;

describe("the @ trigger inside a description", () => {
    it("reads the query immediately before the caret", () => {
        expect(mentionAt("Voir @pack", 10)).toEqual({
            start: 5,
            end: 10,
            query: "pack",
        });
    });

    it("does not mistake an email address for a vault mention", () => {
        expect(mentionAt("ahmed@example.com", 17)).toBeNull();
    });

    it("does not mistake an @ inside a URL for a vault mention", () => {
        const value = "https://www.tiktok.com/@pack/video/123";
        expect(mentionAt(value, 28)).toBeNull();
    });

    it("removes only the trigger after a note is selected", () => {
        expect(
            withoutMention("Voir @pack demain", {
                start: 5,
                end: 10,
                query: "pack",
            })
        ).toEqual({ value: "Voir demain", caret: 5 });
    });
});
