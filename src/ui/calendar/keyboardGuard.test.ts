import { isEditableTarget } from "./keyboardGuard";

describe("isEditableTarget", () => {
    it("reconnait un input", () => {
        expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    });

    it("reconnait un textarea", () => {
        expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    });

    it("reconnait un select", () => {
        expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    });

    it("reconnait un element contenteditable quel que soit son tag", () => {
        expect(
            isEditableTarget({ tagName: "DIV", isContentEditable: true })
        ).toBe(true);
    });

    it("accepte un tagName en minuscules", () => {
        expect(isEditableTarget({ tagName: "input" })).toBe(true);
    });

    it("laisse passer un element ordinaire", () => {
        expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
        expect(
            isEditableTarget({ tagName: "BUTTON", isContentEditable: false })
        ).toBe(false);
    });

    it("laisse passer l'absence de cible", () => {
        expect(isEditableTarget(null)).toBe(false);
        expect(isEditableTarget(undefined)).toBe(false);
        expect(isEditableTarget({})).toBe(false);
    });
});
