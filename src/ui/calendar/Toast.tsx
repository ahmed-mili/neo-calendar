import * as React from "react";
import ReactDOM from "react-dom";
import { CheckIcon, XIcon } from "./EventPanelIcons";
import { t } from "../i18n";

/*
 * Un bandeau qui dit ce qui vient d'arriver, puis s'en va.
 *
 * Copier un lien ne changeait rien à l'écran : l'icône de copie devenait une
 * coche pendant une seconde, dans une bulle qui n'existe qu'au survol — donc
 * invisible au doigt. Une action sans trace visible ressemble à une action qui
 * n'a pas eu lieu, et on la refait.
 *
 * Le bandeau dit ce qui a été fait sur une ligne, et sur une seconde ce qu'on
 * peut en faire. Il part seul ; la croix est là pour celui qui veut récupérer
 * la place tout de suite plutôt que d'attendre.
 */

/** Le temps qu'il faut pour lire deux lignes sans se sentir bousculé. */
const TOAST_MS = 3600;

export interface ToastMessage {
    /** Ce qui vient d'arriver, au passé. */
    title: string;
    /** Ce qu'on peut en faire, ou rien. */
    detail?: string;
}

export function Toast({
    message,
    onClose,
}: {
    message: ToastMessage;
    onClose: () => void;
}) {
    const [leaving, setLeaving] = React.useState(false);

    React.useEffect(() => {
        setLeaving(false);
        const timer = window.setTimeout(() => setLeaving(true), TOAST_MS);
        return () => window.clearTimeout(timer);
    }, [message]);

    // La disparition se joue en CSS ; le démontage attend qu'elle soit finie,
    // sinon le bandeau saute au lieu de partir.
    React.useEffect(() => {
        if (!leaving) return;
        const timer = window.setTimeout(onClose, 220);
        return () => window.clearTimeout(timer);
    }, [leaving, onClose]);

    if (typeof document === "undefined") return null;

    return ReactDOM.createPortal(
        <div
            className={`nc-toast${leaving ? " is-leaving" : ""}`}
            /* Porté sur le body, donc « au dehors » de tout : sans ce
               marqueur, presser sa croix fermerait l'éditeur derrière lui. */
            data-nc-popup-portal="true"
            role="status"
            aria-live="polite"
        >
            <span className="nc-toast__icon" aria-hidden="true">
                <CheckIcon />
            </span>
            <span className="nc-toast__text">
                <strong>{message.title}</strong>
                {message.detail && <small>{message.detail}</small>}
            </span>
            <button
                type="button"
                className="nc-toast__close"
                aria-label={t("Close")}
                onClick={() => setLeaving(true)}
            >
                <XIcon />
            </button>
        </div>,
        document.body
    );
}
