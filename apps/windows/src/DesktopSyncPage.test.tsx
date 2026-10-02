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
import { applyLanguage } from "../../../src/ui/i18n";

const noop = () => undefined;
const actions: SyncPageActions = {
    toggle: noop,
    startPairing: noop,
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
    it("dit en une phrase qui synchronise, l'état, les appareils, et garde le lien Syncthing en bas", () => {
        const html = view();
        expect(html).toContain(
            "synchronisé par Neo Calendar (Syncthing intégré v2.1.5)"
        );
        expect(html).toContain("À jour");
        expect(html).toContain("Pixel 8");
        expect(html).toContain("Connecté");
        expect(html).toContain("Ajouter le téléphone");
        expect(html).toContain("LIGNE-DOSSIER");
        expect(html).toContain('aria-label="Syncthing"');
        expect(html).toContain('href="https://syncthing.net"');
        // Le bouton principal de la page est à la couleur d'accent, et nul libellé ne dit « Recommandé ».
        expect(html).toContain("nc-sync-primary");
        expect(html).not.toContain("Recommandé");
        expect(html).toContain("En savoir plus");
        // L'identifiant complet reste consultable, dans « Détails » seulement.
        expect(html).toContain("7ZSUPCU-MIU3GEY");
    });

    it("désactivée : ni appareils ni bouton d'ajout", () => {
        const html = view({
            status: status({ enabled: false, state: { kind: "stopped" } }),
        });
        expect(html).toContain("désactivée");
        expect(html).not.toContain("Ajouter le téléphone");
        expect(html).not.toContain("Appareils");
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
        expect(html).toContain(
            "synchronisé par le Syncthing installé sur ce PC"
        );
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
        expect(html).toContain("synchronisé par Neo Calendar");
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

    it("la fenêtre d'appairage montre le QR en image (jamais du SVG inséré tel quel) et le temps restant", () => {
        const html = view({
            pairing: {
                qrSvg: "<svg><script>alert(1)</script></svg>",
                expiresInMs: 300_000,
            },
            status: status({ pairingRemainingMs: 252_000 }),
        });
        expect(html).toContain("<img");
        expect(html).toContain("data:image/svg+xml");
        expect(html).not.toContain("<script");
        expect(html).toContain("4 min 12 s");
        expect(html).toContain("ne sert qu&#x27;une fois");
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

    it("désactivée, la phrase ne prétend pas que Neo Calendar synchronise le dossier", () => {
        const html = view({
            status: status({ enabled: false, state: { kind: "stopped" } }),
        });
        expect(html).not.toContain("synchronisé par Neo Calendar");
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
