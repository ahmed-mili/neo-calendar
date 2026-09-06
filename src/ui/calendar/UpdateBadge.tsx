import * as React from "react";
import {
    UPDATE_INSTALL_ERROR_EVENT,
    UPDATE_PROGRESS_EVENT,
    UpdateInstallErrorDetail,
} from "./appUpdates";
import { isAndroidRuntime } from "./CalendarUtils";
import { useUpdateAvailable } from "./useUpdateAvailable";
import { updateControlState } from "./updateControl";
import { UpdateInstallDialog } from "./UpdateInstallDialog";
import { t } from "../i18n";

/** La flèche qui rentre dans son bac : ce qui est descendu, à poser. */
function InstallIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 3v10m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** Le temps que la pastille reste ouverte quand le téléchargement vient de
 *  finir : assez pour lire « Mettre à jour », pas assez pour occuper la barre. */
const ANNOUNCE_MS = 4000;

type InstallUiState =
    | { phase: "idle" }
    | { phase: "installing"; version: string }
    | { phase: "failed"; version: string; message: string };

/**
 * La mise à jour : elle descend toute seule, puis elle attend un geste.
 *
 * Un seul élément du début à la fin, et c'est tout l'intérêt : le compteur ne
 * disparaît pas pour être remplacé par un bouton — il devient ce bouton. La
 * pilule se resserre, le chiffre s'efface pendant que la flèche paraît. Deux
 * éléments qui se relaient, comme avant, ne pouvaient rien animer du tout :
 * React démonte le premier, le second arrive à sa taille finale, et l'oeil ne
 * voit qu'une coupure.
 *
 * Arrivée à bout de course, elle s'ouvre d'elle-même sur « Mettre à jour » le
 * temps qu'on le lise, puis se replie en pastille. Sans cela la nouvelle
 * n'était dite qu'au survol : le compteur s'évanouissait en un rond muet de
 * 26 px, et il fallait deviner qu'il fallait passer dessus.
 *
 * Sur Windows, le clic ouvre aussi le passage d'installation dans Neo Calendar.
 * Android garde son comportement natif : son installateur système est le seul
 * endroit autorisé à poser l'APK, donc aucun faux modal de bureau n'y apparaît.
 */
export function UpdateBadge({ onInstall }: { onInstall: () => void }) {
    const ready = useUpdateAvailable();
    const [percent, setPercent] = React.useState<number | null>(null);
    const [installUi, setInstallUi] = React.useState<InstallUiState>({
        phase: "idle",
    });
    const android = isAndroidRuntime();

    React.useEffect(() => {
        const onProgress = (event: Event) => {
            const detail = (event as CustomEvent<{ percent?: number }>).detail;
            const value = detail?.percent ?? -2;
            setPercent(value === -2 ? null : value);
        };
        window.addEventListener(UPDATE_PROGRESS_EVENT, onProgress);
        return () =>
            window.removeEventListener(UPDATE_PROGRESS_EVENT, onProgress);
    }, []);

    React.useEffect(() => {
        if (android) return;
        const onInstallError = (event: Event) => {
            const detail = (event as CustomEvent<UpdateInstallErrorDetail>)
                .detail;
            setInstallUi((current) => {
                if (current.phase === "idle") return current;
                return {
                    phase: "failed",
                    version: current.version,
                    message: detail?.message ?? "",
                };
            });
        };
        window.addEventListener(UPDATE_INSTALL_ERROR_EVENT, onInstallError);
        return () =>
            window.removeEventListener(
                UPDATE_INSTALL_ERROR_EVENT,
                onInstallError
            );
    }, [android]);

    const state = updateControlState({ percent, ready });
    const downloading = state.kind === "downloading";

    /* Le dernier chiffre atteint, gardé après la fin du téléchargement : un
       texte vidé au moment même où il devrait s'effacer ne s'efface pas, il
       disparaît. Celui-ci reste en place, à l'opacité zéro, le temps du
       fondu — masqué aux lecteurs d'écran, qui ont l'intitulé du bouton. */
    const lastCount = React.useRef("");
    React.useEffect(() => {
        if (downloading && state.label) lastCount.current = state.label;
    }, [downloading, state.label]);

    /* S'ouvrir une fois, à l'instant précis où la descente s'achève — et pas
       au montage : une pastille déjà prête quand le panneau s'ouvre n'a pas de
       nouvelle à annoncer, elle attend depuis un moment. */
    const [announced, setAnnounced] = React.useState(false);
    const previousKind = React.useRef(state.kind);
    React.useEffect(() => {
        const was = previousKind.current;
        previousKind.current = state.kind;
        if (state.kind !== "ready" || was !== "downloading") return;
        setAnnounced(true);
        const timer = window.setTimeout(() => setAnnounced(false), ANNOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [state.kind]);

    const startInstall = React.useCallback(() => {
        if (!android) {
            setInstallUi({ phase: "installing", version: ready });
        }
        onInstall();
    }, [android, onInstall, ready]);

    const dialog =
        !android && installUi.phase !== "idle" ? (
            <UpdateInstallDialog
                version={installUi.version}
                phase={installUi.phase}
                message={
                    installUi.phase === "failed" ? installUi.message : undefined
                }
                onRetry={startInstall}
                onClose={() => setInstallUi({ phase: "idle" })}
            />
        ) : null;

    if (state.kind === "idle") return dialog;

    const label = downloading
        ? t("Downloading update")
        : `${t("Update")} ${state.label}`;
    const classes = [
        "nc-update-control",
        downloading
            ? "nc-update-control--downloading"
            : "nc-update-control--ready",
        downloading && !state.label ? "nc-update-control--spinning" : "",
        !downloading && announced ? "nc-update-control--announced" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <>
            <button
                type="button"
                className={classes}
                /* Rien à presser pendant la descente : presser n'interromprait que
                   ce qui est déjà en train de se faire. */
                disabled={downloading}
                onClick={startInstall}
                data-nc-tooltip={label}
                aria-label={label}
            >
                <span className="nc-update-control__count" aria-hidden="true">
                    {downloading ? state.label ?? "" : lastCount.current}
                </span>
                <span className="nc-update-control__icon" aria-hidden="true">
                    <InstallIcon />
                </span>
                {/* Le libellé est là en permanence et c'est la largeur qui s'ouvre :
                    l'apparaître au survol le ferait arriver après le mouvement,
                    d'un coup, au lieu de sortir avec la pastille. */}
                <span className="nc-update-control__label">
                    {t("Update now")}
                </span>
            </button>
            {dialog}
        </>
    );
}
