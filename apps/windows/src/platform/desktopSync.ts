import { invoke } from "@tauri-apps/api/core";
import { getLanguage, t } from "../../../../src/ui/i18n";

/*
 * La synchronisation intégrée (Syncthing embarqué) vue de l'interface : les types que le côté Rust sérialise
 * (`sync/control.rs`), les commandes Tauri, et les phrases de la page. Aucun état ici : le moteur est la vérité.
 */

export type EngineStateDto =
    | {
          kind:
              | "stopped"
              | "missing"
              | "blockedByInstalled"
              | "starting"
              | "running";
      }
    | { kind: "backoff"; attempt: number; retryInMs: number; error: string }
    | { kind: "failed"; error: string };

export interface SyncDeviceDto {
    id: string;
    name: string;
    connected: boolean;
    lastSeen: string | null;
}

export interface SyncPendingDto {
    id: string;
    name: string;
    address: string;
}

export interface SyncFolderDto {
    id: string;
    path: string;
    state: string;
    needFiles: number;
    error: string;
}

export interface SyncStatusDto {
    enabled: boolean;
    engineVersion: string;
    state: EngineStateDto;
    myId: string | null;
    folderPath: string | null;
    folder: SyncFolderDto | null;
    devices: SyncDeviceDto[];
    pending: SyncPendingDto[];
    /** Le chemin que le moteur synchronise encore quand le dossier de données de l'app a changé. */
    mismatch: string | null;
    pairingRemainingMs: number | null;
    takenOver: boolean;
    /** Pourquoi le dernier appairage a échoué après la lecture du code (le code, lui, n'y figure jamais). */
    pairingError: string | null;
    /** Le nom de ce PC, affiché à côté de son identifiant. */
    deviceName: string | null;
}

export type SyncDetectionDto =
    | { kind: "notInstalled" | "notSharing" }
    | {
          kind: "shares";
          folderId: string;
          label: string;
          running: boolean;
          tls: boolean;
          otherFolders: number;
          /** Pourquoi la reprise n'est pas possible (HTTPS, interface non locale, arrêté) ; absent quand elle l'est. */
          reason?: string | null;
      };

export interface SyncPairingDto {
    qrSvg: string;
    expiresInMs: number;
}

/**
 * Vrai quand le moteur intégré existe sur cette plateforme. Le même écran sert la coque Android, où ces commandes
 * n'existent pas : toute erreur de lecture vaut « pas de synchro intégrée ici », jamais une page cassée.
 */
export async function loadSyncStatus(): Promise<SyncStatusDto | null> {
    try {
        return await invoke<SyncStatusDto>("sync_status");
    } catch {
        return null;
    }
}

/**
 * Lance le moteur une fois le premier écran rempli. Jamais attendu, jamais bloquant, jamais une erreur : la
 * synchro est un service de fond, l'ouverture de l'app ne dépend pas d'elle. Le léger délai laisse le premier
 * affichage se terminer avant que le moindre travail de synchro ne commence.
 */
/**
 * La lecture périodique de l'état. Deux garanties, pour que la page ne reste jamais figée sur un état périmé
 * (« Démarrage… » alors que le moteur est prêt) : une seule lecture à la fois (sinon, pendant que le moteur
 * indexe, les lectures de 2 s s'empilent et une réponse ancienne peut écraser une plus récente), et une erreur
 * passagère après une première lecture réussie garde l'état connu et la cadence, au lieu de déclarer pour
 * toujours « pas de synchro intégrée ici ». Seule l'absence dès la première lecture (coque Android) l'est.
 */
export function createStatusReader(
    load: () => Promise<SyncStatusDto | null>,
    apply: (status: SyncStatusDto | null) => void
) {
    let reading = false;
    let known = false;
    let unavailable = false;
    return {
        isUnavailable: () => unavailable,
        async read(): Promise<void> {
            if (reading) return;
            reading = true;
            try {
                const next = await load();
                if (next === null && known) return;
                known = known || next !== null;
                unavailable = next === null;
                apply(next);
            } finally {
                reading = false;
            }
        },
    };
}

export function startSyncSoon(dataFolder: string, delayMs = 1500): () => void {
    const timer = setTimeout(() => {
        try {
            void invoke("sync_start", { dataFolder }).catch(() => undefined);
        } catch {
            // Pas de moteur intégré sur cette plateforme (coque Android) : rien à démarrer.
        }
    }, delayMs);
    return () => clearTimeout(timer);
}

export const syncCommands = {
    enable: (dataFolder: string) => invoke<void>("sync_enable", { dataFolder }),
    disable: () => invoke<void>("sync_disable"),
    retry: () => invoke<void>("sync_retry"),
    pairingStart: () => invoke<SyncPairingDto>("sync_pairing_start"),
    pairingCancel: () => invoke<void>("sync_pairing_cancel"),
    acceptDevice: (deviceId: string) =>
        invoke<void>("sync_accept_device", { deviceId }),
    rejectDevice: (deviceId: string) =>
        invoke<void>("sync_reject_device", { deviceId }),
    removeDevice: (deviceId: string) =>
        invoke<void>("sync_remove_device", { deviceId }),
    repointFolder: () => invoke<void>("sync_repoint_folder"),
    detect: (dataFolder: string) =>
        invoke<SyncDetectionDto>("sync_detect", { dataFolder }),
    takeOver: (dataFolder: string, stamp: string) =>
        invoke<void>("sync_take_over", { dataFolder, stamp }),
    giveBack: () => invoke<void>("sync_give_back"),
    log: () => invoke<string>("sync_log"),
};

const pad = (value: number) => String(value).padStart(2, "0");

/** `20261002-190000` : le nom de la sauvegarde de la configuration d'un Syncthing installé (chiffres et tirets). */
export function syncStamp(date: Date): string {
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
            date.getDate()
        )}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
            date.getSeconds()
        )}`
    );
}

/** Les SVG du QR code passent par une image : l'élément `<img>` n'exécute jamais de script. */
export function svgDataUrl(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** La seule ligne d'état de la page, la plus importante (même priorité que sur le téléphone). */
export function statusLine(status: SyncStatusDto): string {
    if (!status.enabled) return t("Built-in sync is off");
    const { state } = status;
    switch (state.kind) {
        case "missing":
            return t("The sync engine is missing from this version");
        case "blockedByInstalled":
            return t("An installed Syncthing already syncs this folder");
        case "stopped":
        case "starting":
            return t("Starting…");
        case "backoff":
            return `${t("Error")} : ${state.error} (${t(
                "retrying in"
            )} ${Math.round(state.retryInMs / 1000)} s)`;
        case "failed":
            return `${t("Error")} : ${state.error}`;
    }
    const folder = status.folder;
    if (!folder) return t("Starting…");
    if (folder.error) return `${t("Error")} : ${folder.error}`;
    if (
        folder.needFiles > 0 ||
        folder.state === "syncing" ||
        folder.state === "scanning"
    )
        return `${t("Syncing")} (${folder.needFiles} ${
            folder.needFiles === 1 ? t("file") : t("files")
        })`;
    if (status.devices.length === 0) return t("No device yet");
    if (!status.devices.some((device) => device.connected))
        return t("Offline: no device connected");
    return t("Up to date");
}

/** « Connecté », « Jamais connecté » ou la dernière connexion. */
export function deviceLine(device: SyncDeviceDto): string {
    if (device.connected) return t("Connected");
    if (!device.lastSeen) return t("Never connected");
    const when = new Date(device.lastSeen);
    if (Number.isNaN(when.getTime())) return t("Never connected");
    return `${t("Last seen")} ${when.toLocaleString(
        getLanguage() === "fr" ? "fr-FR" : "en-GB",
        { dateStyle: "short", timeStyle: "short" }
    )}`;
}

/** Le temps restant d'une fenêtre d'appairage, en « 4 min 12 s ». */
export function remainingLabel(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)} min ${pad(seconds % 60)} s`;
}
