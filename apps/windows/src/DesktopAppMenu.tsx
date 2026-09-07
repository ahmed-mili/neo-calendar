import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    CheckIcon,
    ChevronDownIcon,
    ChevronRightIcon,
} from "../../../src/ui/calendar/Icons";
import { appVersion } from "../../../src/ui/calendar/appUpdates";
import { t } from "../../../src/ui/i18n";
import { DesktopCommandId, DesktopCommands } from "./desktopCommands";
import {
    EditTargetSnapshot,
    captureEditTarget,
    restoreEditTarget,
} from "./desktopEditCommands";
import {
    INTERFACE_SCALES,
    loadDesktopInterfaceScale,
    setDesktopInterfaceScale,
} from "./platform/desktopWindow";

/**
 * Le menu d'application de la barre unifiee Windows.
 *
 * Trois rubriques exactement — Neo Calendar, Modifier, Afficher — telles que la
 * capture annotee les montre, Aide barree comprise. Il ne DECIDE rien : chaque
 * ligne active nomme un `DesktopCommandId` et appelle la commande que
 * `DesktopCalendar` a deja posee dans la table. Une commande absente ou
 * `enabled: false` laisse sa ligne visible et atténuée, jamais retiree — un
 * menu dont les lignes vont et viennent ne s'apprend pas.
 *
 * `ContextMenu` n'est pas repris : il ne connait ni cascade, ni parcours
 * clavier, et en faire un cadre general pour les deux usages coûterait plus
 * cher que ces quelques lignes. Seuls sa grammaire visuelle, ses separateurs et
 * sa presentation des raccourcis sont reconduits, dans DesktopAppMenu.css.
 */

export type MenuEntry =
    | { kind: "separator"; id: string }
    | { kind: "version"; id: "version" }
    | {
          kind: "action";
          id: DesktopCommandId;
          label: string;
          shortcut?: string;
      }
    /* Les paliers d'echelle ne sont pas des commandes de la table : ils portent
       une valeur, pas un identifiant d'action, et s'affichent coches. */
    | { kind: "scale"; id: string; label: string; value: number }
    | {
          kind: "submenu";
          id: "app" | "edit" | "view" | "scale";
          label: string;
          items: MenuEntry[];
      };

/** Une ligne sur laquelle le focus peut se poser. La version n'en est pas une. */
const isFocusable = (entry: MenuEntry): boolean =>
    entry.kind !== "separator" && entry.kind !== "version";

/** La premiere ligne sur laquelle le focus peut se poser : « Neo Calendar »
    commence par la version, qui n'en est pas une. */
const firstFocusableIndex = (items: MenuEntry[]): number => {
    const index = items.findIndex(isFocusable);
    return index === -1 ? 0 : index;
};

function scaleEntries(): MenuEntry[] {
    return INTERFACE_SCALES.map((value) => ({
        kind: "scale" as const,
        id: `scale-${value}`,
        label: `${Math.round(value * 100)} %`,
        value,
    }));
}

/** L'arbre du menu, relu a chaque ouverture pour que `t()` et la version
    suivent la langue en vigueur. */
export function buildMenu(): MenuEntry[] {
    return [
        {
            kind: "submenu",
            id: "app",
            // Le nom du produit, jamais traduit.
            label: "Neo Calendar",
            items: [
                { kind: "version", id: "version" },
                {
                    kind: "action",
                    id: "check-updates",
                    label: t("Check for updates…"),
                },
                {
                    kind: "action",
                    id: "settings",
                    label: t("Settings…"),
                    shortcut: t("Ctrl+Comma"),
                },
            ],
        },
        {
            kind: "submenu",
            id: "edit",
            label: t("Edit"),
            items: [
                {
                    kind: "action",
                    id: "undo",
                    label: t("Undo"),
                    shortcut: "Ctrl+Z",
                },
                {
                    kind: "action",
                    id: "redo",
                    label: t("Redo"),
                    shortcut: "Ctrl+Y",
                },
                { kind: "separator", id: "edit-sep" },
                {
                    kind: "action",
                    id: "cut",
                    label: t("Cut"),
                    shortcut: "Ctrl+X",
                },
                {
                    kind: "action",
                    id: "copy",
                    label: t("Copy"),
                    shortcut: "Ctrl+C",
                },
                {
                    kind: "action",
                    id: "paste",
                    label: t("Paste"),
                    shortcut: "Ctrl+V",
                },
                {
                    kind: "action",
                    id: "paste-plain",
                    label: t("Paste and match style"),
                    shortcut: t("Ctrl+Shift+V"),
                },
                {
                    kind: "action",
                    id: "delete",
                    label: t("Delete"),
                    shortcut: t("Backspace"),
                },
                {
                    kind: "action",
                    id: "select-all",
                    label: t("Select all visible items"),
                    shortcut: "Ctrl+A",
                },
                {
                    kind: "action",
                    id: "duplicate",
                    label: t("Duplicate"),
                    shortcut: "Ctrl+D",
                },
            ],
        },
        {
            kind: "submenu",
            id: "view",
            label: t("Display"),
            items: [
                {
                    kind: "action",
                    id: "hours-reset",
                    label: t("Default hour spacing"),
                    shortcut: t("Ctrl+Shift+0"),
                },
                {
                    kind: "action",
                    id: "hours-increase",
                    label: t("Increase hour spacing"),
                    shortcut: t("Ctrl+Shift+Period"),
                },
                {
                    kind: "action",
                    id: "hours-decrease",
                    label: t("Decrease hour spacing"),
                    shortcut: t("Ctrl+Shift+Comma"),
                },
                { kind: "separator", id: "view-sep-1" },
                {
                    kind: "submenu",
                    id: "scale",
                    label: t("Interface scale"),
                    items: scaleEntries(),
                },
                {
                    kind: "action",
                    id: "reload",
                    label: t("Reload"),
                    shortcut: "Ctrl+R",
                },
                {
                    kind: "action",
                    id: "hard-reload",
                    label: t("Force refresh"),
                    shortcut: t("Ctrl+Shift+R"),
                },
                {
                    kind: "action",
                    id: "devtools",
                    label: t("Show developer tools"),
                    // La capture ecrit « Alt+Ctrl+I », la spec « Ctrl+Alt+I ».
                    // Meme accord ; la spec fait autorite pour le libelle.
                    shortcut: "Ctrl+Alt+I",
                },
                { kind: "separator", id: "view-sep-2" },
                {
                    kind: "action",
                    id: "fullscreen",
                    label: t("Toggle full screen"),
                    shortcut: "F11",
                },
            ],
        },
    ];
}

interface Placement {
    left: number;
    top: number;
}

/** Une couche de la cascade : ses lignes, et l'ancre qui l'a ouverte. */
interface Level {
    items: MenuEntry[];
    anchor: DOMRect | null;
    /** Vrai pour la couche racine, posee SOUS son ancre plutot qu'a sa droite. */
    below: boolean;
}

const EXIT_DELAY_MS = 320;
/** Les deux surfaces se touchent : c'est ce recouvrement qui empeche la
    fermeture quand la souris traverse du parent vers le sous-menu. */
const SUBMENU_OVERLAP = 3;
/** Le remplissage vertical du panneau, retire pour aligner la premiere ligne
    du sous-menu sur la ligne qui l'ouvre. */
const PANEL_PADDING = 12;

export interface DesktopAppMenuProps {
    commands: DesktopCommands;
    onOpenChange?: (open: boolean) => void;
    /** Injectes par les tests : le zoom natif passe par Tauri, absent sous Jest. */
    interfaceScale?: number;
    onSetInterfaceScale?: (scale: number) => void;
}

export default function DesktopAppMenu({
    commands,
    onOpenChange,
    interfaceScale,
    onSetInterfaceScale,
}: DesktopAppMenuProps): JSX.Element {
    const [open, setOpen] = React.useState(false);
    /* Le chemin ouvert SOUS la racine : [] = racine seule, ["edit"] = racine +
       Modifier, ["view","scale"] = les trois. Un seul etat pour toute la
       cascade, donc jamais deux branches ouvertes en meme temps. */
    const [path, setPath] = React.useState<string[]>([]);
    const [anchors, setAnchors] = React.useState<(DOMRect | null)[]>([]);
    /* Quelle ligne de chaque couche a ouvert la couche suivante : Gauche y
       ramene le focus sans avoir a relire le DOM. */
    const [parents, setParents] = React.useState<number[]>([]);
    const [focus, setFocus] = React.useState<{
        level: number;
        index: number;
    } | null>(null);
    const [scale, setScale] = React.useState(() => {
        try {
            return loadDesktopInterfaceScale();
        } catch {
            return 1;
        }
    });

    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const itemRefs = React.useRef<(HTMLButtonElement | null)[][]>([]);
    const exitTimer = React.useRef<number | null>(null);
    const editTarget = React.useRef<EditTargetSnapshot | null>(null);
    const menu = React.useMemo(() => (open ? buildMenu() : []), [open]);

    const appliedScale = interfaceScale ?? scale;

    const cancelExit = React.useCallback(() => {
        if (exitTimer.current !== null) {
            window.clearTimeout(exitTimer.current);
            exitTimer.current = null;
        }
    }, []);

    const close = React.useCallback(
        (returnFocus: boolean) => {
            cancelExit();
            setOpen(false);
            setPath([]);
            setAnchors([]);
            setParents([]);
            setFocus(null);
            if (returnFocus) triggerRef.current?.focus();
        },
        [cancelExit]
    );

    /* Ce que le menu a pris au champ qui avait le focus, memorise AVANT que le
       menu ne le lui prenne : une commande d'edition doit retrouver la meme
       selection dans le meme champ. */
    const openMenu = React.useCallback(
        (withFocus: boolean) => {
            cancelExit();
            if (!open) editTarget.current = captureEditTarget();
            setOpen(true);
            setPath([]);
            setParents([]);
            const rect = triggerRef.current?.getBoundingClientRect() ?? null;
            setAnchors([rect]);
            setFocus(withFocus ? { level: 0, index: 0 } : null);
        },
        [cancelExit, open]
    );

    React.useEffect(() => {
        onOpenChange?.(open);
    }, [open, onOpenChange]);

    /* Timers et ecouteurs meurent avec le composant : un menu demonte pendant
       son delai de sortie ne doit pas rappeler setState sur un arbre parti. */
    React.useEffect(() => cancelExit, [cancelExit]);

    React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target)) return;
            if (triggerRef.current?.contains(target)) return;
            close(true);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open, close]);

    // Le focus suit l'etat, jamais l'inverse : une seule source de verite.
    React.useEffect(() => {
        if (!focus) return;
        itemRefs.current[focus.level]?.[focus.index]?.focus();
    });

    const levels: Level[] = React.useMemo(() => {
        if (!open) return [];
        const built: Level[] = [
            { items: menu, anchor: anchors[0] ?? null, below: true },
        ];
        let items = menu;
        for (let depth = 0; depth < path.length; depth += 1) {
            const entry = items.find(
                (candidate) =>
                    candidate.kind === "submenu" && candidate.id === path[depth]
            );
            if (!entry || entry.kind !== "submenu") break;
            built.push({
                items: entry.items,
                anchor: anchors[depth + 1] ?? null,
                below: false,
            });
            items = entry.items;
        }
        return built;
    }, [open, menu, path, anchors]);

    itemRefs.current.length = levels.length;

    const openSubmenu = (
        level: number,
        id: string,
        rect: DOMRect,
        index: number
    ) => {
        cancelExit();
        setPath((current) => [...current.slice(0, level), id]);
        setAnchors((current) => {
            const next = current.slice(0, level + 1);
            next[level + 1] = rect;
            return next;
        });
        setParents((current) => [...current.slice(0, level), index]);
    };

    const closeBelow = (level: number) => {
        setPath((current) =>
            current.length > level ? current.slice(0, level) : current
        );
    };

    const activate = (entry: MenuEntry) => {
        if (entry.kind === "scale") {
            close(false);
            if (onSetInterfaceScale) onSetInterfaceScale(entry.value);
            else {
                setScale(entry.value);
                void setDesktopInterfaceScale(entry.value).catch(() => {
                    /* Le natif a refuse : la valeur affichee reprend celle
                       qui est reellement enregistree. */
                    setScale(loadDesktopInterfaceScale());
                });
            }
            return;
        }
        if (entry.kind !== "action") return;
        const command = commands[entry.id];
        if (!command || !command.enabled) return;
        // Fermer, RENDRE la cible, puis agir : une commande native appliquee
        // au menu encore focalise s'appliquerait au menu.
        close(false);
        restoreEditTarget(editTarget.current);
        try {
            const result: unknown = command.run();
            if (result instanceof Promise) {
                /* L'erreur d'une commande appartient a la commande : la table
                   de DesktopCalendar la rapporte deja par `runExclusive`. */
                void result.then(undefined, () => {});
            }
        } catch {
            // Idem : rien a rattraper ici que la table ne dise deja.
        }
    };

    const focusableIndexes = (level: number): number[] =>
        levels[level].items
            .map((entry, index) => (isFocusable(entry) ? index : -1))
            .filter((index) => index >= 0);

    const moveFocus = (
        level: number,
        step: number,
        absolute?: "first" | "last"
    ) => {
        const indexes = focusableIndexes(level);
        if (!indexes.length) return;
        if (absolute === "first") {
            setFocus({ level, index: indexes[0] });
            return;
        }
        if (absolute === "last") {
            setFocus({ level, index: indexes[indexes.length - 1] });
            return;
        }
        const current = focus && focus.level === level ? focus.index : -1;
        const position = indexes.indexOf(current);
        const next =
            position === -1
                ? step > 0
                    ? 0
                    : indexes.length - 1
                : (position + step + indexes.length) % indexes.length;
        setFocus({ level, index: indexes[next] });
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        const level = focus?.level ?? levels.length - 1;
        const entry = focus ? levels[level]?.items[focus.index] : undefined;
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                moveFocus(level, 1);
                return;
            case "ArrowUp":
                event.preventDefault();
                moveFocus(level, -1);
                return;
            case "Home":
                event.preventDefault();
                moveFocus(level, 0, "first");
                return;
            case "End":
                event.preventDefault();
                moveFocus(level, 0, "last");
                return;
            case "ArrowRight": {
                event.preventDefault();
                if (!entry || entry.kind !== "submenu") return;
                const button = itemRefs.current[level]?.[focus!.index];
                if (!button) return;
                openSubmenu(
                    level,
                    entry.id,
                    button.getBoundingClientRect(),
                    focus!.index
                );
                setFocus({
                    level: level + 1,
                    index: firstFocusableIndex(entry.items),
                });
                return;
            }
            case "ArrowLeft":
                event.preventDefault();
                if (level === 0) return;
                closeBelow(level - 1);
                setFocus({ level: level - 1, index: parents[level - 1] ?? 0 });
                return;
            case "Escape":
                event.preventDefault();
                // Le niveau courant d'abord, le menu ensuite : l'evenement ne
                // remonte pas, sinon la fiche d'evenement ouverte derriere se
                // fermerait du meme appui.
                event.stopPropagation();
                if (level > 0) {
                    closeBelow(level - 1);
                    setFocus({
                        level: level - 1,
                        index: parents[level - 1] ?? 0,
                    });
                    return;
                }
                close(true);
                return;
            case "Enter":
            case " ":
                if (!entry) return;
                event.preventDefault();
                if (entry.kind === "submenu") {
                    const button = itemRefs.current[level]?.[focus!.index];
                    if (button)
                        openSubmenu(
                            level,
                            entry.id,
                            button.getBoundingClientRect(),
                            focus!.index
                        );
                    setFocus({
                        level: level + 1,
                        index: firstFocusableIndex(entry.items),
                    });
                    return;
                }
                activate(entry);
                return;
            case "Tab":
                // Tab quitte le menu : on le ferme et on laisse le navigateur
                // deplacer le focus normalement.
                close(false);
                return;
            default:
        }
    };

    const scheduleExit = () => {
        cancelExit();
        exitTimer.current = window.setTimeout(
            () => close(false),
            EXIT_DELAY_MS
        );
    };

    return (
        <>
            <button
                type="button"
                ref={triggerRef}
                className="nc-app-menu-trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                data-open={open || undefined}
                aria-label={t("Application menu")}
                /* Pas d'infobulle pendant que le menu est ouvert : les deux
                   s'ouvrent au survol du même bouton, et l'infobulle se posait
                   par-dessus la première rubrique du menu, la rendant
                   illisible. Vu à l'écran le 2026-09-07. */
                data-nc-tooltip={open ? undefined : t("Application menu")}
                onMouseEnter={() => openMenu(false)}
                onMouseLeave={scheduleExit}
                onClick={() => (open ? close(false) : openMenu(true))}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "Enter") {
                        event.preventDefault();
                        openMenu(true);
                    }
                }}
            >
                <ChevronDownIcon />
            </button>
            {open &&
                ReactDOM.createPortal(
                    <div
                        ref={rootRef}
                        className="nc-app-menu-layer"
                        /* `mouseover`/`mouseout`, pas `mouseenter`/`mouseleave` :
                           cette couche n'a aucune surface propre, ses panneaux
                           sont en position fixe, et seuls les evenements qui
                           REMONTENT l'atteignent depuis eux. */
                        onMouseOver={cancelExit}
                        onMouseOut={scheduleExit}
                        onKeyDown={onKeyDown}
                    >
                        {levels.map((entryLevel, level) => (
                            <MenuPanel
                                key={level}
                                level={entryLevel}
                                depth={level}
                                commands={commands}
                                appliedScale={appliedScale}
                                openPath={path}
                                register={(index, node) => {
                                    if (!itemRefs.current[level])
                                        itemRefs.current[level] = [];
                                    itemRefs.current[level][index] = node;
                                }}
                                onHoverItem={(index, entry, rect) => {
                                    cancelExit();
                                    setFocus({ level, index });
                                    if (entry.kind === "submenu")
                                        openSubmenu(
                                            level,
                                            entry.id,
                                            rect,
                                            index
                                        );
                                    else closeBelow(level);
                                }}
                                onActivate={(entry, index, rect) => {
                                    if (entry.kind === "submenu") {
                                        openSubmenu(
                                            level,
                                            entry.id,
                                            rect,
                                            index
                                        );
                                        setFocus({
                                            level: level + 1,
                                            index: firstFocusableIndex(
                                                entry.items
                                            ),
                                        });
                                        return;
                                    }
                                    setFocus({ level, index });
                                    activate(entry);
                                }}
                            />
                        ))}
                    </div>,
                    document.body
                )}
        </>
    );
}

function MenuPanel({
    level,
    depth,
    commands,
    appliedScale,
    openPath,
    register,
    onHoverItem,
    onActivate,
}: {
    level: Level;
    depth: number;
    commands: DesktopCommands;
    appliedScale: number;
    openPath: string[];
    register: (index: number, node: HTMLButtonElement | null) => void;
    onHoverItem: (index: number, entry: MenuEntry, rect: DOMRect) => void;
    onActivate: (entry: MenuEntry, index: number, rect: DOMRect) => void;
}): JSX.Element {
    const panelRef = React.useRef<HTMLDivElement>(null);
    const anchor = level.anchor;
    const initial: Placement = anchor
        ? level.below
            ? { left: anchor.left, top: anchor.bottom + 4 }
            : {
                  left: anchor.right - SUBMENU_OVERLAP,
                  top: anchor.top - PANEL_PADDING,
              }
        : { left: 0, top: 0 };
    const [place, setPlace] = React.useState<Placement>(initial);

    /* Le menu reste dans la fenetre, et un sous-menu qui deborderait a droite
       bascule a gauche de son parent plutot que d'etre rogne. */
    React.useLayoutEffect(() => {
        const node = panelRef.current;
        if (!node || !anchor) return;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        let left = initial.left;
        let top = initial.top;
        if (width > 0 && left + width > window.innerWidth - 8) {
            left = level.below
                ? Math.max(8, window.innerWidth - 8 - width)
                : Math.max(8, anchor.left - width + SUBMENU_OVERLAP);
        }
        if (height > 0 && top + height > window.innerHeight - 8) {
            top = Math.max(8, window.innerHeight - 8 - height);
        }
        if (left !== place.left || top !== place.top) setPlace({ left, top });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchor, initial.left, initial.top]);

    return (
        <div
            ref={panelRef}
            className="nc-app-menu-panel"
            role="menu"
            data-depth={depth}
            style={{ left: place.left, top: place.top }}
        >
            {level.items.map((entry, index) => {
                if (entry.kind === "separator") {
                    return (
                        <div
                            key={entry.id}
                            className="nc-app-menu-separator"
                            role="separator"
                        />
                    );
                }
                if (entry.kind === "version") {
                    /* Ni bouton ni ligne de menu : elle n'ouvre rien, elle
                       dit une chose. La rendre activable serait mentir. */
                    return (
                        <div key={entry.id} className="nc-app-menu-version">
                            v{appVersion()}
                        </div>
                    );
                }
                const submenu = entry.kind === "submenu";
                const scaleRow = entry.kind === "scale";
                const command =
                    entry.kind === "action" ? commands[entry.id] : undefined;
                const disabled =
                    entry.kind === "action" && (!command || !command.enabled);
                const checked = scaleRow && entry.value === appliedScale;
                return (
                    <button
                        key={entry.id}
                        type="button"
                        ref={(node) => register(index, node)}
                        className="nc-app-menu-item"
                        role={scaleRow ? "menuitemradio" : "menuitem"}
                        aria-checked={scaleRow ? checked : undefined}
                        aria-haspopup={submenu ? "menu" : undefined}
                        aria-expanded={
                            submenu ? openPath[depth] === entry.id : undefined
                        }
                        aria-disabled={disabled || undefined}
                        data-disabled={disabled || undefined}
                        // `disabled` retirerait la ligne du parcours clavier :
                        // la capture la montre grisee, donc encore atteignable.
                        tabIndex={-1}
                        onMouseEnter={(event) =>
                            onHoverItem(
                                index,
                                entry,
                                event.currentTarget.getBoundingClientRect()
                            )
                        }
                        onClick={(event) =>
                            onActivate(
                                entry,
                                index,
                                event.currentTarget.getBoundingClientRect()
                            )
                        }
                    >
                        <span className="nc-app-menu-check">
                            {checked && <CheckIcon size={13} />}
                        </span>
                        <span className="nc-app-menu-label">{entry.label}</span>
                        {entry.kind === "action" && entry.shortcut && (
                            <span className="nc-app-menu-shortcut">
                                {entry.shortcut}
                            </span>
                        )}
                        {submenu && (
                            <span className="nc-app-menu-chevron">
                                <ChevronRightIcon size={14} />
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
