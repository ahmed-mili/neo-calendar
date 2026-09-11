import * as React from "react";
import * as ReactDOM from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon } from "./Icons";

export interface CalendarMenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    /** Render a color swatch instead of an icon (for the "Color" item). */
    swatchColor?: string;
    danger?: boolean;
    disabled?: boolean;
    /** Une coche à droite : la ligne est le choix en cours. */
    checked?: boolean;
    /** Une seconde ligne en petit sous le libellé. */
    note?: string;
    /** Un texte secondaire à droite, avant le chevron (le nom d'une couleur). */
    value?: string;
    /** Un sous-menu : la ligne porte un chevron et s'ouvre au survol. */
    children?: CalendarMenuItem[];
    /** Un bloc libre rendu à la fin du sous-menu (un champ). */
    content?: React.ReactNode;
    /** Le clic ne referme pas le menu. */
    keepOpen?: boolean;
    /** Un petit contrôle en bout de ligne (un champ) : ses clics et ses
     *  touches restent à lui, ils n'activent ni ne déplacent la ligne. */
    trailing?: React.ReactNode;
    onClick?: () => void;
}

interface CalendarItemMenuProps {
    items: CalendarMenuItem[];
    anchorRect: DOMRect;
    onClose: () => void;
}

/** Le délai avant qu'un survol n'ouvre : traverser une ligne n'est pas la choisir. */
const OPEN_INTENT_MS = 150;
/** Le délai avant qu'une sortie ne referme : le temps de rejoindre le sous-menu. */
const EXIT_DELAY_MS = 320;
/** Les deux surfaces se touchent : c'est ce recouvrement qui empêche la
    fermeture quand la souris traverse du parent vers le sous-menu. */
const SUBMENU_OVERLAP = 3;
/** Le remplissage vertical du panneau, retiré pour aligner la première ligne
    du sous-menu sur la ligne qui l'ouvre. */
const PANEL_PADDING = 4;
const MARGIN = 8;

interface Placement {
    top: number;
    left: number;
}

/**
 * Notion-style overflow menu for a calendar row. Positioned `fixed` under the
 * trigger so the sidebar's `overflow` never clips it. The menu's own width is
 * measured after mount and the position is clamped into the viewport, so the
 * text is never cut off on a narrow sidebar.
 *
 * Une ligne peut porter un sous-menu : il s'ouvre au survol après un court
 * délai d'intention, au clic, ou au clavier par flèche droite ; flèche gauche
 * et Échap referment le niveau courant. Un seul sous-menu ouvert par niveau.
 * Les constantes de délai et de recouvrement sont celles du menu
 * d'application Windows, pour que les deux cascades se comportent pareil.
 */
export default function CalendarItemMenu({
    items,
    anchorRect,
    onClose,
}: CalendarItemMenuProps) {
    /* Le chemin ouvert : la clé du sous-menu ouvert à chaque profondeur, et le
       rectangle de la ligne qui l'a ouvert. */
    /* Clé et rectangle dans le MÊME état : posés par deux `setState`, un rendu
       partait entre les deux quand l'ouverture venait du minuteur de survol
       (React 17 ne regroupe pas hors d'un gestionnaire d'évènement), et le
       sous-menu se rendait avec une clé mais sans rectangle. */
    const [opened, setOpened] = useState<{ key: string; rect: DOMRect }[]>([]);
    const path = opened.map((level) => level.key);
    const anchors = opened.map((level) => level.rect);
    const openTimer = useRef<number | null>(null);
    const exitTimer = useRef<number | null>(null);

    const clearTimer = (ref: React.MutableRefObject<number | null>) => {
        if (ref.current !== null) {
            window.clearTimeout(ref.current);
            ref.current = null;
        }
    };
    useEffect(
        () => () => {
            clearTimer(openTimer);
            clearTimer(exitTimer);
        },
        []
    );

    const openAt = (depth: number, key: string, rect: DOMRect) => {
        clearTimer(openTimer);
        clearTimer(exitTimer);
        setOpened((current) => [...current.slice(0, depth), { key, rect }]);
    };
    const closeBelow = (depth: number) => {
        setOpened((current) => current.slice(0, depth));
    };
    const scheduleClose = (depth: number) => {
        clearTimer(exitTimer);
        exitTimer.current = window.setTimeout(
            () => closeBelow(depth),
            EXIT_DELAY_MS
        );
    };
    const cancelClose = () => clearTimer(exitTimer);

    /* Les niveaux à rendre : la racine, puis un panneau par clé du chemin. */
    const levels: {
        items: CalendarMenuItem[];
        content?: React.ReactNode;
        anchor: DOMRect | null;
    }[] = [{ items, anchor: null }];
    let cursor = items;
    for (let depth = 0; depth < path.length; depth++) {
        const parent = cursor.find((item) => item.key === path[depth]);
        if (!parent || !parent.children) break;
        levels.push({
            items: parent.children,
            content: parent.content,
            anchor: anchors[depth],
        });
        cursor = parent.children;
    }

    return ReactDOM.createPortal(
        <>
            <div className="nc-cal-menu-overlay" onClick={onClose} />
            {levels.map((level, depth) => (
                <MenuLevel
                    key={depth}
                    depth={depth}
                    items={level.items}
                    content={level.content}
                    anchorRect={depth === 0 ? anchorRect : level.anchor!}
                    openKey={path[depth] ?? null}
                    onOpen={(key, rect) => openAt(depth, key, rect)}
                    onIntent={(key, rect) => {
                        clearTimer(openTimer);
                        cancelClose();
                        openTimer.current = window.setTimeout(
                            () => openAt(depth, key, rect),
                            OPEN_INTENT_MS
                        );
                    }}
                    onLeaveRow={() => {
                        // Quitter une ligne de ce niveau programme la fermeture
                        // de tout ce qui est ouvert sous lui ; entrer dans le
                        // sous-menu annule ce programme.
                        clearTimer(openTimer);
                        if (path.length > depth) scheduleClose(depth);
                    }}
                    onEnterPanel={cancelClose}
                    // Quitter un sous-menu vers le vide le referme lui aussi :
                    // c'est le niveau au-dessus qui le tient ouvert.
                    onLeavePanel={() => scheduleClose(Math.max(0, depth - 1))}
                    onCloseLevel={() => closeBelow(depth)}
                    onCloseSelf={() => closeBelow(Math.max(0, depth - 1))}
                    onCloseAll={onClose}
                />
            ))}
        </>,
        document.body
    );
}

interface MenuLevelProps {
    depth: number;
    items: CalendarMenuItem[];
    content?: React.ReactNode;
    /** La racine reçoit l'ancre du bouton ; un sous-menu, la ligne qui l'ouvre. */
    anchorRect: DOMRect;
    openKey: string | null;
    onOpen: (key: string, rect: DOMRect) => void;
    onIntent: (key: string, rect: DOMRect) => void;
    onLeaveRow: () => void;
    onEnterPanel: () => void;
    onLeavePanel: () => void;
    /** Referme le sous-menu ouvert par ce niveau (garde ce niveau affiché). */
    onCloseLevel: () => void;
    /** Referme ce niveau lui-même (revient au niveau parent). */
    onCloseSelf: () => void;
    onCloseAll: () => void;
}

function MenuLevel({
    depth,
    items,
    content,
    anchorRect,
    openKey,
    onOpen,
    onIntent,
    onLeaveRow,
    onEnterPanel,
    onLeavePanel,
    onCloseLevel,
    onCloseSelf,
    onCloseAll,
}: MenuLevelProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const sub = depth > 0;
    const [pos, setPos] = useState<Placement>(() =>
        sub
            ? {
                  top: anchorRect.top - PANEL_PADDING,
                  left: anchorRect.right - SUBMENU_OVERLAP,
              }
            : { top: anchorRect.bottom + 4, left: anchorRect.left }
    );

    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left: number;
        let top: number;
        if (sub) {
            // À droite de la ligne, première ligne alignée sur elle…
            left = anchorRect.right - SUBMENU_OVERLAP;
            top = anchorRect.top - PANEL_PADDING;
            // …et à gauche quand la fenêtre manque de place à droite.
            if (left + w > window.innerWidth - MARGIN) {
                left = anchorRect.left - w + SUBMENU_OVERLAP;
            }
        } else {
            // Align the menu's right edge with the trigger's right edge…
            left = anchorRect.right - w;
            top = anchorRect.bottom + 4;
            if (top + h > window.innerHeight - MARGIN)
                top = anchorRect.top - h - 4;
        }
        // …then keep it fully inside the viewport.
        left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));
        top = Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN));
        setPos({ top, left });
    }, [anchorRect, sub]);

    /* Le sous-menu qui vient de s'ouvrir au clavier prend le focus sur sa
       première ligne ; ouvert à la souris, il la laisse où elle est. */
    const focusRow = (index: number) => {
        const enabled = items.filter((item) => !item.disabled);
        const target = enabled[(index + enabled.length) % enabled.length];
        if (target) rowRefs.current.get(target.key)?.focus();
    };

    const activate = (item: CalendarMenuItem, rect: DOMRect) => {
        if (item.disabled) return;
        if (item.children) {
            if (openKey === item.key) onCloseLevel();
            else onOpen(item.key, rect);
            return;
        }
        item.onClick?.();
        if (!item.keepOpen) onCloseAll();
    };

    const onKeyDown = (
        event: React.KeyboardEvent,
        item: CalendarMenuItem,
        index: number
    ) => {
        const rect = (
            event.currentTarget as HTMLElement
        ).getBoundingClientRect();
        switch (event.key) {
            case "ArrowRight":
                if (item.children && !item.disabled) {
                    event.preventDefault();
                    onOpen(item.key, rect);
                }
                break;
            case "ArrowLeft":
                if (sub) {
                    event.preventDefault();
                    onCloseSelf();
                }
                break;
            case "Escape":
                event.preventDefault();
                event.stopPropagation();
                if (sub) onCloseSelf();
                else onCloseAll();
                break;
            case "ArrowDown":
                event.preventDefault();
                focusRow(
                    items.filter((entry) => !entry.disabled).indexOf(item) + 1
                );
                break;
            case "ArrowUp":
                event.preventDefault();
                focusRow(
                    items.filter((entry) => !entry.disabled).indexOf(item) - 1
                );
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                activate(item, rect);
                break;
            default:
                void index;
        }
    };

    return (
        <div
            ref={menuRef}
            className={`nc-cal-menu${sub ? " nc-cal-menu--sub" : ""}`}
            style={{ top: pos.top, left: pos.left }}
            role="menu"
            data-depth={depth}
            onMouseEnter={onEnterPanel}
            onMouseLeave={onLeavePanel}
        >
            {items.map((item, index) => {
                const expanded = item.children
                    ? openKey === item.key
                    : undefined;
                return (
                    <button
                        key={item.key}
                        ref={(el) => {
                            if (el) rowRefs.current.set(item.key, el);
                            else rowRefs.current.delete(item.key);
                        }}
                        type="button"
                        role="menuitem"
                        className={`nc-cal-menu-item${
                            item.danger ? " nc-cal-menu-danger" : ""
                        }${expanded ? " nc-cal-menu-item--open" : ""}`}
                        disabled={item.disabled}
                        aria-haspopup={item.children ? "menu" : undefined}
                        aria-expanded={expanded}
                        aria-checked={
                            item.children ? undefined : item.checked ?? false
                        }
                        onMouseEnter={(event) => {
                            const rect =
                                event.currentTarget.getBoundingClientRect();
                            if (item.children && !item.disabled)
                                onIntent(item.key, rect);
                            else onLeaveRow();
                        }}
                        onMouseLeave={onLeaveRow}
                        onClick={(event) =>
                            activate(
                                item,
                                event.currentTarget.getBoundingClientRect()
                            )
                        }
                        onKeyDown={(event) => onKeyDown(event, item, index)}
                    >
                        <span className="nc-cal-menu-icon">
                            {item.swatchColor !== undefined ? (
                                <span
                                    className="nc-cal-menu-swatch"
                                    style={{
                                        backgroundColor: item.swatchColor,
                                    }}
                                />
                            ) : (
                                item.icon
                            )}
                        </span>
                        <span className="nc-cal-menu-label">
                            {item.label}
                            {item.note && (
                                <small className="nc-cal-menu-note">
                                    {item.note}
                                </small>
                            )}
                        </span>
                        {item.trailing && (
                            <span
                                className="nc-cal-menu-trailing"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                            >
                                {item.trailing}
                            </span>
                        )}
                        {item.value && (
                            <span className="nc-cal-menu-value">
                                {item.value}
                            </span>
                        )}
                        {item.checked && (
                            <span className="nc-cal-menu-check">
                                <CheckIcon size={14} />
                            </span>
                        )}
                        {item.children && (
                            <span className="nc-cal-menu-chevron">
                                <ChevronRightIcon size={14} />
                            </span>
                        )}
                    </button>
                );
            })}
            {content && <div className="nc-cal-menu-content">{content}</div>}
        </div>
    );
}
