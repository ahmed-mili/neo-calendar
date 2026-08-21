import * as React from "react";
import { UPDATE_PROGRESS_EVENT } from "./appUpdates";
import { useUpdateAvailable } from "./useUpdateAvailable";
import { updateControlState } from "./updateControl";
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

/**
 * La mise à jour : elle descend toute seule, puis elle attend un geste.
 *
 * Trois états et pas un de plus. Un compteur pendant la descente — le même
 * pourcentage que la notification, pour que les deux ne se contredisent
 * jamais. Une pastille ronde ensuite, discrète, qui ne dit rien tant qu'on ne
 * s'en approche pas. Et sous le curseur elle s'ouvre en « Mettre à jour »,
 * parce qu'une icône seule ne dit pas ce qu'elle va faire et que celle-ci
 * redémarre l'application.
 *
 * Rien du tout le reste du temps : l'ancien contrôle demandait qu'on aille
 * chercher les mises à jour et répondait « à jour », c'est-à-dire qu'il fallait
 * le lire à chaque lancement pour apprendre qu'il ne s'était rien passé.
 */
export function UpdateBadge({ onInstall }: { onInstall: () => void }) {
    const ready = useUpdateAvailable();
    const [percent, setPercent] = React.useState<number | null>(null);

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

    const state = updateControlState({ percent, ready });
    if (state.kind === "idle") return null;

    if (state.kind === "downloading") {
        return (
            <span
                className={`nc-update-control nc-update-control--downloading${
                    state.label ? "" : " nc-update-control--spinning"
                }`}
                role="status"
                aria-label={t("Downloading update")}
            >
                {state.label ?? ""}
            </span>
        );
    }

    return (
        <button
            type="button"
            className="nc-update-control nc-update-control--ready"
            onClick={onInstall}
            title={`${t("Update")} ${state.label}`}
            aria-label={`${t("Update")} ${state.label}`}
        >
            <span className="nc-update-control__icon">
                <InstallIcon />
            </span>
            {/* Le libellé est là en permanence et c'est la largeur qui s'ouvre :
                l'apparaître au survol le ferait arriver après le mouvement,
                d'un coup, au lieu de sortir avec la pastille. */}
            <span className="nc-update-control__label">{t("Update now")}</span>
        </button>
    );
}
