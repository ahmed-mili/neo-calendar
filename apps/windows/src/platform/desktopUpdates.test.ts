import { invoke } from "@tauri-apps/api/core";
import { checkDesktopUpdates, installPendingUpdate } from "./desktopUpdates";

// Tout specificateur @tauri-apps tombe sur un même bouchon qui lève à l'appel.
// N'y échapper que pour `invoke`, réutilisé sur les deux commandes.
jest.mock("@tauri-apps/api/core", () => {
    const original = jest.requireActual("@tauri-apps/api/core");
    const allowed = { invoke: jest.fn() };
    return new Proxy(allowed, {
        get(target, key) {
            return key in target
                ? target[key as keyof typeof target]
                : original[key];
        },
    });
});

beforeEach(() => jest.clearAllMocks());

const invokeMock = invoke as jest.Mock;

test("une recherche manuelle ne lance pas l'installation", async () => {
    invokeMock.mockResolvedValue("current");
    await expect(checkDesktopUpdates()).resolves.toBe("current");
    expect(invokeMock).toHaveBeenCalledWith("check_desktop_updates");
    expect(invokeMock).not.toHaveBeenCalledWith("install_pending_update");
});

test("relaie chaque issue de la recherche telle quelle", async () => {
    for (const outcome of ["ready", "current", "busy"] as const) {
        invokeMock.mockResolvedValueOnce(outcome);
        await expect(checkDesktopUpdates()).resolves.toBe(outcome);
    }
});

test("propage une recherche en échec plutôt que de l'avaler", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network down"));
    await expect(checkDesktopUpdates()).rejects.toThrow("network down");
});

test("l'installation appelle sa propre commande, distincte de la recherche", async () => {
    invokeMock.mockResolvedValue(undefined);
    await installPendingUpdate();
    expect(invokeMock).toHaveBeenCalledWith("install_pending_update");
    expect(invokeMock).not.toHaveBeenCalledWith("check_desktop_updates");
});
