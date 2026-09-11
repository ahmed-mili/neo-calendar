/**
 * Quel calendrier a le droit aux horaires de prière.
 *
 * Les traits de prière ne sont pas un réglage de calendrier comme un autre :
 * ils ne veulent dire quelque chose que sur le calendrier qui porte ce
 * sujet-là. Proposés partout, ils encombraient le menu de tous les autres
 * d'une entrée qui n'y aurait jamais servi. Le nom du calendrier est donc ce
 * qui ouvre le réglage, et il n'y a qu'un nom, écrit dans l'une ou l'autre
 * des deux langues dans lesquelles on l'écrit.
 */

/** Les harakat et la shadda : invisibles au sens, présentes dans le texte. */
const ARABIC_DIACRITICS = /[ً-ْٰ]/g;

/** Toutes les alif se valent ici : إسلام et اسلام sont le même mot. */
const ALIF_VARIANTS = /[آأإٱ]/g;

/** L'article défini, que le nom le porte ou non : الإسلام comme إسلام. */
const ARABIC_ARTICLE = /^ال/;

const ACCEPTED = new Set(["islam", "اسلام"]);

/**
 * Le nom d'un calendrier, ramené à ce qui le distingue : espaces de bord et
 * casse mis de côté, et pour l'arabe les graphies qui ne changent pas le mot.
 */
function normalize(name: string): string {
    const trimmed = name.trim().toLowerCase().normalize("NFC");
    return trimmed
        .replace(ARABIC_DIACRITICS, "")
        .replace(ALIF_VARIANTS, "ا")
        .replace(ARABIC_ARTICLE, "");
}

/** Vrai pour « Islam » et pour « إسلام », à l'exclusion de tout autre nom. */
export function isPrayerCalendarName(name: string | undefined | null): boolean {
    if (!name) return false;
    return ACCEPTED.has(normalize(name));
}
