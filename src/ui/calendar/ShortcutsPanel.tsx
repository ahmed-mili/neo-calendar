import * as React from "react";
import * as ReactDOM from "react-dom";
import { getPluginApp } from "../suggest/pluginApp";
import { usePopupDismiss } from "./usePopupDismiss";
import { SearchIcon, XIcon } from "./Icons";
import {
    Hotkey,
    ShortcutCommand,
    buildSections,
    filterSections,
    resolveHotkeys,
} from "./shortcutRegistry";
import { t } from "../i18n";

const PANEL_MARGIN_PX = 8;

/** Dit pourquoi une touche ne se remappe pas, sans occuper de place. */
const FIXED_KEY_TITLE =
    "This interaction is built into the calendar and cannot be remapped.";

/**
 * Liste les raccourcis du plugin. Deux sources : les commandes d'Obsidian avec
 * les touches REELLEMENT assignees, donc les remappages de l'utilisateur, et la
 * table des touches cablees dans la vue. Tout est lu a l'execution ou a
 * l'import, donc la liste ne peut pas se perimer.
 */
export default function ShortcutsPanel({
    anchorRect,
    onClose,
}: {
    anchorRect: DOMRect;
    onClose: () => void;
}) {
    const panelRef = React.useRef<HTMLDivElement>(null);
    const [query, setQuery] = React.useState("");
    // Naive placement for the first paint; corrected below once the panel's
    // real size is known, so it never flashes off-screen.
    const [pos, setPos] = React.useState<{ left: number; bottom: number }>(
        () => ({
            left: anchorRect.left,
            bottom: window.innerHeight - anchorRect.top + PANEL_MARGIN_PX,
        })
    );

    usePopupDismiss({
        visible: true,
        popupRef: panelRef,
        menuRef: panelRef,
        onClose,
    });

    // Clamp into the viewport, mirroring CalendarItemMenu's measure-after-mount
    // pattern: the panel's width is fixed by ShortcutsPanel.css but its height
    // depends on how many rows are visible, so both are read from the mounted
    // element rather than duplicating the CSS width here. Runs in a layout
    // effect (before paint) so there is no visible jump.
    React.useLayoutEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;

        let left = anchorRect.left;
        left = Math.max(
            PANEL_MARGIN_PX,
            Math.min(left, window.innerWidth - w - PANEL_MARGIN_PX)
        );

        let bottom = window.innerHeight - anchorRect.top + PANEL_MARGIN_PX;
        // The panel opens upward from the anchor (positioned via `bottom`),
        // so it is the TOP edge that can run past the viewport in a short
        // window. Same idea as ColorPicker's vertical clamp, mirrored because
        // the anchor here sits at the bottom of the sidebar instead of above
        // the popup.
        if (window.innerHeight - bottom - h < PANEL_MARGIN_PX) {
            bottom = window.innerHeight - h - PANEL_MARGIN_PX;
        }

        setPos({ left, bottom });
    }, [anchorRect]);

    const sections = React.useMemo(() => {
        const app = getPluginApp() as any;
        const commands: ShortcutCommand[] = Object.values(
            app.commands.commands as Record<string, ShortcutCommand>
        ).filter((command) => command.id.startsWith("neo-calendar:"));
        const hotkeysOf = (id: string): Hotkey[] =>
            // La personnalisation de l'utilisateur gagne sur le defaut declare
            // par la commande, y compris quand elle consiste a supprimer le
            // raccourci : la politique est dans resolveHotkeys, testee.
            resolveHotkeys(
                app.hotkeyManager.getHotkeys(id),
                app.hotkeyManager.getDefaultHotkeys(id)
            );
        return buildSections(commands, hotkeysOf);
    }, []);

    const visible = React.useMemo(
        () => filterSections(sections, query),
        [sections, query]
    );

    return ReactDOM.createPortal(
        // Portaile sur le body : Obsidian pose `contain: strict` sur
        // .workspace-leaf, qui deviendrait le bloc conteneur des position:fixed
        // descendants et decalerait le panneau.
        <div
            className="nc-shortcuts-panel"
            ref={panelRef}
            style={{
                left: pos.left,
                bottom: pos.bottom,
            }}
        >
            <div className="nc-shortcuts-search">
                <span className="nc-shortcuts-search-icon">
                    <SearchIcon />
                </span>
                <input
                    type="search"
                    autoFocus
                    value={query}
                    placeholder={t("Find keyboard shortcuts")}
                    aria-label={t("Find keyboard shortcuts")}
                    onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                    <button
                        type="button"
                        className="nc-shortcuts-search-clear"
                        aria-label={t("Clear search")}
                        data-nc-tooltip={t("Clear search")}
                        onClick={() => setQuery("")}
                    >
                        <XIcon size={12} />
                    </button>
                )}
            </div>

            <div className="nc-shortcuts-body">
                {visible.length === 0 ? (
                    <div className="nc-shortcuts-empty">
                        No matching shortcuts
                    </div>
                ) : (
                    visible.map((section) => (
                        <div
                            className="nc-shortcuts-section"
                            key={section.title}
                        >
                            <div className="nc-shortcuts-section-title">
                                {section.title}
                            </div>
                            {section.rows.map((row) => (
                                <div
                                    className="nc-shortcuts-row"
                                    key={row.id}
                                    data-nc-tooltip={
                                        row.remappable
                                            ? undefined
                                            : FIXED_KEY_TITLE
                                    }
                                >
                                    <span className="nc-shortcuts-label">
                                        {row.label}
                                    </span>
                                    <span className="nc-shortcuts-keys">
                                        {row.chords.map((chord, index) => (
                                            <React.Fragment key={index}>
                                                {index > 0 && (
                                                    <span className="nc-shortcuts-or">
                                                        or
                                                    </span>
                                                )}
                                                {chord.map((token) => (
                                                    <kbd
                                                        className="nc-shortcuts-key"
                                                        key={token}
                                                    >
                                                        {token}
                                                    </kbd>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>,
        document.body
    );
}
