/*
 * Ce que le téléchargement à la demande doit tenir.
 *
 * Le module parle à la coque Android par un pont synchrone et attend la réponse
 * par un événement : c'est exactement le genre d'aller-retour qu'on ne voit pas
 * casser à l'œil, et qui, cassé, laisse l'application appliquer un fond qui
 * n'est pas encore arrivé — donc un écran vide.
 */

interface FakeBridge {
    installedWallpapers?: () => string;
    downloadWallpaper?: (name: string, url: string, sha256: string) => void;
}

const IMAGE = "/themes/neo-wallpapers/alpine-crown.jpg";

/** Une fenêtre juste assez réelle : le module n'utilise d'elle que les
    événements, et le pont qu'elle porte. */
function makeWindow(bridge: FakeBridge | null) {
    const target = new EventTarget();
    return {
        NeoAndroid: bridge ?? undefined,
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
    };
}

/** Chaque test recharge le module : il garde en mémoire le manifeste déjà lu et
    les téléchargements en cours, et ces caches ne doivent pas fuir d'un cas à
    l'autre. */
function load(bridge: FakeBridge | null) {
    let module!: typeof import("./wallpaperDownload");
    jest.isolateModules(() => {
        (globalThis as { window?: unknown }).window = makeWindow(bridge);
        module = require("./wallpaperDownload");
    });
    return module;
}

function fakeFetch(sha256 = "abc123") {
    return jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            format: 1,
            wallpapers: [
                { id: "alpine-crown", file: "alpine-crown.jpg", sha256 },
            ],
        }),
    });
}

afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    jest.restoreAllMocks();
});

describe("un fond d'écran cherché au moment où on le choisit", () => {
    it("lit la vignette et non la pleine résolution", () => {
        const { thumbUrlOf } = load(null);

        expect(thumbUrlOf(IMAGE)).toBe(
            "/themes/neo-wallpapers/thumbs/alpine-crown.jpg"
        );
    });

    // Sur le bureau les images sont livrées avec l'application : il n'y a pas de
    // pont, donc rien à aller chercher et rien à faire attendre.
    it("ne demande rien hors d'Android", async () => {
        const { needsDownloading, isReady, ensureWallpaper } = load(null);

        expect(needsDownloading()).toBe(false);
        expect(isReady(IMAGE)).toBe(true);
        await expect(ensureWallpaper(IMAGE)).resolves.toBeUndefined();
    });

    it("ne retélécharge pas ce qui est déjà dans le dossier", async () => {
        const downloadWallpaper = jest.fn();
        const { ensureWallpaper, isReady } = load({
            installedWallpapers: () => JSON.stringify(["alpine-crown.jpg"]),
            downloadWallpaper,
        });

        expect(isReady(IMAGE)).toBe(true);
        await expect(ensureWallpaper(IMAGE)).resolves.toBeUndefined();
        expect(downloadWallpaper).not.toHaveBeenCalled();
    });

    it("passe au pont l'empreinte annoncée par le manifeste", async () => {
        global.fetch = fakeFetch("deadbeef") as unknown as typeof fetch;
        const downloadWallpaper = jest.fn();
        const { ensureWallpaper } = load({
            installedWallpapers: () => "[]",
            downloadWallpaper,
        });

        const pending = ensureWallpaper(IMAGE);
        await flush();

        expect(downloadWallpaper).toHaveBeenCalledWith(
            "alpine-crown.jpg",
            expect.stringContaining("neo-wallpapers/alpine-crown.jpg"),
            "deadbeef"
        );

        done("alpine-crown.jpg", "");
        await expect(pending).resolves.toBeUndefined();
    });

    // La promesse doit rejeter plutôt que tenir : appliquer un fond qui n'est
    // pas arrivé donne un écran vide et aucune explication.
    it("rejette quand la coque signale un échec", async () => {
        global.fetch = fakeFetch() as unknown as typeof fetch;
        const { ensureWallpaper } = load({
            installedWallpapers: () => "[]",
            downloadWallpaper: () => undefined,
        });

        const pending = ensureWallpaper(IMAGE);
        await flush();
        done("alpine-crown.jpg", "checksum");

        await expect(pending).rejects.toThrow("checksum");
    });

    // Deux fonds peuvent être en vol ; chacun n'écoute que le sien.
    it("ignore la fin d'un autre téléchargement", async () => {
        global.fetch = fakeFetch() as unknown as typeof fetch;
        const { ensureWallpaper } = load({
            installedWallpapers: () => "[]",
            downloadWallpaper: () => undefined,
        });

        let settled = false;
        const pending = ensureWallpaper(IMAGE).then(() => {
            settled = true;
        });
        await flush();

        done("dolomite-dawn.jpg", "");
        await flush();
        expect(settled).toBe(false);

        done("alpine-crown.jpg", "");
        await pending;
        expect(settled).toBe(true);
    });

    it("tient un fond manquant pour non affichable", () => {
        const { isReady } = load({
            installedWallpapers: () => "[]",
            downloadWallpaper: () => undefined,
        });

        expect(isReady(IMAGE)).toBe(false);
        // Le fond du thème n'est pas un fichier : il est toujours prêt.
        expect(isReady(null)).toBe(true);
    });
});

/** Laisser retomber tout ce qui est en attente : la lecture du manifeste passe
    par plusieurs promesses avant que le pont ne soit appelé. */
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

/** La réponse que la coque Android renvoie à la page. */
function done(name: string, error: string) {
    (
        globalThis as { window: { dispatchEvent: (e: Event) => void } }
    ).window.dispatchEvent(
        new CustomEvent("neo-wallpaper-done", { detail: { name, error } })
    );
}
