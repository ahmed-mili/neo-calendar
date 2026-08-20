import { applyLanguage } from "../i18n";
import { countedLabel } from "./countedLabel";

describe("the label of a menu entry that acts on a selection", () => {
    afterEach(() => applyLanguage("fr"));

    it("dit le verbe seul quand une seule entrée est visée", () => {
        applyLanguage("fr");
        expect(countedLabel("Delete", 1)).toBe("Supprimer");
        expect(countedLabel("Delete", 0)).toBe("Supprimer");
    });

    it("compte les événements dans la langue choisie", () => {
        applyLanguage("fr");
        expect(countedLabel("Duplicate", 3)).toBe("Dupliquer 3 événements");
        expect(countedLabel("Delete", 12)).toBe("Supprimer 12 événements");
    });

    it("keeps English labels in English", () => {
        applyLanguage("en");
        expect(countedLabel("Duplicate", 3)).toBe("Duplicate 3 events");
        expect(countedLabel("Delete", 1)).toBe("Delete");
    });
});
