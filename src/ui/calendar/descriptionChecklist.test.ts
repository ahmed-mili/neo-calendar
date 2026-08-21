import {
    readChecklist,
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
