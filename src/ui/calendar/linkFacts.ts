import { t } from "../i18n";

/*
 * Ce qu'une adresse dit d'elle-même.
 *
 * Le compte et la date d'une vidéo ne sont stockés nulle part, et n'ont pas à
 * l'être : ils sont dans l'adresse. `tiktok.com/@quelquun/video/7412…` porte le
 * nom du compte en toutes lettres, et son identifiant numérique porte l'heure de
 * publication — les trente-deux bits de poids fort en sont l'horodatage Unix,
 * comme dans tous les identifiants de cette famille.
 *
 * Les déduire plutôt que les enregistrer a trois conséquences heureuses : rien
 * à écrire dans les fichiers, rien à aller chercher sur le réseau, et cela
 * marche pour les liens déjà là. En échange, cela ne marche que pour une
 * adresse canonique : un lien de partage — `vm.tiktok.com/ZN88…` — ne porte
 * aucun des deux, et alors on ne dit rien plutôt que d'inventer.
 */

/** Ce qu'on a pu lire d'un lien sans rien demander à personne. */
export interface LinkFacts {
    /** Le compte, arobase comprise. */
    account: string | null;
    /** Quand cela a été publié, si l'adresse le dit. */
    published: Date | null;
}

/** Avant TikTok, l'arithmétique ne veut rien dire ; après demain non plus. */
const FIRST_PLAUSIBLE = Date.UTC(2016, 0, 1);

/** Le compte nommé dans le chemin, `/@quelquun/…`. */
function accountIn(path: string): string | null {
    const found = path.split("/").find((part) => part.startsWith("@"));
    if (!found || found.length < 2) return null;
    return decodeURIComponent(found);
}

/**
 * L'heure de publication portée par l'identifiant.
 *
 * Refusée dès qu'elle est invraisemblable : un identifiant qui n'est pas de
 * cette famille donnera une date en 1970 ou dans un siècle, et une date fausse
 * affichée comme un fait est pire que pas de date du tout.
 */
function publishedFromId(identifier: string): Date | null {
    if (!/^\d{15,}$/.test(identifier)) return null;

    let seconds: number;
    try {
        seconds = Number(BigInt(identifier) >> 32n);
    } catch {
        return null;
    }

    const when = seconds * 1000;
    if (when < FIRST_PLAUSIBLE || when > Date.now() + 86_400_000) return null;
    return new Date(when);
}

/** Ce que l'adresse d'un lien dit du compte et de la date. */
export function linkFacts(target: string): LinkFacts {
    const nothing: LinkFacts = { account: null, published: null };
    let path: string;
    try {
        const url = new URL(target);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return nothing;
        }
        path = url.pathname;
    } catch {
        return nothing;
    }

    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";

    return {
        account: accountIn(path),
        published: publishedFromId(last),
    };
}

/** « 8 sept. 2024 » — le mois abrégé, dans la langue de l'application. */
export function shortDate(value: Date): string {
    const months = t("months.short").split(",");
    const month = months[value.getMonth()] ?? "";
    return `${value.getDate()} ${month} ${value.getFullYear()}`.replace(
        /\s+/g,
        " "
    );
}

/**
 * La ligne sous le nom : le compte, la date, ou les deux.
 *
 * Le compte disparaît quand il EST le nom : faute de légende, une vidéo prend
 * le nom de son auteur, et l'écrire deux fois l'un sous l'autre ne dit rien de
 * plus — il ne reste alors que la date, qui elle est nouvelle.
 */
export function linkSubtitle(target: string, shownAs = ""): string | null {
    const { account, published } = linkFacts(target);
    const repeats =
        account !== null &&
        account.toLowerCase() === shownAs.trim().toLowerCase();
    const parts = [
        repeats ? null : account,
        published ? shortDate(published) : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}
