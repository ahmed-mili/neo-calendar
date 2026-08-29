import * as React from "react";
import * as ReactDOM from "react-dom";
import { getLanguage } from "../i18n";

export type UpdateInstallPhase = "installing" | "failed";

interface UpdateInstallDialogProps {
    version: string;
    phase: UpdateInstallPhase;
    message?: string;
    onRetry: () => void;
    onClose: () => void;
}

function installCopy() {
    if (getLanguage() === "fr") {
        return {
            title: "Mise à jour de Neo Calendar",
            installing: "Installation de la mise à jour…",
            restarting:
                "Neo Calendar se fermera brièvement puis redémarrera automatiquement.",
            downloaded: "Téléchargée",
            install: "Installation",
            restart: "Redémarrage",
            failed: "La mise à jour n’a pas pu être installée.",
            retry: "Réessayer",
            close: "Fermer",
        };
    }
    return {
        title: "Update Neo Calendar",
        installing: "Installing the update…",
        restarting:
            "Neo Calendar will close briefly and restart automatically.",
        downloaded: "Downloaded",
        install: "Installation",
        restart: "Restart",
        failed: "The update could not be installed.",
        retry: "Try again",
        close: "Close",
    };
}

/**
 * The Windows hand-off between a downloaded package and the new process.
 *
 * There is deliberately no fake installation percentage here. Tauri can count
 * the download while Neo Calendar is alive; on Windows it then launches the
 * installer and exits this process. The only truthful UI for that second phase
 * is therefore an indeterminate installation step followed by the automatic
 * relaunch performed by the updater.
 */
export function UpdateInstallDialog({
    version,
    phase,
    message,
    onRetry,
    onClose,
}: UpdateInstallDialogProps) {
    const copy = installCopy();

    React.useEffect(() => {
        if (phase !== "failed") return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [phase, onClose]);

    if (typeof document === "undefined") return null;

    return ReactDOM.createPortal(
        <div
            className="nc-update-install-backdrop"
            data-nc-popup-portal="true"
        >
            <section
                className={`nc-update-install-dialog nc-update-install-dialog--${phase}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-update-install-title"
                aria-describedby="nc-update-install-description"
            >
                <div className="nc-update-install-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path
                            d="M12 3v10m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                <div className="nc-update-install-heading">
                    <h2 id="nc-update-install-title">{copy.title}</h2>
                    <span className="nc-update-install-version">
                        v{version}
                    </span>
                </div>

                {phase === "installing" ? (
                    <>
                        <p
                            id="nc-update-install-description"
                            className="nc-update-install-status"
                        >
                            {copy.installing}
                        </p>
                        <div
                            className="nc-update-install-progress"
                            role="progressbar"
                            aria-label={copy.installing}
                        >
                            <span />
                        </div>
                        <div
                            className="nc-update-install-steps"
                            aria-hidden="true"
                        >
                            <span className="nc-update-install-step nc-done">
                                <i>✓</i>
                                {copy.downloaded}
                            </span>
                            <span className="nc-update-install-step nc-active">
                                <i />
                                {copy.install}
                            </span>
                            <span className="nc-update-install-step">
                                <i />
                                {copy.restart}
                            </span>
                        </div>
                        <p className="nc-update-install-hint">
                            {copy.restarting}
                        </p>
                    </>
                ) : (
                    <>
                        <p
                            id="nc-update-install-description"
                            className="nc-update-install-status nc-update-install-status--error"
                        >
                            {copy.failed}
                        </p>
                        {message && (
                            <p className="nc-update-install-error-detail">
                                {message}
                            </p>
                        )}
                        <div className="nc-update-install-actions">
                            <button
                                type="button"
                                className="nc-update-install-secondary"
                                onClick={onClose}
                            >
                                {copy.close}
                            </button>
                            <button
                                type="button"
                                className="nc-update-install-primary"
                                onClick={onRetry}
                            >
                                {copy.retry}
                            </button>
                        </div>
                    </>
                )}
            </section>
        </div>,
        document.body
    );
}
