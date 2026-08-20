const isPermissionGranted = jest.fn();
const requestPermission = jest.fn();
const sendNotification = jest.fn();

jest.mock("@tauri-apps/plugin-notification", () => ({
    isPermissionGranted: () => isPermissionGranted(),
    requestPermission: () => requestPermission(),
    sendNotification: (options: unknown) => sendNotification(options),
}));

/** A fresh copy of the module, whose answer is not remembered from before. */
function load() {
    let module: typeof import("./desktopNotifications");
    jest.isolateModules(() => {
        module = require("./desktopNotifications");
    });
    return module!;
}

describe("asking Windows for permission to notify", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isPermissionGranted.mockResolvedValue(false);
        requestPermission.mockResolvedValue("granted");
    });

    it("ne demande qu'une fois, meme rappel par rappel", async () => {
        const { ensureNotificationPermission } = load();

        expect(await ensureNotificationPermission()).toBe(true);
        expect(await ensureNotificationPermission()).toBe(true);

        expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    /*
     * Le scheduler poste ses rappels d'affilee, sans attendre la reponse du
     * precedent. Une reponse retenue seulement une fois arrivee laisse passer
     * tous ceux partis entre-temps : Windows recevait dix demandes pour une.
     */
    it("ne demande qu'une fois quand plusieurs rappels partent ensemble", async () => {
        const { ensureNotificationPermission } = load();

        await Promise.all([
            ensureNotificationPermission(),
            ensureNotificationPermission(),
            ensureNotificationPermission(),
        ]);

        expect(isPermissionGranted).toHaveBeenCalledTimes(1);
        expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    it("garde le refus, sans revenir a la charge", async () => {
        requestPermission.mockResolvedValue("denied");
        const { ensureNotificationPermission, postReminder } = load();

        expect(await ensureNotificationPermission()).toBe(false);
        await postReminder({
            id: "a",
            key: "a#0",
            atMs: 0,
            title: "Titre",
            body: "Corps",
        });

        expect(requestPermission).toHaveBeenCalledTimes(1);
        expect(sendNotification).not.toHaveBeenCalled();
    });

    it("passe le titre et le corps du rappel tels quels", async () => {
        isPermissionGranted.mockResolvedValue(true);
        const { postReminder } = load();

        await postReminder({
            id: "a",
            key: "a#0",
            atMs: 0,
            title: "Rendez-vous",
            body: "Ça commence · 14:00",
        });

        expect(sendNotification).toHaveBeenCalledWith({
            title: "Rendez-vous",
            body: "Ça commence · 14:00",
        });
    });
});
