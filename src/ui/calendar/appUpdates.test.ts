import {
    appVersion,
    canCheckForUpdates,
    requestUpdateCheck,
} from "./appUpdates";

/* Les tests tournent en environnement `node` (voir jest.config.js) : il n'y a
   pas de `window`, ce qui est exactement l'un des cas a couvrir — le module est
   aussi charge par le bundle de bureau. On le pose donc a la main, et on le
   retire pour verifier que l'absence ne jette pas. */
type BridgeHost = {
    NeoAndroid?: {
        checkForUpdates?: unknown;
        pendingUpdate?: unknown;
        installPendingUpdate?: unknown;
    };
    dispatchEvent?: unknown;
};

const global = globalThis as { window?: BridgeHost };

const withWindow = (bridge?: BridgeHost["NeoAndroid"]) => {
    const host: BridgeHost = { dispatchEvent: () => true };
    if (bridge !== undefined) host.NeoAndroid = bridge;
    global.window = host;
};

/* L'etat du module — la version ramenee par le bureau, et de quoi la poser —
   vit dans le module. Chaque test en prend donc un exemplaire neuf, sinon le
   premier a enregistrer un installateur le laisserait aux suivants. */
const freshModule = () => {
    let module!: typeof import("./appUpdates");
    jest.isolateModules(() => {
        module = require("./appUpdates");
    });
    return module;
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

describe("poser la mise a jour deja descendue", () => {
    /* Le telephone la tient dans sa coque : le pont fait tout, et la fenetre
       n'a qu'a le dire. */
    it("passe par le pont quand la coque l'a", () => {
        const installPendingUpdate = jest.fn();
        withWindow({ installPendingUpdate });
        expect(freshModule().installPendingUpdate()).toBe(true);
        expect(installPendingUpdate).toHaveBeenCalledTimes(1);
    });

    /* Le bureau n'a pas de pont du tout : il enregistre ce qui pose la sienne,
       et le meme appel y aboutit. C'est ce qui permet au controle d'ignorer ou
       il tourne. */
    it("retombe sur ce que le bureau a enregistre", () => {
        withWindow();
        const module = freshModule();
        const install = jest.fn();
        module.setUpdateInstaller(install);
        expect(module.installPendingUpdate()).toBe(true);
        expect(install).toHaveBeenCalledTimes(1);
    });

    it("rend faux quand personne ne sait poser quoi que ce soit", () => {
        withWindow();
        expect(freshModule().installPendingUpdate()).toBe(false);
    });

    /* Une coque qui jette est une coque qui n'a rien pose : le controle doit
       pouvoir le dire plutot que de laisser l'erreur remonter dans le rendu. */
    it("avale une erreur venue du pont", () => {
        withWindow({
            installPendingUpdate: () => {
                throw new Error("pont casse");
            },
        });
        expect(freshModule().installPendingUpdate()).toBe(false);
    });
});

describe("la version que le bureau a ramenee", () => {
    /* Sans pont il n'y a personne a qui demander ce qui attend : ce que le
       bureau a dit est la seule reponse, et c'est celle-la qu'on rend. */
    it("est ce que rend pendingUpdateVersion sur le bureau", () => {
        withWindow();
        const module = freshModule();
        expect(module.pendingUpdateVersion()).toBe("");
        module.noteDownloadedUpdate("1.50.0");
        expect(module.pendingUpdateVersion()).toBe("1.50.0");
    });

    /* Sur le telephone c'est la coque qui sait, et elle a le dernier mot. */
    it("cede le pas a ce que la coque repond", () => {
        withWindow({ pendingUpdate: () => "1.51.0" });
        const module = freshModule();
        module.noteDownloadedUpdate("1.50.0");
        expect(module.pendingUpdateVersion()).toBe("1.51.0");
    });
});
