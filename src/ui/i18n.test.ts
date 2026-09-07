import { applyLanguage, getLanguage, t, tList } from "./i18n";

afterEach(() => applyLanguage("fr"));

describe("t", () => {
    it("reads a phrase in French", () => {
        applyLanguage("fr");
        expect(t("Add event")).toBe("Ajouter un événement");
    });

    // The English string IS the key, so English needs no dictionary of its own
    // and can never fall out of step with the call sites.
    it("reads the key itself in English", () => {
        applyLanguage("en");
        expect(t("Add event")).toBe("Add event");
    });

    // A phrase nobody has translated yet must still be readable: showing the
    // English is a gap, showing `calendar.event.add` is a bug on screen.
    it("falls back to the phrase rather than to a key", () => {
        applyLanguage("fr");
        expect(t("Something nobody translated")).toBe(
            "Something nobody translated"
        );
    });
});

describe("ICS links wording", () => {
    it("names the sidebar menu entry and the panel's add action in French", () => {
        applyLanguage("fr");
        expect(t("ICS links")).toBe("Liens ICS");
        expect(t("Add an ICS link")).toBe("Ajouter un lien ICS");
        expect(t("Never synced")).toBe("Jamais synchronisé");
        expect(t("Syncing…")).toBe("Synchronisation…");
        expect(t("Apply to all links")).toBe("Appliquer à tous les liens");
    });
});

describe("tList", () => {
    it("reads the months in French", () => {
        applyLanguage("fr");
        expect(tList("months.short", [])[0]).toBe("janv");
        expect(tList("months.short", [])).toHaveLength(12);
    });

    it("reads the days in French", () => {
        applyLanguage("fr");
        expect(tList("days.short", [])).toEqual([
            "dim",
            "lun",
            "mar",
            "mer",
            "jeu",
            "ven",
            "sam",
        ]);
    });

    it("hands back the English list when there is no entry", () => {
        applyLanguage("en");
        expect(tList("months.short", ["Jan", "Feb"])).toEqual(["Jan", "Feb"]);
    });
});

describe("getLanguage", () => {
    it("reports the language in force", () => {
        applyLanguage("en");
        expect(getLanguage()).toBe("en");
        applyLanguage("fr");
        expect(getLanguage()).toBe("fr");
    });
});

/*
 * Les libellés du menu d'application de Windows. La capture annotée les fixe
 * mot pour mot ; c'est du français par défaut, donc c'est le français qui est
 * vérifié.
 */
describe("Windows application menu wording", () => {
    it("names the three rubrics as the reference does", () => {
        applyLanguage("fr");
        expect(t("Edit")).toBe("Modifier");
        expect(t("Display")).toBe("Afficher");
        // « View » sert déjà de titre de rubrique aux raccourcis clavier : le
        // menu emploie « Display » pour ne pas lui prendre son sens.
        expect(t("View")).toBe("Affichage");
    });

    it("names the entries of each rubric", () => {
        applyLanguage("fr");
        expect(t("Check for updates…")).toBe("Rechercher les mises à jour…");
        expect(t("Settings…")).toBe("Paramètres…");
        expect(t("Undo")).toBe("Annuler l'action");
        expect(t("Redo")).toBe("Rétablir");
        expect(t("Paste and match style")).toBe("Coller et respecter le style");
        expect(t("Select all visible items")).toBe(
            "Sélectionner tous les éléments visibles"
        );
        expect(t("Default hour spacing")).toBe(
            "Espacement des heures par défaut"
        );
        expect(t("Interface scale")).toBe("Échelle de l'interface");
        expect(t("Force refresh")).toBe("Forcer le rafraîchissement");
        expect(t("Show developer tools")).toBe(
            "Afficher les outils de développement"
        );
        expect(t("Toggle full screen")).toBe("Basculer en plein écran");
    });

    it("reads the shortcut keys in the language of the menu", () => {
        applyLanguage("fr");
        expect(t("Ctrl+Comma")).toBe("Ctrl+Virgule");
        expect(t("Ctrl+Shift+0")).toBe("Ctrl+Maj+0");
        expect(t("Ctrl+Shift+Period")).toBe("Ctrl+Maj+Point");
        expect(t("Ctrl+Shift+Comma")).toBe("Ctrl+Maj+Virgule");
        expect(t("Backspace")).toBe("Retour");
        applyLanguage("en");
        expect(t("Ctrl+Comma")).toBe("Ctrl+Comma");
    });
});
