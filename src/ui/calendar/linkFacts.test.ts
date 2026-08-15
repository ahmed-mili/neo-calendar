import { linkFacts, linkSubtitle, shortDate } from "./linkFacts";

const VIDEO = "https://www.tiktok.com/@quelquun/video/7412345678901234567";

describe("ce qu'une adresse dit d'elle-même", () => {
    it("lit le compte dans le chemin", () => {
        expect(linkFacts(VIDEO).account).toBe("@quelquun");
    });

    // Les trente-deux bits de poids fort de l'identifiant sont l'horodatage
    // Unix de la publication.
    it("lit la date dans l'identifiant", () => {
        const { published } = linkFacts(VIDEO);
        expect(published?.toISOString().slice(0, 10)).toBe("2024-09-08");
    });

    // Un lien de partage ne porte ni l'un ni l'autre : on ne dit rien plutôt
    // que d'inventer.
    it("ne déduit rien d'un lien court", () => {
        expect(linkFacts("https://vm.tiktok.com/ZN88SfmSj/")).toEqual({
            account: null,
            published: null,
        });
        expect(linkSubtitle("https://vm.tiktok.com/ZN88SfmSj/")).toBeNull();
    });

    // Un identifiant d'une autre famille donnerait une date en 1970 ou dans un
    // siècle ; une date fausse affichée comme un fait est pire que rien.
    it("refuse une date invraisemblable", () => {
        expect(
            linkFacts("https://exemple.fr/article/100000000000000").published
        ).toBeNull();
        expect(
            linkFacts("https://exemple.fr/article/999999999999999999999")
                .published
        ).toBeNull();
    });

    it("ne se laisse pas troubler par ce qui n'est pas une adresse web", () => {
        expect(linkFacts("obsidian://open?file=x")).toEqual({
            account: null,
            published: null,
        });
        expect(linkFacts("pas une adresse")).toEqual({
            account: null,
            published: null,
        });
    });

    it("rend le compte seul quand la date manque", () => {
        expect(linkSubtitle("https://www.tiktok.com/@quelquun")).toBe(
            "@quelquun"
        );
    });

    it("assemble le compte et la date", () => {
        expect(linkSubtitle(VIDEO)).toBe(
            `@quelquun · ${shortDate(new Date(Date.UTC(2024, 8, 8)))}`
        );
    });
});

describe("le sous-titre ne répète pas le nom", () => {
    // Faute de légende, la vidéo prend le nom de son auteur ; l'écrire deux
    // fois l'un sous l'autre ne dit rien de plus.
    it("laisse tomber le compte quand il EST le nom affiché", () => {
        expect(linkSubtitle(VIDEO, "@quelquun")).toBe(
            shortDate(new Date(Date.UTC(2024, 8, 8)))
        );
    });

    it("garde le compte sous un vrai titre", () => {
        expect(linkSubtitle(VIDEO, "La danse du chat")).toContain("@quelquun");
    });
});
