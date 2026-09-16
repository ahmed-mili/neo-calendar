const enable = jest.fn();
const disable = jest.fn();
const isEnabled = jest.fn();

jest.mock(
    "@tauri-apps/plugin-autostart",
    () => ({ enable, disable, isEnabled }),
    { virtual: true }
);

import { isStartupEnabled, setStartupEnabled } from "./desktopAutostart";

describe("le démarrage automatique", () => {
    beforeEach(() => {
        enable.mockReset().mockResolvedValue(undefined);
        disable.mockReset().mockResolvedValue(undefined);
        isEnabled.mockReset().mockResolvedValue(false);
    });

    it("reads its state from the registry, not from a preference", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(isStartupEnabled()).resolves.toBe(true);
    });

    it("writes, then reads back what actually took", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(setStartupEnabled(true)).resolves.toBe(true);
        expect(enable).toHaveBeenCalledTimes(1);
        expect(disable).not.toHaveBeenCalled();
    });

    it("removes the entry when the switch goes off", async () => {
        isEnabled.mockResolvedValue(false);
        await expect(setStartupEnabled(false)).resolves.toBe(false);
        expect(disable).toHaveBeenCalledTimes(1);
        expect(enable).not.toHaveBeenCalled();
    });

    /* Une machine qui refuse l'écriture du registre ne doit pas voir
       l'interrupteur mentir : il revient sur sa position réelle. */
    it("does not claim a write that the registry refused", async () => {
        enable.mockRejectedValue(new Error("access denied"));
        isEnabled.mockResolvedValue(false);
        await expect(setStartupEnabled(true)).resolves.toBe(false);
    });

    it("stays quiet when even the reading fails", async () => {
        isEnabled.mockRejectedValue(new Error("no registry"));
        await expect(isStartupEnabled()).resolves.toBe(false);
    });
});
