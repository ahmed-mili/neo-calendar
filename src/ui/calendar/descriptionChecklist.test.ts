import {
    mergeLine,
    readChecklist,
    taskPrefixLength,
    replaceLine,
    splitLine,
    toggleLine,
    withStepsAppended,
} from "./descriptionChecklist";

describe("reading a description as lines", () => {
    it("laisse le texte ordinaire tranquille", () => {
        expect(readChecklist("Rien à cocher\nDeux lignes")).toEqual([
            { kind: "text", text: "Rien à cocher" },
            { kind: "text", text: "Deux lignes" },
        ]);
    });

    it("reconnaît une case vide et une case cochée", () => {
        expect(
            readChecklist("- [ ] Acheter du pain\n- [x] Poster la lettre")
        ).toEqual([
            {
                kind: "task",
                done: false,
                title: "Acheter du pain",
                indent: "",
            },
            {
                kind: "task",
                done: true,
                title: "Poster la lettre",
                indent: "",
            },
        ]);
    });

    // Les mêmes marques que le reste de l'app lit sur la case d'un événement :
    // d'autres plugins Obsidian écrivent [/] et [~] pour « commencé ».
    it("tient une étape commencée pour non terminée", () => {
        expect(readChecklist("- [/] En cours")[0]).toMatchObject({
            done: false,
            title: "En cours",
        });
        expect(readChecklist("- [~] Entamé")[0]).toMatchObject({
            done: false,
        });
    });

    it("garde le retrait d'une sous-étape", () => {
        expect(readChecklist("    - [ ] Deuxième niveau")[0]).toEqual({
            kind: "task",
            done: false,
            title: "Deuxième niveau",
            indent: "    ",
        });
    });

    it("accepte les trois puces du Markdown", () => {
        for (const bullet of ["-", "*", "+"]) {
            expect(readChecklist(`${bullet} [ ] Étape`)[0]).toMatchObject({
                kind: "task",
                title: "Étape",
            });
        }
    });

    it("ne prend pas une liste ordinaire pour une case", () => {
        expect(readChecklist("- Une puce sans case")[0]).toEqual({
            kind: "text",
            text: "- Une puce sans case",
        });
    });
});

describe("ticking one line", () => {
    const text = "Avant\n- [ ] Première\n- [x] Seconde\nAprès";

    it("coche la ligne visée et ne touche à rien d'autre", () => {
        expect(toggleLine(text, 1)).toBe(
            "Avant\n- [x] Première\n- [x] Seconde\nAprès"
        );
    });

    it("décoche aussi bien", () => {
        expect(toggleLine(text, 2)).toBe(
            "Avant\n- [ ] Première\n- [ ] Seconde\nAprès"
        );
    });

    it("garde le retrait et la puce d'origine", () => {
        expect(toggleLine("  * [ ] Retirée", 0)).toBe("  * [x] Retirée");
    });

    it("ne fait rien sur une ligne qui n'est pas une case", () => {
        expect(toggleLine(text, 0)).toBe(text);
        expect(toggleLine(text, 9)).toBe(text);
    });
});

describe("bringing the old steps into the description", () => {
    const steps = [
        { title: "Faire les cartons", done: true },
        { title: "Louer la camionnette", done: false },
    ];

    it("écrit une liste quand la description est vide", () => {
        expect(withStepsAppended("", steps)).toBe(
            "- [x] Faire les cartons\n- [ ] Louer la camionnette"
        );
        expect(withStepsAppended("\n  \n", steps)).toBe(
            "- [x] Faire les cartons\n- [ ] Louer la camionnette"
        );
    });

    it("les met à la suite du texte déjà écrit", () => {
        expect(withStepsAppended("Déménagement", steps)).toBe(
            "Déménagement\n- [x] Faire les cartons\n- [ ] Louer la camionnette"
        );
    });

    it("rend la description telle quelle quand il n'y a rien à verser", () => {
        expect(withStepsAppended("Déménagement", [])).toBe("Déménagement");
    });

    it("saute une étape sans titre, qui ne dirait rien une fois versée", () => {
        expect(withStepsAppended("", [{ title: "  ", done: false }])).toBe("");
    });
});

describe("editing one line without touching the others", () => {
    const text = "Titre\n- [ ] Première\n- [x] Seconde";

    it("puts the new wording where the old one was", () => {
        expect(replaceLine(text, 1, "- [ ] Autre")).toBe(
            "Titre\n- [ ] Autre\n- [x] Seconde"
        );
    });

    it("laisse le texte tel quel pour une ligne qui n'existe pas", () => {
        expect(replaceLine(text, 9, "x")).toBe(text);
    });
});

describe("pressing Enter in the middle of a line", () => {
    it("coupe la ligne en deux et passe sur la seconde", () => {
        expect(splitLine("Bonjour tout le monde", 0, 7)).toEqual({
            text: "Bonjour\n tout le monde",
            focus: 1,
            caret: 0,
        });
    });

    /*
     * Une liste continue d'elle-même : la ligne suivante d'une étape est une
     * étape. C'est ce que fait tout éditeur Markdown, et devoir retaper `- [ ]`
     * à chaque ligne est ce qui décourage d'en écrire.
     */
    it("continue la liste quand on était sur une étape", () => {
        expect(splitLine("- [ ] Première", 0, 14)).toEqual({
            text: "- [ ] Première\n- [ ] ",
            focus: 1,
            caret: 6,
        });
    });

    it("garde le retrait et la puce de l'étape qu'on prolonge", () => {
        expect(splitLine("    * [x] Faite", 0, 15).text).toBe(
            "    * [x] Faite\n    * [ ] "
        );
    });

    /*
     * Sauf sur une étape vide : c'est la façon de sortir d'une liste, et sans
     * cela on ne peut plus écrire de prose après.
     */
    it("sort de la liste quand on valide une étape vide", () => {
        expect(splitLine("- [ ] Faite\n- [ ] ", 1, 6)).toEqual({
            text: "- [ ] Faite\n",
            focus: 1,
            caret: 0,
        });
    });
});

describe("pressing Backspace at the start of a line", () => {
    it("recolle la ligne à celle du dessus, curseur à la jointure", () => {
        expect(mergeLine("Bonjour\n tout le monde", 1)).toEqual({
            text: "Bonjour tout le monde",
            focus: 0,
            caret: 7,
        });
    });

    // Une étape effacée redevient une ligne ordinaire avant de disparaître :
    // c'est le geste par lequel on retire une case sans perdre son texte.
    it("retire d'abord la case, sans toucher au texte", () => {
        expect(mergeLine("Titre\n- [ ] Première", 1)).toEqual({
            text: "Titre\nPremière",
            focus: 1,
            caret: 0,
        });
    });

    it("ne fait rien sur la première ligne", () => {
        expect(mergeLine("Seule", 0)).toEqual({
            text: "Seule",
            focus: 0,
            caret: 0,
        });
    });
});

describe("taskPrefixLength", () => {
    it("mesure la case, espace facultatif compris", () => {
        expect(taskPrefixLength("- [ ] Acheter du pain")).toBe(6);
        expect(taskPrefixLength("    * [x] Poster")).toBe(10);
    });

    it("compte la case seule quand rien ne la suit", () => {
        // La ligne qu'on vient de commencer : la case est là, le titre pas
        // encore. `- [ ]` fait cinq caractères, l'espace n'y est pas.
        expect(taskPrefixLength("- [ ]")).toBe(5);
        expect(taskPrefixLength("- [ ] ")).toBe(6);
    });

    it("ne mesure rien sur une ligne qui n'est pas une étape", () => {
        expect(taskPrefixLength("Du texte")).toBeNull();
        expect(taskPrefixLength("- [] pas de case")).toBeNull();
    });
});
