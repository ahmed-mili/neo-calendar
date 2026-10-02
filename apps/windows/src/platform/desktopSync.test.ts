const invoke = jest.fn();
jest.mock(
    "@tauri-apps/api/core",
    () => ({ invoke: (...args: unknown[]) => invoke(...args) }),
    {
        virtual: true,
    }
);

import {
    deviceLine,
    loadSyncStatus,
    remainingLabel,
    startSyncSoon,
    statusLine,
    svgDataUrl,
    syncCommands,
    syncStamp,
    type SyncStatusDto,
} from "./desktopSync";
import { applyLanguage } from "../../../../src/ui/i18n";

const running = (patch: Partial<SyncStatusDto> = {}): SyncStatusDto => ({
    enabled: true,
    engineVersion: "2.1.5",
    state: { kind: "running" },
    myId: "ABC",
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

beforeEach(() => {
    invoke.mockReset();
    applyLanguage("fr");
});
afterEach(() => {
    jest.useRealTimers();
    applyLanguage("fr");
});

describe("loadSyncStatus", () => {
    it("rend l'état du moteur", async () => {
        invoke.mockResolvedValue(running());
        expect((await loadSyncStatus())?.engineVersion).toBe("2.1.5");
        expect(invoke).toHaveBeenCalledWith("sync_status");
    });

    it("rend null quand la commande n'existe pas (coque Android), jamais une erreur", async () => {
        invoke.mockRejectedValue(new Error("command sync_status not found"));
        await expect(loadSyncStatus()).resolves.toBeNull();
    });
});

describe("startSyncSoon", () => {
    it("ne démarre rien avant le délai, puis lance sync_start", () => {
        jest.useFakeTimers();
        invoke.mockResolvedValue(undefined);
        startSyncSoon("C:\\Neo Calendar", 1500);
        jest.advanceTimersByTime(1499);
        expect(invoke).not.toHaveBeenCalled();
        jest.advanceTimersByTime(2);
        expect(invoke).toHaveBeenCalledWith("sync_start", {
            dataFolder: "C:\\Neo Calendar",
        });
    });

    it("peut être annulé (la fenêtre se ferme avant)", () => {
        jest.useFakeTimers();
        const cancel = startSyncSoon("C:\\N", 1500);
        cancel();
        jest.advanceTimersByTime(5000);
        expect(invoke).not.toHaveBeenCalled();
    });

    it("ne lève jamais, même si invoke échoue ou lève sur-le-champ", () => {
        jest.useFakeTimers();
        invoke.mockImplementation(() => {
            throw new Error("pas de pont natif");
        });
        startSyncSoon("C:\\N", 10);
        expect(() => jest.advanceTimersByTime(20)).not.toThrow();
        invoke.mockReset().mockRejectedValue(new Error("refus"));
        startSyncSoon("C:\\N", 10);
        expect(() => jest.advanceTimersByTime(20)).not.toThrow();
    });
});

describe("syncCommands", () => {
    it("appelle les commandes Rust par leur nom et leurs arguments camelCase", async () => {
        invoke.mockResolvedValue(undefined);
        await syncCommands.enable("C:\\N");
        await syncCommands.acceptDevice("ABC");
        await syncCommands.takeOver("C:\\N", "20261002-190000");
        expect(invoke.mock.calls).toEqual([
            ["sync_enable", { dataFolder: "C:\\N" }],
            ["sync_accept_device", { deviceId: "ABC" }],
            [
                "sync_take_over",
                { dataFolder: "C:\\N", stamp: "20261002-190000" },
            ],
        ]);
    });
});

describe("syncStamp", () => {
    it("n'écrit que des chiffres et un tiret (le nom d'un fichier de sauvegarde)", () => {
        expect(syncStamp(new Date(2026, 9, 2, 19, 5, 7))).toBe(
            "20261002-190507"
        );
        expect(syncStamp(new Date(2026, 0, 3, 4, 5, 6))).toMatch(/^[0-9-]+$/);
    });
});

describe("svgDataUrl", () => {
    it("encode le SVG : aucun caractère de balise ne reste dans l'URL", () => {
        const url = svgDataUrl("<svg><script>alert(1)</script></svg>");
        expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(url).not.toMatch(/[<>"]/);
    });
});

describe("statusLine", () => {
    it("dit que la synchro est désactivée", () => {
        expect(statusLine(running({ enabled: false }))).toBe(
            "La synchronisation intégrée est désactivée"
        );
    });

    it("suit la priorité : moteur absent, bloqué, démarrage, échec, dossier en erreur, synchro, aucun appareil, hors ligne, à jour", () => {
        const line = (patch: Partial<SyncStatusDto>) =>
            statusLine(running(patch));
        expect(line({ state: { kind: "missing" } })).toContain("absent");
        expect(line({ state: { kind: "blockedByInstalled" } })).toContain(
            "Syncthing installé"
        );
        expect(line({ state: { kind: "starting" } })).toBe("Démarrage…");
        expect(
            line({
                state: {
                    kind: "backoff",
                    attempt: 2,
                    retryInMs: 4000,
                    error: "port pris",
                },
            })
        ).toBe("Erreur : port pris (nouvel essai dans 4 s)");
        expect(
            line({ state: { kind: "failed", error: "trop d'échecs" } })
        ).toBe("Erreur : trop d'échecs");
        expect(
            line({
                folder: {
                    id: "x",
                    path: "p",
                    state: "idle",
                    needFiles: 0,
                    error: "disque plein",
                },
            })
        ).toBe("Erreur : disque plein");
        expect(
            line({
                folder: {
                    id: "x",
                    path: "p",
                    state: "syncing",
                    needFiles: 1,
                    error: "",
                },
            })
        ).toBe("Synchronisation en cours (1 fichier)");
        expect(
            line({
                folder: {
                    id: "x",
                    path: "p",
                    state: "idle",
                    needFiles: 3,
                    error: "",
                },
            })
        ).toBe("Synchronisation en cours (3 fichiers)");
        expect(line({ devices: [] })).toBe("Aucun appareil");
        expect(
            line({
                devices: [
                    {
                        id: "T",
                        name: "Pixel",
                        connected: false,
                        lastSeen: null,
                    },
                ],
            })
        ).toBe("Hors ligne : aucun appareil connecté");
        expect(line({})).toBe("À jour");
    });

    it("démarre quand le moteur tourne mais que le dossier n'est pas encore lu", () => {
        expect(statusLine(running({ folder: null }))).toBe("Démarrage…");
    });
});

describe("deviceLine", () => {
    it("distingue connecté, jamais connecté et dernière connexion", () => {
        expect(
            deviceLine({ id: "a", name: "a", connected: true, lastSeen: null })
        ).toBe("Connecté");
        expect(
            deviceLine({ id: "a", name: "a", connected: false, lastSeen: null })
        ).toBe("Jamais connecté");
        expect(
            deviceLine({
                id: "a",
                name: "a",
                connected: false,
                lastSeen: "pas une date",
            })
        ).toBe("Jamais connecté");
        expect(
            deviceLine({
                id: "a",
                name: "a",
                connected: false,
                lastSeen: "2026-10-02T10:30:00Z",
            })
        ).toMatch(/^Dernière connexion 02\/10\/2026/);
    });
});

describe("remainingLabel", () => {
    it("écrit minutes et secondes, jamais négatif", () => {
        expect(remainingLabel(300_000)).toBe("5 min 00 s");
        expect(remainingLabel(252_300)).toBe("4 min 13 s");
        expect(remainingLabel(-5)).toBe("0 min 00 s");
    });
});
