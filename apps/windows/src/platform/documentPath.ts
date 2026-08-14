/*
 * Le dossier choisi, écrit comme un chemin plutôt que comme une adresse.
 *
 * Android ne donne pas un chemin quand on choisit un dossier : il donne
 * l'identifiant d'un document chez un fournisseur, soit
 *
 *     content://com.android.externalstorage.documents/tree/primary%3ANeo%20Calendar
 *
 * pour ce que le gestionnaire de fichiers, lui, appelle
 *
 *     /storage/emulated/0/Neo Calendar
 *
 * Les deux désignent la même chose, mais seule la seconde est reconnaissable —
 * et c'est justement à cet écran qu'on vient vérifier qu'on a bien choisi le
 * bon dossier. La traduction se fait à l'affichage : l'identifiant reste ce
 * qu'on stocke et ce qu'on rend au système, parce que c'est lui qui porte
 * l'autorisation d'accès, et qu'un chemin reconstruit ne l'ouvrirait pas.
 */

/** Le seul fournisseur dont l'identifiant se lise comme un chemin. */
const EXTERNAL_STORAGE = "com.android.externalstorage.documents";

function decode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        // Un pourcent isolé fait lever decodeURIComponent ; mieux vaut le texte
        // tel quel qu'une exception au milieu d'un écran de réglages.
        return value;
    }
}

/** `…/tree/A/document/B` → `B` ; `…/tree/A` → `A`. Le document l'emporte : quand
    les deux sont là, c'est le second qui désigne ce qui a été ouvert. */
function documentId(uri: string): string {
    for (const marker of ["/document/", "/tree/"]) {
        const at = uri.lastIndexOf(marker);
        if (at !== -1) return decode(uri.slice(at + marker.length));
    }
    return "";
}

/**
 * Le chemin qu'un humain reconnaîtra, ou la valeur inchangée.
 *
 * Sur le bureau les chemins sont déjà des chemins et rien n'est touché. Chez un
 * fournisseur autre que le stockage externe — les téléchargements, une appli de
 * cloud — l'identifiant est opaque et il n'y a pas de chemin à reconstruire : on
 * rend alors ce qu'on peut de plus lisible plutôt que d'inventer.
 */
export function readableFolderPath(value: string): string {
    if (!value.startsWith("content://")) return value;

    const id = documentId(value);
    if (!id) return decode(value);
    if (!value.startsWith(`content://${EXTERNAL_STORAGE}/`)) return id;

    const separator = id.indexOf(":");
    if (separator === -1) return id;

    const volume = id.slice(0, separator);
    const relative = id.slice(separator + 1);
    // « primary » est la mémoire interne ; tout le reste est une carte SD ou une
    // clé, montée sous son identifiant de volume.
    const root =
        volume === "primary" ? "/storage/emulated/0" : `/storage/${volume}`;

    return relative ? `${root}/${relative}` : root;
}

/** Le seul nom du dossier — ce que le doigt reconnaît dans une ligne de réglage,
    là où le chemin entier ne tiendrait pas. */
export function folderName(value: string): string {
    const path = readableFolderPath(value).replace(/[\\/]+$/, "");
    return path.split(/[\\/]/).pop() || value;
}
