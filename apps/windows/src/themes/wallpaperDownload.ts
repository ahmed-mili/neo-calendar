/*
 * Chercher un fond d'écran quand on le choisit, et pas avant.
 *
 * Les pleines résolutions ne sont plus dans l'APK : dix mégaoctets de photos y
 * représentaient 72% de chaque mise à jour, pour des fichiers qui ne changent
 * jamais. Les vignettes et le manifeste y restent — 552 Ko —, ce qui laisse le
 * sélecteur s'ouvrir instantanément et hors ligne ; seule l'image réellement
 * choisie est téléchargée, une fois, dans le dossier de données.
 *
 * En lot ça ne tiendrait pas : à cent fonds, tout prendre ferait quarante
 * mégaoctets pour en utiliser un.
 */

/** Le dépôt est public et les images y sont déjà : aucune release à produire,
    et un fond ajouté est disponible dès qu'il est poussé. */
const SOURCE =
    "https://raw.githubusercontent.com/ahmed-mili/neo-calendar/main/apps/windows/public/themes/neo-wallpapers/";

const MANIFEST_URL = "/themes/neo-wallpapers/wallpapers.json";
const DONE_EVENT = "neo-wallpaper-done";

/** Émis quand un fond manquant vient d'arriver, pour que ce qui l'attendait
    cesse de se rabattre sur le fond du thème. */
export const WALLPAPER_READY_EVENT = "neo-wallpaper-ready";

interface ManifestEntry {
    id: string;
    file: string;
    sha256: string;
}

interface Bridge {
    installedWallpapers?: () => string;
    downloadWallpaper?: (name: string, url: string, sha256: string) => void;
}

function bridge(): Bridge | null {
    if (typeof window === "undefined") return null;
    return (window as Window & { NeoAndroid?: Bridge }).NeoAndroid ?? null;
}

/** Là où il n'y a pas de coque Android — le bureau — les images sont livrées
    avec l'application et il n'y a rien à aller chercher. */
export function needsDownloading(): boolean {
    const host = bridge();
    return (
        typeof host?.downloadWallpaper === "function" &&
        typeof host?.installedWallpapers === "function"
    );
}

/** Le nom de fichier porté par une URL de fond. */
export function fileNameOf(imageUrl: string): string {
    return imageUrl.slice(imageUrl.lastIndexOf("/") + 1);
}

/** La vignette qui correspond à une pleine résolution.
 *
 *  Le sélecteur n'affiche QUE des vignettes : à 23 Ko pièce, parcourir cent
 *  fonds coûte 2,3 Mo au lieu des 44 Mo que coûteraient les originaux. */
export function thumbUrlOf(imageUrl: string): string {
    const slash = imageUrl.lastIndexOf("/");
    return `${imageUrl.slice(0, slash)}/thumbs/${imageUrl.slice(slash + 1)}`;
}

let manifest: Promise<Map<string, ManifestEntry>> | null = null;

function loadManifest(): Promise<Map<string, ManifestEntry>> {
    if (manifest) return manifest;
    manifest = fetch(MANIFEST_URL)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
            const map = new Map<string, ManifestEntry>();
            const list: ManifestEntry[] = data?.wallpapers ?? [];
            for (const entry of list) map.set(entry.file, entry);
            return map;
        })
        .catch(() => new Map<string, ManifestEntry>());
    return manifest;
}

function installed(): Set<string> {
    try {
        const raw = bridge()?.installedWallpapers?.();
        return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set<string>();
    }
}

/** Ceux qui sont déjà dans le dossier, pour que le sélecteur les distingue. */
export function installedFiles(): Set<string> {
    return needsDownloading() ? installed() : new Set<string>();
}

/** Ce fond est-il affichable tout de suite ? Sur le bureau, toujours. */
export function isReady(imageUrl: string | null): boolean {
    if (!imageUrl || !needsDownloading()) return true;
    return installed().has(fileNameOf(imageUrl));
}

const fetching = new Set<string>();

/**
 * Rapatrier le fond DÉJÀ choisi s'il n'est pas là, en arrière-plan.
 *
 * Une mise à jour arrive avec un choix fait de longue date et un dossier
 * peut-être vide — celui de quelqu'un qui avait pris sa photo du temps où elle
 * voyageait dans l'APK. Lui rendre un fond blanc en attendant qu'il pense à le
 * rechoisir serait le punir d'avoir mis l'application à jour : on va le
 * chercher une fois, sans rien demander, et on prévient quand il est là.
 *
 * Un échec n'est pas réessayé en boucle : le sélecteur reste le chemin explicite.
 */
export function ensureSelected(imageUrl: string | null): void {
    if (isReady(imageUrl) || !imageUrl) return;

    const name = fileNameOf(imageUrl);
    if (fetching.has(name)) return;
    fetching.add(name);

    ensureWallpaper(imageUrl)
        .then(() => {
            window.dispatchEvent(
                new CustomEvent(WALLPAPER_READY_EVENT, { detail: { name } })
            );
        })
        .catch(() => {
            // Silencieux : personne n'a rien demandé, et un fond de thème est
            // une chute correcte. Le sélecteur, lui, dira l'échec.
        });
}

/**
 * S'assurer qu'un fond est présent, en le téléchargeant si besoin.
 *
 * Résout quand l'image est là. Rejette si elle n'a pas pu être obtenue — au
 * choisisseur de le dire, plutôt que d'appliquer un fond qui s'affichera vide.
 */
export function ensureWallpaper(imageUrl: string): Promise<void> {
    if (!needsDownloading()) return Promise.resolve();

    const name = fileNameOf(imageUrl);
    if (installed().has(name)) return Promise.resolve();

    return loadManifest().then(
        (entries) =>
            new Promise<void>((resolve, reject) => {
                const entry = entries.get(name);
                const finish = (event: Event) => {
                    const detail = (
                        event as CustomEvent<{ name?: string; error?: string }>
                    ).detail;
                    if (detail?.name !== name) return;
                    window.removeEventListener(DONE_EVENT, finish);
                    if (detail.error) reject(new Error(detail.error));
                    else resolve();
                };
                window.addEventListener(DONE_EVENT, finish);
                bridge()?.downloadWallpaper?.(
                    name,
                    SOURCE + name,
                    entry?.sha256 ?? ""
                );
            })
    );
}
