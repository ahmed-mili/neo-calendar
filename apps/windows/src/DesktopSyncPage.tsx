import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Check,
    Copy,
    FileText,
    FolderSync,
    Monitor,
    Plus,
    Power,
    QrCode,
    RefreshCw,
    Share2,
    Smartphone,
    Undo2,
    X,
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

/**
 * Une demande d'appairage, en notification : un encadré ambre avec ses deux gestes dedans, sans fenêtre intermédiaire.
 * Les deux boutons se bloquent le temps de l'appel ; l'erreur du moteur s'affiche dans l'encadré.
 */
function RequestCallout({
    id,
    name,
    accept,
    reject,
}: {
    id: string;
    name: string;
    accept: (id: string) => Promise<void>;
    reject: (id: string) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const go = async (action: (id: string) => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action(id);
        } catch (reason) {
            if (mounted.current) setError(messageOf(reason));
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    return (
        <div className="nc-sync-request" role="group">
            <Smartphone size={20} className="nc-sync-request__icon" />
            <div className="nc-sync-request__body">
                <span className="nc-sync-request__text">
                    {t("“{name}” wants to sync with this device").replace(
                        "{name}",
                        name
                    )}
                </span>
                {error && <span className="nc-sync-error">{error}</span>}
            </div>
            <div className="nc-sync-request__actions">
                <button
                    type="button"
                    className="nc-sync-request__btn"
                    disabled={busy}
                    onClick={() => void go(reject)}
                >
                    {t("Ignore")}
                </button>
                <button
                    type="button"
                    className="nc-sync-request__btn nc-sync-request__btn--primary"
                    disabled={busy}
                    onClick={() => void go(accept)}
                >
                    {t("Accept")}
                </button>
            </div>
        </div>
    );
}

export interface SyncPageActions {
    toggle: (enabled: boolean) => void;
    startPairing: () => void;
    closePairing: () => void;
    openAdd: () => void;
    closeAdd: () => void;
    /** Ajoute un appareil par son identifiant ; rejette avec le message du moteur si l'identifiant est refusé. */
    addDevice: (id: string, name: string) => Promise<void>;
    askDevice: (id: string, name: string) => void;
    /** Accepte la demande d'un appareil ; rejette avec le message du moteur. */
    acceptRequest: (id: string) => Promise<void>;
    /** Ignore la demande d'un appareil ; rejette avec le message du moteur. */
    rejectRequest: (id: string) => Promise<void>;
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
    /** Non nul : la fenêtre « Mon ID » est ouverte et montre ce QR. */
    pairing: SyncPairingDto | null;
    /** La fenêtre « Ajouter un appareil » est ouverte. */
    adding: boolean;
    startup: boolean;
    busy: boolean;
    error: string | null;
    /** La ligne « Dossier de données » de la page, que l'hôte garde pour sa navigation. */
    dataFolderRow: React.ReactNode;
    actions: SyncPageActions;
}

const messageOf = (reason: unknown) =>
    typeof reason === "string"
        ? reason
        : reason instanceof Error
        ? reason.message
        : String(reason);

/** Le partage natif, seulement s'il existe vraiment dans cette WebView (WebView2 ne l'offre pas toujours). */
const canShareNatively = () =>
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" ||
        navigator.canShare({ text: "x" }));

/**
 * Le bloc de l'identifiant : le code sur une ligne, l'icône Copier en haut à droite, toujours visible. Une fois
 * copié, une coche verte 1,5 s ; un second clic pendant la coche recopie et relance les 1,5 s.
 */
function IdCodeBlock({
    id,
    copy,
}: {
    id: string;
    copy: (id: string) => Promise<boolean>;
}) {
    const [copied, setCopied] = useState(false);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!copied) return;
        const handle = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(handle);
    }, [copied, tick]);
    return (
        <div className="nc-sync-code">
            <pre>
                <code>{id}</code>
            </pre>
            <button
                type="button"
                className="nc-sync-code__copy"
                data-copied={copied ? "1" : undefined}
                onClick={() =>
                    void copy(id).then((ok) => {
                        if (!ok) return;
                        setCopied(true);
                        setTick((n) => n + 1);
                    })
                }
            >
                <span
                    key={`${copied}-${tick}`}
                    className="nc-sync-icon-in"
                    aria-hidden="true"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </span>
                <span className="nc-sync-sr-only">
                    {copied ? t("ID copied") : t("Copy")}
                </span>
            </button>
        </div>
    );
}

/** Le contenu de « Identifiant de l'appareil » : l'ID, le QR avec sa barre qui se remplit, Partager. */
export function PairingBody({
    pairing,
    id,
    copy,
}: {
    pairing: SyncPairingDto;
    id: string;
    copy: (id: string) => Promise<boolean>;
}) {
    const share = canShareNatively();
    return (
        <div className="nc-sync-pairing">
            <IdCodeBlock id={id} copy={copy} />
            <div className="nc-sync-pairing__qr">
                <img
                    className="nc-sync-qr"
                    src={svgDataUrl(pairing.qrSvg)}
                    alt={t("QR code to pair the phone")}
                    width={260}
                    height={260}
                />
                <span
                    className="nc-sync-timer__bar"
                    role="presentation"
                    aria-hidden="true"
                >
                    <span
                        key={pairing.qrSvg}
                        style={{
                            animationDuration: `${pairing.refreshInMs}ms`,
                        }}
                    />
                </span>
            </div>
            {share && (
                <button
                    type="button"
                    className="nc-sync-primary nc-sync-share-id"
                    onClick={() =>
                        void navigator
                            .share({ title: "Neo Calendar", text: id })
                            .catch(() => undefined)
                    }
                >
                    <Share2 size={14} />
                    {t("Share")}
                </button>
            )}
        </div>
    );
}

/** « Ajouter un appareil » : la phrase d'aide, l'identifiant de l'autre appareil, Annuler et Ajouter (sans scan, réservé au téléphone). */
function AddDeviceDialog({
    onClose,
    onAdd,
}: {
    onClose: () => void;
    onAdd: (id: string, name: string) => Promise<void>;
}) {
    const [id, setId] = useState("");
    const [failure, setFailure] = useState<string | null>(null);
    const [working, setWorking] = useState(false);
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!id.trim() || working) return;
        setWorking(true);
        setFailure(null);
        onAdd(id, "").catch((reason) => {
            setFailure(messageOf(reason));
            setWorking(false);
        });
    };
    return (
        <SettingsDialog title={t("Add a device")} onClose={onClose}>
            <form className="nc-sync-form" onSubmit={submit}>
                <p className="nc-sync-help">
                    {t(
                        "On the other device, open Settings, Sync, Show my ID. Then paste its ID here, or scan its QR code."
                    )}
                </p>
                <input
                    className="nc-sync-input nc-sync-input--mono"
                    value={id}
                    onChange={(event) => setId(event.target.value)}
                    placeholder={t("ID of the other device")}
                    aria-label={t("ID of the other device")}
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                />
                {failure && (
                    <p className="nc-sync-error" role="alert">
                        {failure}
                    </p>
                )}
                <div className="nc-sync-actions">
                    <span className="nc-sync-spacer" />
                    <button
                        type="button"
                        className="nc-sync-share"
                        onClick={onClose}
                    >
                        <X size={16} />
                        {t("Cancel")}
                    </button>
                    <button
                        type="submit"
                        className="nc-sync-primary"
                        disabled={!id.trim() || working}
                    >
                        <Check size={16} />
                        {t("Add")}
                    </button>
                </div>
            </form>
        </SettingsDialog>
    );
}

/** La page, sans état métier : tout ce qu'elle affiche vient de `props`, tout ce qu'elle déclenche part dans `actions`. */
export function SyncPageView({
    status,
    detection,
    pairing,
    adding,
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
                <button
                    type="button"
                    className="nc-sync-primary nc-sync-show-id"
                    onClick={actions.startPairing}
                    disabled={busy}
                >
                    <QrCode size={20} />
                    {t("Show my ID")}
                </button>
            )}

            {live && status.pending.length > 0 && (
                <section className="nc-sync-section">
                    <h3 className="nc-sync-title">{t("Requests")}</h3>
                    {status.pending.map((request) => (
                        <RequestCallout
                            key={request.id}
                            id={request.id}
                            name={request.name || request.id.slice(0, 7)}
                            accept={actions.acceptRequest}
                            reject={actions.rejectRequest}
                        />
                    ))}
                </section>
            )}

            {live && (
                <section className="nc-sync-section">
                    <h3 className="nc-sync-title">{t("My devices")}</h3>
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
                        onClick={actions.openAdd}
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
                    title={
                        status.deviceName
                            ? t("Device ID - {name}").replace(
                                  "{name}",
                                  status.deviceName
                              )
                            : t("Device ID")
                    }
                    icon={<Monitor size={20} />}
                    onClose={actions.closePairing}
                >
                    <PairingBody
                        pairing={pairing}
                        id={status.myId ?? pairing.myId}
                        copy={actions.copyId}
                    />
                </SettingsDialog>
            )}

            {adding && (
                <AddDeviceDialog
                    onClose={actions.closeAdd}
                    onAdd={actions.addDevice}
                />
            )}
        </div>
    );
}

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
    const [adding, setAdding] = useState(false);
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

    // Tant que « Mon ID » est ouverte, le QR est remplacé toutes les `refreshInMs` ; si le moteur refuse le suivant
    // (code servi, trop d'essais), le renouvellement s'arrête et la fermeture ci-dessous prend le relais.
    const refreshInMs = pairing?.refreshInMs;
    useEffect(() => {
        if (refreshInMs === undefined) return;
        let stopped = false;
        const handle = setTimeout(() => {
            syncCommands.pairingNext().then(
                (next) => {
                    if (!stopped) setPairing(next);
                },
                () => undefined
            );
        }, refreshInMs);
        return () => {
            stopped = true;
            clearTimeout(handle);
        };
    }, [refreshInMs, pairing]);

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
        openAdd: () => setAdding(true),
        closeAdd: () => setAdding(false),
        addDevice: async (id, name) => {
            await syncCommands.addDevice(id, name);
            setAdding(false);
            void refresh();
        },
        askDevice: (id, name) =>
            setChoice({
                title: name,
                value: "",
                options: [{ value: "remove", label: t("Remove this device") }],
                onPick: () => void run(() => syncCommands.removeDevice(id)),
            }),
        acceptRequest: async (id) => {
            try {
                await syncCommands.acceptDevice(id);
            } finally {
                void refresh();
                void detect();
            }
        },
        rejectRequest: async (id) => {
            try {
                await syncCommands.rejectDevice(id);
            } finally {
                void refresh();
                void detect();
            }
        },
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
                adding={adding}
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
