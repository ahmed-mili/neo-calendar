import { folderDisplayName, isReadablePath } from "./folderLabel";

describe("folderDisplayName", () => {
    it("lit un arbre de documents Android", () => {
        // C'est exactement ce que le dialogue affichait tel quel :
        // "primary%3ANeo%20Calendar".
        expect(
            folderDisplayName(
                "content://com.android.externalstorage.documents/tree/primary%3ANeo%20Calendar"
            )
        ).toBe("Neo Calendar");
    });

    it("retire le volume de stockage", () => {
        expect(folderDisplayName("tree/primary:Agenda")).toBe("Agenda");
    });

    it("decode les espaces et les accents", () => {
        expect(folderDisplayName("tree/primary%3AMes%20%C3%89tudes")).toBe(
            "Mes Études"
        );
    });

    it("laisse un chemin Windows tranquille", () => {
        expect(folderDisplayName("C:\\Users\\Ahmed\\Neo Calendar")).toBe(
            "Neo Calendar"
        );
    });

    it("laisse un chemin Unix tranquille", () => {
        expect(folderDisplayName("/home/ahmed/Neo Calendar")).toBe(
            "Neo Calendar"
        );
    });

    it("ignore une barre oblique finale", () => {
        expect(folderDisplayName("/home/ahmed/Agenda/")).toBe("Agenda");
    });

    it("garde le nom quand il finit par deux-points", () => {
        // Rien apres le deux-points : il n'y a pas de volume a retirer.
        expect(folderDisplayName("tree/Agenda:")).toBe("Agenda:");
    });

    it("ne tombe pas sur un pourcentage qui n'est pas un echappement", () => {
        // decodeURIComponent leve sur "100%". Le segment brut vaut mieux que
        // rien.
        expect(folderDisplayName("/home/ahmed/100%")).toBe("100%");
    });

    it("renvoie le chemin quand il n'y a aucun segment", () => {
        expect(folderDisplayName("/")).toBe("/");
    });
});

describe("isReadablePath", () => {
    it("cache une URI de document Android", () => {
        // Une poignee opaque : l'afficher ne fait que donner l'air casse.
        expect(
            isReadablePath(
                "content://com.android.externalstorage.documents/tree/primary%3AAgenda"
            )
        ).toBe(false);
    });

    it("montre un vrai chemin, qui dit ou se trouve le dossier", () => {
        expect(isReadablePath("C:\\Users\\Ahmed\\Neo Calendar")).toBe(true);
        expect(isReadablePath("/home/ahmed/Neo Calendar")).toBe(true);
    });
});
