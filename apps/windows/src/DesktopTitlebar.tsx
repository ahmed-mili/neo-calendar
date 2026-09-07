import * as React from "react";
import {
    NewEventIcon,
    SearchIcon,
} from "../../../src/ui/calendar/Icons";
import { UpdateBadge } from "../../../src/ui/calendar/UpdateBadge";
import { installPendingUpdate } from "../../../src/ui/calendar/appUpdates";
import { t } from "../../../src/ui/i18n";
import DesktopAppMenu from "./DesktopAppMenu";
import { DesktopCommands } from "./desktopCommands";

export interface DesktopTitlebarProps {
    /** Le fragment `CalendarHeader` en presentation « window-controls ». */
    controls: React.ReactNode;
    commands: DesktopCommands;
    onToggleSidebar: () => void;
    onOpenSearch: () => void;
    onNewEvent: () => void;
    sidebarVisible: boolean;
    /** Le menu ouvert tient le clavier : les fleches le parcourent au lieu de
        changer de periode. `DesktopCalendar` en fait un `overlayHoldsKeyboard`. */
    onMenuOpenChange?: (open: boolean) => void;
}

/**
 * La moitie gauche de la barre unifiee, montee dans le slot du shell.
 *
 * Les commandes de fenetre vivent DEJA a droite du slot (DesktopWindowShell) :
 * cette barre ne les redessine pas, elle remplit ce qui reste. `controls` est
 * l'en-tete partage tel quel — le selecteur de vue, Today et les deux fleches —
 * jamais une copie : dupliquer le selecteur reviendrait a maintenir deux
 * versions de ses deux sous-menus.
 *
 * Recherche et creation sont calees a DROITE de la bande laterale, la ou la
 * reference les montre, l'espace flexible etant au milieu du groupe gauche.
 * Sidebar repliee, le groupe se resserre sur son contenu : rien ne disparait.
 */
export default function DesktopTitlebar({
    controls,
    commands,
    onToggleSidebar,
    onOpenSearch,
    onNewEvent,
    sidebarVisible,
    onMenuOpenChange,
}: DesktopTitlebarProps): JSX.Element {
    return (
        <div className="nc-desktop-toolbar">
            <div
                className="nc-desktop-toolbar__left"
                data-sidebar={sidebarVisible ? "open" : "closed"}
            >
                <DesktopAppMenu
                    commands={commands}
                    onOpenChange={onMenuOpenChange}
                />
                <button
                    type="button"
                    className="nc-desktop-toolbar__btn"
                    onClick={onToggleSidebar}
                    aria-label={t("Toggle sidebar")}
                    data-nc-tooltip={t("Toggle sidebar")}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <rect
                            x="1"
                            y="3"
                            width="14"
                            height="10"
                            rx="2"
                            stroke="#ADADAD"
                            strokeWidth="1.25"
                        />
                        <path
                            d="M5 3.25V12.75"
                            stroke="#ADADAD"
                            strokeWidth="1.25"
                        />
                    </svg>
                </button>
                <div className="nc-desktop-toolbar__gap" />
                <button
                    type="button"
                    className="nc-desktop-toolbar__btn"
                    onClick={onOpenSearch}
                    aria-label={t("Open command menu")}
                    data-nc-tooltip={t("Open command menu")}
                >
                    <SearchIcon />
                </button>
                <button
                    type="button"
                    className="nc-desktop-toolbar__btn"
                    onClick={onNewEvent}
                    aria-label={t("New event")}
                    data-nc-tooltip={t("New event")}
                >
                    <NewEventIcon />
                </button>
            </div>
            {/* La surface vide de la barre : c'est elle qui deplace la fenetre,
                et le shell l'ecoute sur le slot lui-meme. */}
            <div className="nc-desktop-toolbar__drag-space" />
            <UpdateBadge onInstall={() => installPendingUpdate()} />
            {controls}
        </div>
    );
}
