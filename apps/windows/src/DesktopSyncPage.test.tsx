import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }), {
    virtual: true,
});

import DesktopSyncPage, {
    SyncPageView,
    type SyncPageActions,
    type SyncPageViewProps,
} from "./DesktopSyncPage";
import type { SyncStatusDto } from "./platform/desktopSync";
import { createStatusReader } from "./platform/desktopSync";
import { applyLanguage } from "../../../src/ui/i18n";

const noop = () => undefined;
const actions: SyncPageActions = {
    toggle: noop,
    startPairing: noop,
    openAdd: noop,
    closeAdd: noop,
    addDevice: () => Promise.resolve(),
    closePairing: noop,
    askDevice: noop,
    askRequest: noop,
    retry: noop,
    repoint: noop,
    recheck: noop,
    askTakeOver: noop,
    askGiveBack: noop,
    showLog: noop,
    toggleStartup: noop,
    copyId: async () => true,
};

const status = (patch: Partial<SyncStatusDto> = {}): SyncStatusDto => ({
    enabled: true,
    engineVersion: "2.1.5",
    state: { kind: "running" },
    myId: "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX",
    folderPath: "C:\\Neo Calendar",
    folder: {
        id: "neo-x",
        path: "C:\\Neo Calendar",
        state: "idle",
        needFiles: 0,
        error: "",
    },
    devices: [{ id: "T", name: "Pixel 8", connected: true, lastSeen: null }],
    pending: [],
    mismatch: null,
    pairingRemainingMs: null,
    takenOver: false,
    pairingError: null,
    deviceName: null,
    ...patch,
});

const view = (
    patch: Partial<SyncPageViewProps> & { status?: SyncStatusDto } = {}
) =>
    renderToStaticMarkup(
        <SyncPageView
            status={status()}
            detection={null}
            pairing={null}
            adding={false}
            startup={true}
            busy={false}
            error={null}
            dataFolderRow={<div>LIGNE-DOSSIER</div>}
            actions={actions}
            {...patch}
        />
    );

beforeEach(() => applyLanguage("fr"));
afterEach(() => applyLanguage("fr"));

describe("page Synchronisation du PC", () => {
    it("montre l'état, le bouton Afficher mon ID, Ajouter un appareil, Vos appareils, et garde le lien Syncthing en bas", () => {
        const html = view();
        expect(html).toContain("À jour");
        expect(html).toContain("Garde vos notes identiques");
        expect(html).toContain("Afficher mon ID");
        expect(html).toContain("nc-sync-show-id");
        // L'identifiant n'est plus sur la page : il vit dans la fenêtre « Mon ID ».
        expect(html).not.toContain("7ZSUPCU-MIU3GEY");
        expect(html).not.toContain("Partager");
        expect(html).toContain("Ajouter un appareil");
        expect(html).toContain("Mes appareils");
        expect(html).toContain("Pixel 8");
        expect(html).toContain("Connecté");
        expect(html).toContain("LIGNE-DOSSIER");
        expect(html).toContain("Lancer au démarrage de Windows");
        expect(html).toContain("Journal");
        expect(html).toContain('aria-label="Syncthing"');
        expect(html).toContain('href="https://syncthing.net"');
        // « Ajouter un appareil » vit dans « Vos appareils », sous la liste, en bouton discret.
        expect(html.indexOf("Ajouter un appareil")).toBeGreaterThan(
            html.indexOf("Pixel 8")
        );
        expect(html).toContain("nc-sync-add");
        expect(html).toContain("En savoir plus");
        // L'ancienne ligne du bas et le QR permanent n'existent plus.
        expect(html).not.toContain("Identifiant de ce PC");
        expect(html).not.toContain("<img");
    });

    it("sans appareil : « Aucun appareil » en état et dans un cadre", () => {
        const html = view({ status: status({ devices: [] }) });
        expect(html).toContain("Aucun appareil");
        expect(html).toContain("Aucun appareil pour l&#x27;instant.");
        expect(html).toContain("nc-sync-empty");
    });

    it("désactivée : ni « Afficher mon ID », ni bouton d'ajout, ni appareils, mais l'interrupteur reste", () => {
        const html = view({
            status: status({ enabled: false, state: { kind: "stopped" } }),
        });
        expect(html).toContain("désactivée");
        expect(html).toContain("Synchronisation intégrée");
        expect(html).not.toContain("Ajouter un appareil");
        expect(html).not.toContain("Mes appareils");
        expect(html).not.toContain("Afficher mon ID");
    });

    it("propose la reprise d'un Syncthing installé qui tourne, jamais automatiquement", () => {
        const html = view({
            status: status({ state: { kind: "blockedByInstalled" } }),
            detection: {
                kind: "shares",
                folderId: "neo-old",
                label: "Neo",
                running: true,
                tls: false,
                otherFolders: 1,
            },
        });
        expect(html).toContain("Reprendre le dossier");
        expect(html).toContain(
            "Seul le dossier Neo Calendar quitte votre Syncthing"
        );
    });

    it("Syncthing installé arrêté ou en HTTPS : pas de reprise, une explication et « Vérifier à nouveau »", () => {
        const stopped = view({
            detection: {
                kind: "shares",
                folderId: "x",
                label: "N",
                running: false,
                tls: false,
                otherFolders: 0,
            },
        });
        expect(stopped).toContain("Lancez votre Syncthing");
        expect(stopped).toContain("Vérifier à nouveau");
        expect(stopped).not.toContain("Reprendre le dossier");
        const tls = view({
            detection: {
                kind: "shares",
                folderId: "x",
                label: "N",
                running: false,
                tls: true,
                otherFolders: 0,
            },
        });
        expect(tls).toContain("HTTPS");
        expect(tls).not.toContain("Reprendre le dossier");
    });

    it("montre telle quelle la raison pour laquelle le Syncthing installé ne peut pas être repris", () => {
        const html = view({
            detection: {
                kind: "shares",
                folderId: "x",
                label: "N",
                running: false,
                tls: false,
                otherFolders: 0,
                reason: "L'interface de ce Syncthing n'écoute pas sur la machine locale (192.168.1.5:8384).",
            },
        });
        expect(html).toContain("192.168.1.5:8384");
        expect(html).toContain("Vérifier à nouveau");
        expect(html).not.toContain("Reprendre le dossier");
    });

    it("un marqueur orphelin n'est pas un conflit : aucun Syncthing ne partage, aucune proposition", () => {
        const html = view({ detection: { kind: "notSharing" } });
        expect(html).not.toContain("Reprendre le dossier");
    });

    it("les demandes entrantes se lisent par leur nom, sans code", () => {
        const html = view({
            status: status({
                pending: [
                    {
                        id: "ABCDEFGHIJ",
                        name: "Pixel 8",
                        address: "192.168.1.9:22000",
                    },
                ],
            }),
        });
        expect(html).toContain("Demandes à accepter");
        expect(html).toContain("Pixel 8");
        expect(html).toContain("demande à se connecter");
        expect(html).not.toContain("[NC:");
    });

    it("« Identifiant de l'appareil » : titre avec le nom, l'ID sur une ligne, QR en image, barre, aucune phrase d'aide", () => {
        const html = view({
            pairing: {
                qrSvg: "<svg><script>alert(1)</script></svg>",
                myId: "7ZSUPCU-MIU3GEY",
                refreshInMs: 25_000,
            },
            status: status({
                pairingRemainingMs: 90_000,
                deviceName: "DESKTOP-1U89520",
            }),
        });
        expect(html).toContain(
            "Identifiant de l&#x27;appareil - DESKTOP-1U89520"
        );
        expect(html).toContain("nc-choice-dialog__title-icon");
        expect(html).toContain("<code>7ZSUPCU-MIU3GEY-RKFNTSV");
        expect(html).toContain("Copier");
        expect(html).toContain("<img");
        expect(html).toContain("data:image/svg+xml");
        expect(html).not.toContain("<script");
        expect(html).toContain("animation-duration:25000ms");
        expect(html).not.toContain("Nouveau QR code");
        expect(html).not.toContain("Sur votre autre appareil");
        expect(html).not.toContain("nc-sync-pc-name");
    });

    it("sans nom connu, le titre est « Identifiant de l'appareil » tout court", () => {
        const html = view({
            pairing: { qrSvg: "<svg/>", myId: "A-B", refreshInMs: 2000 },
        });
        expect(html).toContain(">Identifiant de l&#x27;appareil</h2>");
    });

    it("« Ajouter un appareil » : phrase d'aide, un champ, Annuler et Ajouter, sans nom ni scan", () => {
        const html = view({ adding: true });
        expect(html).toContain("Sur l&#x27;autre appareil, ouvre Réglages");
        expect(html).toContain("Identifiant de l&#x27;autre appareil");
        expect(html).not.toContain("Nom (facultatif)");
        expect(html).toContain("Annuler");
        expect(html).toContain("Ajouter</button>");
        expect(html).not.toContain("<img");
    });

    it("un dossier de données changé propose de synchroniser le dossier actuel", () => {
        const html = view({ status: status({ mismatch: "C:\\Ancien" }) });
        expect(html).toContain("C:\\Ancien");
        expect(html).toContain("Synchroniser le dossier actuel");
    });

    it("une reprise faite propose de rendre le dossier à Syncthing", () => {
        expect(view({ status: status({ takenOver: true }) })).toContain(
            "Rendre le dossier à Syncthing"
        );
        expect(view()).not.toContain("Rendre le dossier à Syncthing");
    });

    it("un appairage qui a échoué après la lecture du code le dit, sans le code", () => {
        const html = view({
            status: status({
                pairingError: "L'appairage a échoué : générez un nouveau code.",
            }),
        });
        expect(html).toContain("générez un nouveau code");
    });

    it("un moteur abandonné propose de réessayer", () => {
        const html = view({
            status: status({ state: { kind: "failed", error: "port pris" } }),
        });
        expect(html).toContain("Erreur : port pris");
        expect(html).toContain("Réessayer");
    });
});

describe("contenant", () => {
    it("avant la première lecture, il ne montre que la ligne du dossier (ni clignotement de l'ancienne page, ni page vide)", () => {
        const html = renderToStaticMarkup(
            <DesktopSyncPage
                dataFolder="C:\\N"
                dataFolderRow={<div>LIGNE-DOSSIER</div>}
                fallback={<div>ANCIENNE-PAGE</div>}
            />
        );
        expect(html).toContain("LIGNE-DOSSIER");
        expect(html).not.toContain("ANCIENNE-PAGE");
    });

    it("là où le moteur intégré n'existe pas (coque Android), la page garde ce qu'elle montrait", () => {
        const html = renderToStaticMarkup(
            <DesktopSyncPage
                dataFolder="C:\\N"
                dataFolderRow={<div>LIGNE-DOSSIER</div>}
                fallback={<div>ANCIENNE-PAGE</div>}
                initialStatus={null}
            />
        );
        expect(html).toContain("ANCIENNE-PAGE");
    });
});

describe("lecture périodique de l'état", () => {
    const running = status();

    it("une erreur passagère après une lecture réussie garde l'état et la cadence", async () => {
        const seen: Array<SyncStatusDto | null> = [];
        const loads = [status({ state: { kind: "starting" } }), null, running];
        const reader = createStatusReader(
            async () => loads.shift() ?? null,
            (next) => seen.push(next)
        );
        await reader.read();
        await reader.read();
        expect(reader.isUnavailable()).toBe(false);
        await reader.read();
        expect(seen.map((one) => one?.state.kind)).toEqual([
            "starting",
            "running",
        ]);
    });

    it("l'absence dès la première lecture (coque Android) arrête les lectures", async () => {
        const seen: Array<SyncStatusDto | null> = [];
        const reader = createStatusReader(
            async () => null,
            (next) => seen.push(next)
        );
        await reader.read();
        expect(reader.isUnavailable()).toBe(true);
        expect(seen).toEqual([null]);
    });

    it("une seule lecture à la fois : une réponse ancienne n'écrase pas une plus récente", async () => {
        const releases: Array<(value: SyncStatusDto) => void> = [];
        let calls = 0;
        const seen: string[] = [];
        const reader = createStatusReader(
            () => {
                calls += 1;
                return new Promise<SyncStatusDto>((resolve) =>
                    releases.push(resolve)
                );
            },
            (next) => seen.push(next?.state.kind ?? "null")
        );
        const first = reader.read();
        void reader.read();
        void reader.read();
        expect(calls).toBe(1);
        releases[0](status({ state: { kind: "starting" } }));
        await first;
        const second = reader.read();
        expect(calls).toBe(2);
        releases[1](running);
        await second;
        expect(seen).toEqual(["starting", "running"]);
    });
});
