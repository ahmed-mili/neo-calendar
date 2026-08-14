import { folderName, readableFolderPath } from "./documentPath";

/*
 * Ce que l'écran des réglages doit montrer du dossier choisi.
 *
 * On vient sur cet écran pour vérifier qu'on a pris le bon dossier ; une
 * adresse de fournisseur ne répond pas à cette question.
 */
describe("le dossier choisi, écrit pour être lu", () => {
    it("traduit un dossier de la mémoire interne", () => {
        expect(
            readableFolderPath(
                "content://com.android.externalstorage.documents/tree/primary%3ANeo%20Calendar"
            )
        ).toBe("/storage/emulated/0/Neo Calendar");
    });

    it("garde les sous-dossiers", () => {
        expect(
            readableFolderPath(
                "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FAgenda%2F2026"
            )
        ).toBe("/storage/emulated/0/Documents/Agenda/2026");
    });

    // Une carte SD est montée sous son identifiant de volume, pas sous
    // /storage/emulated/0.
    it("traduit un dossier de carte mémoire", () => {
        expect(
            readableFolderPath(
                "content://com.android.externalstorage.documents/tree/1A2B-3C4D%3ACalendrier"
            )
        ).toBe("/storage/1A2B-3C4D/Calendrier");
    });

    it("rend la racine d'un volume", () => {
        expect(
            readableFolderPath(
                "content://com.android.externalstorage.documents/tree/primary%3A"
            )
        ).toBe("/storage/emulated/0");
    });

    // Quand les deux sont là, c'est le document qui désigne ce qui est ouvert.
    it("préfère le document à l'arbre qui le contient", () => {
        expect(
            readableFolderPath(
                "content://com.android.externalstorage.documents/tree/primary%3ANeo" +
                    "/document/primary%3ANeo%2FArchives"
            )
        ).toBe("/storage/emulated/0/Neo/Archives");
    });

    // Chez les autres fournisseurs l'identifiant est opaque : il n'y a pas de
    // chemin à reconstruire, et en inventer un serait pire que de n'en pas
    // donner.
    it("n'invente pas de chemin pour un fournisseur opaque", () => {
        expect(
            readableFolderPath(
                "content://com.android.providers.downloads.documents/tree/downloads"
            )
        ).toBe("downloads");
    });

    it("laisse un vrai chemin tranquille", () => {
        expect(readableFolderPath("C:\\Calendar data")).toBe(
            "C:\\Calendar data"
        );
        expect(readableFolderPath("/home/ahmed/Agenda")).toBe(
            "/home/ahmed/Agenda"
        );
    });

    it("nomme le dossier par son dernier segment, des deux côtés", () => {
        expect(
            folderName(
                "content://com.android.externalstorage.documents/tree/primary%3ANeo%20Calendar"
            )
        ).toBe("Neo Calendar");
        expect(folderName("C:\\Calendar data")).toBe("Calendar data");
        expect(folderName("/home/ahmed/Agenda/")).toBe("Agenda");
    });
});
