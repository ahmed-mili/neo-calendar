import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Check,
    FileText,
    FolderSync,
    Plus,
    Power,
    RefreshCw,
    Share2,
    Smartphone,
    Undo2,
} from "lucide-react";
import { t } from "../../../src/ui/i18n";
import ConfirmDialog from "./ConfirmDialog";
import {
    SettingsChoiceDialog,
    SettingsDialog,
    SettingsGroup,
    SettingsRow,
    SettingsToggleRow,
    type SettingsChoice,
} from "./SettingsPrimitives";
import {
    createStatusReader,
    deviceLine,
    loadSyncStatus,
    remainingLabel,
    statusLine,
    svgDataUrl,
    syncCommands,
    syncStamp,
    type SyncDetectionDto,
    type SyncPairingDto,
    type SyncStatusDto,
} from "./platform/desktopSync";
import {
    isStartupEnabled,
    setStartupEnabled,
} from "./platform/desktopAutostart";
import {
    openDesktopExternalTarget,
    writeDesktopClipboardText,
} from "./platform/desktopCalendarStore";

const SYNCTHING_URL = "https://syncthing.net";

/**
 * Le logo de Syncthing (Simple Icons, `syncthing.svg`), posé en SVG dans la page comme les autres logos de marque de
 * l'app : rien à charger, donc rien qui manque hors ligne.
 */
function SyncthingMark() {
    return (
        <svg
            className="nc-sync-logo"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="#0891D1"
            role="img"
            aria-label="Syncthing"
            focusable="false"
        >
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm0 2.412c3.115 0 5.885 1.5 7.629 3.815a1.834 1.834 0 0 1 1.564 3.162c.23.818.354 1.68.354 2.57a9.504 9.504 0 0 1-2.166 6.05c.128.281.189.595.162.92a1.854 1.854 0 0 1-2.004 1.678 1.86 1.86 0 0 1-.877-.322A9.486 9.486 0 0 1 12 21.505c-3.84 0-7.154-2.277-8.668-5.552-.3-.01-.601-.092-.879-.254-.858-.51-1.144-1.634-.633-2.513.164-.276.39-.493.653-.643a9.62 9.62 0 0 1-.02-.584c0-5.265 4.282-9.547 9.547-9.547zm0 1.227a8.311 8.311 0 0 0-8.31 8.683c.22.036.439.111.644.23.323.2.564.484.713.805l6.984-.644a1.78 1.78 0 0 1 .787-1.08c.288-.19.612-.286.936-.295.34-.01.68.08.978.254l3.51-2.914a1.82 1.82 0 0 1 .317-1.84A8.3 8.3 0 0 0 12 3.638zm7.027 5.98-3.502 2.91a1.829 1.829 0 0 1-.23 1.719l1.904 2.744c.212-.06.436-.085.668-.066.238.024.46.092.66.193a8.285 8.285 0 0 0 1.793-5.16 8.38 8.38 0 0 0-.265-2.092 1.835 1.835 0 0 1-1.028-.248zm-6.886 4.315-6.975.644a1.8 1.8 0 0 1-.66 1.004A8.312 8.312 0 0 0 12 20.279a8.294 8.294 0 0 0 3.938-.986 1.845 1.845 0 0 1-.075-.69c.028-.341.148-.65.332-.908L14.29 14.95a1.839 1.839 0 0 1-2.148-1.015z" />
        </svg>
    );
}

export interface SyncPageActions {
    toggle: (enabled: boolean) => void;
    startPairing: () => void;
    closePairing: () => void;
    askDevice: (id: string, name: string) => void;
    askRequest: (id: string, name: string) => void;
    retry: () => void;
    repoint: () => void;
    recheck: () => void;
    askTakeOver: () => void;
    askGiveBack: () => void;
    showLog: () => void;
    toggleStartup: (enabled: boolean) => void;
    /** Copie l'identifiant de ce PC dans le presse-papiers ; vrai si c'est fait. */
    copyId: (id: string) => Promise<boolean>;
}

export interface SyncPageViewProps {
    status: SyncStatusDto;
    detection: SyncDetectionDto | null;
    pairing: SyncPairingDto | null;
    startup: boolean;
    busy: boolean;
    error: string | null;
    /** La ligne « Dossier de données » de la page, que l'hôte garde pour sa navigation. */
    dataFolderRow: React.ReactNode;
    actions: SyncPageActions;
}

/** « Partager » : copie l'identifiant, et le dit un instant sur le bouton. */
function ShareIdButton({
    id,
    copy,
}: {
    id: string;
    copy: (id: string) => Promise<boolean>;
}) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const handle = setTimeout(() => setCopied(false), 1800);
        return () => clearTimeout(handle);
    }, [copied]);
    return (
        <button
            type="button"
            className="nc-sync-share"
            onClick={() => void copy(id).then((ok) => ok && setCopied(true))}
        >
            {copied ? <Check size={16} /> : <Share2 size={16} />}
            {copied ? t("ID copied") : t("Share")}
        </button>
    );
}

/** La page, sans état métier : tout ce qu'elle affiche vient de `props`, tout ce qu'elle déclenche part dans `actions`. */
export function SyncPageView({
    status,
    detection,
    pairing,
    startup,
    busy,
    error,
    dataFolderRow,
    actions,
}: SyncPageViewProps) {
    const running = status.state.kind === "running";
    const live = status.enabled && running;
    const shared = detection?.kind === "shares" ? detection : null;
    const failing =
        status.state.kind === "failed" || status.state.kind === "backoff";
    const tone = !status.enabled
        ? "off"
        : failing || status.folder?.error
        ? "error"
        : running && status.devices.some((device) => device.connected)
        ? "ok"
        : "neutral";

    return (
        <div className="nc-set-groups nc-sync-page">
            <section className="nc-sync-head">
                <p
                    className="nc-sync-status"
                    data-tone={tone}
                    role="status"
                    aria-live="polite"
                >
                    <span className="nc-sync-dot" aria-hidden="true" />
                    <span>{statusLine(status)}</span>
                </p>
                <p className="nc-sync-hint">
                    {t(
                        "Keeps your notes identical on all your devices, directly between them, with no account and no server of ours. It runs on Syncthing (open source), built into Neo Calendar: Windows may name Syncthing when it asks for permission."
                    )}
                </p>
                {error && <p className="nc-sync-error">{error}</p>}
                {status.pairingError && (
                    <p className="nc-sync-error">{status.pairingError}</p>
                )}
                {failing && (
                    <button
                        type="button"
                        className="nc-sync-link"
                        onClick={actions.retry}
                        disabled={busy}
                    >
                        <RefreshCw size={14} />
                        {t("Try again")}
                    </button>
                )}
            </section>

            {live && (
                <section className="nc-sync-section">
                    <h3 className="nc-sync-title">
                        {status.deviceName
                            ? `${t("Device ID")} - ${status.deviceName}`
                            : t("Device ID")}
                    </h3>
                    <div className="nc-sync-me">
                        <code className="nc-sync-id" title={status.myId ?? ""}>
                            {status.myId ?? "-"}
                        </code>
                        {status.myId && (
                            <ShareIdButton
                                id={status.myId}
                                copy={actions.copyId}
                            />
                        )}
                    </div>
                </section>
            )}

            {live && status.pending.length > 0 && (
                <SettingsGroup title={t("Requests to accept")}>
                    {status.pending.map((request) => (
                        <SettingsRow
                            key={request.id}
                            label={request.name || request.id.slice(0, 7)}
                            icon={<Smartphone size={18} />}
                            value={t("wants to connect")}
                            onClick={() =>
                                actions.askRequest(request.id, request.name)
                            }
                        />
                    ))}
                </SettingsGroup>
            )}

            {live && (
                <section className="nc-sync-section">
                    <h3 className="nc-sync-title">{t("Your devices")}</h3>
                    {status.devices.length === 0 ? (
                        <div className="nc-sync-empty">
                            {t("No device yet.")}
                        </div>
                    ) : (
                        <SettingsGroup>
                            {status.devices.map((device) => (
                                <SettingsRow
                                    key={device.id}
                                    label={device.name}
                                    icon={<Smartphone size={18} />}
                                    value={deviceLine(device)}
                                    onClick={() =>
                                        actions.askDevice(
                                            device.id,
                                            device.name
                                        )
                                    }
                                />
                            ))}
                        </SettingsGroup>
                    )}
                    <button
                        type="button"
                        className="nc-sync-share nc-sync-add"
                        onClick={actions.startPairing}
                        disabled={busy}
                    >
                        <Plus size={16} />
                        {t("Add a device")}
                    </button>
                </section>
            )}

            {shared && (
                <SettingsGroup
                    note={
                        // La raison donnée par le moteur (HTTPS, interface non locale, arrêté) est montrée telle quelle.
                        shared.reason
                            ? shared.reason
                            : shared.tls
                            ? t(
                                  "Your Syncthing's web interface uses HTTPS: remove the Neo Calendar folder in Syncthing yourself, then check again."
                              )
                            : shared.running
                            ? t(
                                  "Only the Neo Calendar folder leaves your Syncthing, after a backup of its configuration."
                              )
                            : t("Start your Syncthing to take the folder over.")
                    }
                >
                    {shared.running && !shared.tls ? (
                        <SettingsRow
                            label={t("Take the folder over")}
                            icon={<Undo2 size={18} />}
                            onClick={actions.askTakeOver}
                            disabled={busy}
                            navigates
                        />
                    ) : (
                        <SettingsRow
                            label={t("Check again")}
                            icon={<RefreshCw size={18} />}
                            onClick={actions.recheck}
                            disabled={busy}
                        />
                    )}
                </SettingsGroup>
            )}

            {status.mismatch && (
                <SettingsGroup
                    note={`${t("The engine still syncs:")} ${status.mismatch}`}
                >
                    <SettingsRow
                        label={t("Sync the current folder")}
                        icon={<FolderSync size={18} />}
                        onClick={actions.repoint}
                        disabled={busy}
                        navigates
                    />
                </SettingsGroup>
            )}

            <SettingsGroup>
                {dataFolderRow}
                <SettingsToggleRow
                    label={t("Built-in sync")}
                    icon={<FolderSync size={18} />}
                    checked={status.enabled}
                    onChange={actions.toggle}
                />
                <SettingsToggleRow
                    label={t("Launch at Windows startup")}
                    icon={<Power size={18} />}
                    checked={startup}
                    onChange={actions.toggleStartup}
                />
                {status.takenOver && (
                    <SettingsRow
                        label={t("Give the folder back")}
                        icon={<Undo2 size={18} />}
                        onClick={actions.askGiveBack}
                        disabled={busy}
                        navigates
                    />
                )}
                <SettingsRow
                    label={t("Log")}
                    icon={<FileText size={18} />}
                    onClick={actions.showLog}
                    navigates
                />
            </SettingsGroup>

            <p className="nc-sync-about">
                <SyncthingMark />
                <span>Syncthing</span>
                <a
                    href={SYNCTHING_URL}
                    onClick={(event) => {
                        event.preventDefault();
                        void openDesktopExternalTarget(SYNCTHING_URL);
                    }}
                >
                    {t("Learn more")}
                </a>
            </p>

            {pairing && (
                <SettingsDialog
                    title={t("Add a device")}
                    onClose={actions.closePairing}
                >
                    <div className="nc-sync-pairing">
                        <p>
                            {t(
                                "Scan this QR code with Neo Calendar on your phone."
                            )}
                        </p>
                        <img
                            className="nc-sync-qr"
                            src={svgDataUrl(pairing.qrSvg)}
                            alt={t("QR code to pair the phone")}
                            width={220}
                            height={220}
                        />
                        <p>
                            {t("This code works once and expires in")}{" "}
                            <span className="nc-sync-remaining">
                                {remainingLabel(
                                    status.pairingRemainingMs ??
                                        pairing.expiresInMs
                                )}
                            </span>
                        </p>
                    </div>
                </SettingsDialog>
            )}
        </div>
    );
}

const messageOf = (reason: unknown) =>
    reason instanceof Error ? reason.message : String(reason);

interface DesktopSyncPageProps {
    dataFolder: string;
    dataFolderRow: React.ReactNode;
    /** Ce que la page montrait avant le moteur intégré : gardé tel quel là où il n'existe pas (coque Android). */
    fallback: React.ReactNode;
    /** Pour le rendu statique des tests : `null` montre tout de suite la page de repli. */
    initialStatus?: SyncStatusDto | null;
}

/** Le contenant : lit le moteur toutes les deux secondes, porte les dialogues, lance les gestes. */
export default function DesktopSyncPage({
    dataFolder,
    dataFolderRow,
    fallback,
    initialStatus,
}: DesktopSyncPageProps) {
    // `undefined` : pas encore lu ; `null` : pas de synchro intégrée sur cette plateforme.
    const [status, setStatus] = useState<SyncStatusDto | null | undefined>(
        initialStatus
    );
    const [detection, setDetection] = useState<SyncDetectionDto | null>(null);
    const [pairing, setPairing] = useState<SyncPairingDto | null>(null);
    const [startup, setStartup] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [choice, setChoice] = useState<SettingsChoice | null>(null);
    const [confirm, setConfirm] = useState<"takeOver" | "giveBack" | null>(
        null
    );
    const [log, setLog] = useState<string | null>(null);
    const alive = useRef(true);
    const reader = useRef(
        createStatusReader(loadSyncStatus, (next) => {
            if (alive.current) setStatus(next);
        })
    );

    const refresh = useCallback(() => reader.current.read(), []);

    const detect = useCallback(async () => {
        try {
            const found = await syncCommands.detect(dataFolder);
            if (alive.current) setDetection(found);
        } catch {
            if (alive.current) setDetection(null);
        }
    }, [dataFolder]);

    useEffect(() => {
        alive.current = true;
        void refresh();
        void detect();
        void isStartupEnabled().then((on) => alive.current && setStartup(on));
        const timer = setInterval(
            () => {
                // Pas de moteur intégré ici (coque Android) : inutile de l'interroger toutes les deux secondes.
                if (!reader.current.isUnavailable()) void refresh();
            },
            pairing ? 1000 : 2000
        );
        return () => {
            alive.current = false;
            clearInterval(timer);
        };
    }, [refresh, detect, pairing]);

    // La fenêtre se ferme d'elle-même quand le code a servi ou expiré.
    useEffect(() => {
        if (pairing && status && status.pairingRemainingMs === null) {
            const handle = setTimeout(() => setPairing(null), 1500);
            return () => clearTimeout(handle);
        }
    }, [pairing, status]);

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (reason) {
            setError(messageOf(reason));
        } finally {
            setBusy(false);
            void refresh();
            void detect();
        }
    };

    // Après un geste confirmé dans un dialogue : relire le moteur, qu'il ait réussi ou non.
    const afterwards = async (gesture: Promise<unknown>) => {
        try {
            await gesture;
        } finally {
            void refresh();
            void detect();
        }
    };

    if (status === undefined)
        return <div className="nc-set-groups">{dataFolderRow}</div>;
    if (status === null) return <>{fallback}</>;

    const actions: SyncPageActions = {
        toggle: (enabled) =>
            void run(async () => {
                if (enabled) {
                    await syncCommands.enable(dataFolder);
                    // Comme le .exe de Syncthing : le moteur démarre avec Windows, sans qu'on ait à y penser.
                    if (!(await isStartupEnabled()))
                        setStartup(await setStartupEnabled(true));
                } else {
                    await syncCommands.disable();
                }
            }),
        startPairing: () =>
            void run(async () => setPairing(await syncCommands.pairingStart())),
        closePairing: () => {
            void syncCommands.pairingCancel().catch(() => undefined);
            setPairing(null);
        },
        askDevice: (id, name) =>
            setChoice({
                title: name,
                value: "",
                options: [{ value: "remove", label: t("Remove this device") }],
                onPick: () => void run(() => syncCommands.removeDevice(id)),
            }),
        askRequest: (id, name) =>
            setChoice({
                title: name || id.slice(0, 7),
                value: "",
                options: [
                    { value: "accept", label: t("Accept") },
                    { value: "refuse", label: t("Refuse") },
                ],
                onPick: (value) =>
                    void run(() =>
                        value === "accept"
                            ? syncCommands.acceptDevice(id)
                            : syncCommands.rejectDevice(id)
                    ),
            }),
        retry: () => void run(() => syncCommands.retry()),
        repoint: () => void run(() => syncCommands.repointFolder()),
        recheck: () => void detect(),
        askTakeOver: () => setConfirm("takeOver"),
        askGiveBack: () => setConfirm("giveBack"),
        showLog: () =>
            void syncCommands
                .log()
                .then(setLog)
                .catch(() => setLog("")),
        toggleStartup: (enabled) =>
            void setStartupEnabled(enabled).then(setStartup),
        copyId: (id) =>
            writeDesktopClipboardText(id).then(
                () => true,
                () => false
            ),
    };

    return (
        <>
            <SyncPageView
                status={status}
                detection={detection}
                pairing={pairing}
                startup={startup}
                busy={busy}
                error={error}
                dataFolderRow={dataFolderRow}
                actions={actions}
            />
            {choice && (
                <SettingsChoiceDialog
                    choice={choice}
                    onClose={() => setChoice(null)}
                />
            )}
            <ConfirmDialog
                open={confirm === "takeOver"}
                title={t("Take the folder over")}
                message={t(
                    "Neo Calendar will back up your Syncthing configuration, then remove only the Neo Calendar folder from it. Your other folders and devices are not touched. Your phone will have to accept this PC again (with the QR code)."
                )}
                confirmLabel={t("Take over")}
                onClose={() => setConfirm(null)}
                onConfirm={() =>
                    afterwards(
                        syncCommands.takeOver(dataFolder, syncStamp(new Date()))
                    )
                }
            />
            <ConfirmDialog
                open={confirm === "giveBack"}
                title={t("Give the folder back")}
                message={t(
                    "Your installed Syncthing takes the folder back, as it was before. It must be running."
                )}
                confirmLabel={t("Give back")}
                onClose={() => setConfirm(null)}
                onConfirm={() => afterwards(syncCommands.giveBack())}
            />
            {log !== null && (
                <SettingsDialog title={t("Log")} onClose={() => setLog(null)}>
                    <pre className="nc-sync-log">
                        {log || t("The log is empty.")}
                    </pre>
                </SettingsDialog>
            )}
        </>
    );
}
