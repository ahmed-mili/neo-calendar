import * as React from "react";
import { useEffect, useRef } from "react";

import { t } from "../i18n";
import { richZoneLabel } from "./TimezonePicker";

interface TimezoneChangePromptProps {
    /** Le fuseau vers lequel le système vient de basculer. */
    systemZone: string;
    onAccept: () => void;
    onDecline: () => void;
}

/**
 * La question posée en descendant d'avion : le système a changé de fuseau,
 * faut-il que le calendrier suive ?
 *
 * Le refus est le geste par défaut — c'est lui qui porte le focus à
 * l'ouverture, et c'est lui qu'Échap déclenche. Accepter décale toutes les
 * heures affichées ; se tromper de bouton en réveillant son téléphone dans un
 * aéroport ne doit pas coûter cela.
 */
export function TimezoneChangePrompt({
    systemZone,
    onAccept,
    onDecline,
}: TimezoneChangePromptProps) {
    const declineRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        declineRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onDecline();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onDecline]);

    return (
        <div
            className="nc-timezone-prompt-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nc-timezone-prompt-title"
        >
            <div className="nc-timezone-prompt">
                <h2
                    className="nc-timezone-prompt__title"
                    id="nc-timezone-prompt-title"
                >
                    {t("Change time zone?")}
                </h2>
                <p className="nc-timezone-prompt__body">
                    {t("Your system time moved to the time zone")}{" "}
                    {`« ${richZoneLabel(systemZone, new Date())} »`}.
                </p>
                <div className="nc-timezone-prompt__actions">
                    <button
                        ref={declineRef}
                        type="button"
                        className="nc-timezone-prompt__button"
                        onClick={onDecline}
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        type="button"
                        className="nc-timezone-prompt__button nc-timezone-prompt__button--primary"
                        onClick={onAccept}
                    >
                        {t("Change time zone")}
                    </button>
                </div>
            </div>
        </div>
    );
}
