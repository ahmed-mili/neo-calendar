import {
    appVersion,
    canCheckForUpdates,
    requestUpdateCheck,
} from "./appUpdates";

/* Les tests tournent en environnement `node` (voir jest.config.js) : il n'y a
   pas de `window`, ce qui est exactement l'un des cas a couvrir — le module est
   aussi charge par le bundle de bureau. On le pose donc a la main, et on le
   retire pour verifier que l'absence ne jette pas. */
type BridgeHost = { NeoAndroid?: { checkForUpdates?: unknown } };

const global = globalThis as { window?: BridgeHost };

const withWindow = (bridge?: BridgeHost["NeoAndroid"]) => {
    global.window = bridge === undefined ? {} : { NeoAndroid: bridge };
};

afterEach(() => {
    delete global.window;
});

describe("appVersion", () => {
    const stamped = globalThis as { __NEO_VERSION__?: string };

    it("rend la version posee au build", () => {
        // jest.config.js pose __NEO_VERSION__ depuis le package.json, comme les
        // deux configs Vite le font pour les vrais bundles.
        expect(appVersion()).toBe(require("../../../package.json").version);
    });

    /* Le cas qui justifie la forme du helper : un bundle qui ne pose PAS la
       constante. Nommer un identifiant non declare jette ; `typeof` sur le meme
       identifiant ne jette pas. C'est la seule raison pour laquelle la lecture
       passe par `typeof` plutot que par une comparaison directe. */
    it("rend une chaine vide, sans jeter, quand rien n'a ete pose", () => {
        const saved = stamped.__NEO_VERSION__;
        delete stamped.__NEO_VERSION__;
        try {
            expect(appVersion()).toBe("");
        } finally {
            stamped.__NEO_VERSION__ = saved;
        }
    });
});

describe("canCheckForUpdates", () => {
    it("est faux quand il n'y a meme pas de window", () => {
        expect(canCheckForUpdates()).toBe(false);
    });

    it("est faux sans pont", () => {
        withWindow();
        expect(canCheckForUpdates()).toBe(false);
    });

    /* Une coque plus ancienne porte un pont SANS cette methode. C'est pour ce
       cas precis que la detection porte sur la methode et non sur la
       plateforme : appeler ce qui n'existe pas jette dans la WebView. */
    it("est faux quand le pont existe mais n'a pas la methode", () => {
        withWindow({});
        expect(canCheckForUpdates()).toBe(false);
    });

    it("est vrai quand la methode est la", () => {
        withWindow({ checkForUpdates: () => undefined });
        expect(canCheckForUpdates()).toBe(true);
    });
});

describe("requestUpdateCheck", () => {
    it("appelle la coque et le dit", () => {
        const checkForUpdates = jest.fn();
        withWindow({ checkForUpdates });
        expect(requestUpdateCheck()).toBe(true);
        expect(checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it("rend faux sans pont, sans jeter", () => {
        withWindow();
        expect(requestUpdateCheck()).toBe(false);
    });

    /* Le pont traverse la frontiere WebView/Java : un echec la-bas remonte en
       exception ici. Le bouton doit rendre la main, pas casser le panneau. */
    it("avale une erreur venue du pont", () => {
        withWindow({
            checkForUpdates: () => {
                throw new Error("bridge is gone");
            },
        });
        expect(requestUpdateCheck()).toBe(false);
    });
});
