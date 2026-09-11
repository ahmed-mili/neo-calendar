# PC : sous-menus en cascade et panneau de calendrier — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur PC, le rappel d'un calendrier se règle dans un sous-menu ouvert au survol, la fenêtre des liens ICS prend la coque des autres dialogues, et le panneau d'un calendrier monte dans la barre de titre, pousse la grille, devient transparent et s'ouvre par un simple fondu. Android ne change pas.

**Architecture:** `CalendarItemMenu` (partagé, `src/ui/calendar`) apprend la cascade et sert désormais aussi au menu « ⋯ » du panneau. Ce que l'application ajoute à ces menus (Rappel, Liens ICS, Horaires de prière) passe par une seule prop `extraMenuItems(calendarId)` construite côté Windows/Android dans `apps/windows/src/calendarMenuItems.tsx`. L'en-tête du panneau est porté par portail dans un segment de la barre unifiée (`DesktopTitlebar`) ; le corps du panneau reste dans `.nc-layout`.

**Tech Stack:** React 17, TypeScript, Jest + jsdom (`react-dom/test-utils`), CSS pur, Tauri 2 (WebView2) pour la vérification visuelle via `agent-browser --cdp`.

**Spec:** `docs/superpowers/specs/2026-09-11-pc-sous-menus-et-panneau-calendrier-design.md`

## Global Constraints

- Android (`body.nc-platform-android`, `isAndroidRuntime()`) garde les dialogues, le tiroir et son comportement actuel : toute règle PC est écartée de lui par `body:not(.nc-platform-android)` ou par `onPhone`.
- Le plugin Obsidian (`src/ui/calendar/CalendarApp.tsx`) ne passe pas `extraMenuItems` et ne gagne aucune entrée.
- Aucune fonction ne disparaît sur PC (« on garde tout sur PC »).
- Délais et recouvrement du sous-menu : 150 ms d'intention à l'ouverture, 320 ms de sortie, 3 px de recouvrement (`DesktopAppMenu`).
- Icônes : Lucide via `src/ui/calendar/Icons.tsx` / `EventPanelIcons.tsx`, jamais d'Unicode.
- Prose et commentaires en français avec accents ; les chaînes UI passent par `t()` avec une entrée dans `src/ui/i18n.ts`.
- Commandes : `npx jest <fichier>` pour un test, `npx jest` pour la suite, `npx tsc --noEmit -p apps/windows/tsconfig.json` pour les types, `npx prettier --write <fichiers>` avant chaque commit.
- Le fichier `docs/PROCHAINE_VERSION.md` porte déjà les quatre points de cette livraison, décochés : ne les cocher qu'à la tâche 7.
- Commits : message en français, terminé par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` et
  `Claude-Session: https://claude.ai/code/session_01SxCJ2fBiwaP6F4N3WpeapB`.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `src/ui/calendar/CalendarItemMenu.tsx` (modifié) | Le menu de calendrier : lignes, coches, notes, sous-menus en cascade, clavier. |
| `src/ui/calendar/CalendarItemMenu.test.tsx` (créé) | Comportement de la cascade. |
| `src/ui/calendar/CalendarSidebar.css` (modifié) | Styles `.nc-cal-menu*` : chevron, coche, note, valeur, sous-menu. |
| `src/ui/calendar/CalendarSidebar.tsx` (modifié) | Prop `extraMenuItems` à la place des trois callbacks. |
| `src/ui/calendar/CalendarEventsPanel.tsx` (modifié) | Menu « ⋯ » sur `CalendarItemMenu`, `extraMenuItems`, en-tête portable, plus d'épinglage hors téléphone. |
| `src/ui/calendar/CalendarEventsPanel.css` (modifié) | PC : pousse la grille, fond transparent, fondu. |
| `src/ui/calendar/CalendarLayout.tsx` (modifié) | Passe `extraMenuItems` et `panelHeaderHost` ; plus d'état épinglé. |
| `apps/windows/src/ReminderCustomField.tsx` (créé) | Le champ nombre + unité, partagé par le dialogue et le sous-menu. |
| `apps/windows/src/ReminderChoiceDialog.tsx` (modifié) | Utilise `ReminderCustomField`. |
| `apps/windows/src/calendarMenuItems.tsx` (créé) | Construit Rappel / Liens ICS / Horaires de prière, PC et Android. |
| `apps/windows/src/calendarMenuItems.test.tsx` (créé) | Les entrées, les coches, les écritures. |
| `apps/windows/src/DesktopCalendar.tsx` (modifié) | Branche `extraMenuItems`, `panelHeaderHost`, `panelOpen`. |
| `apps/windows/src/DesktopTitlebar.tsx` / `.css` (modifiés) | Segment du panneau dans la barre. |
| `apps/windows/src/IcsFeedsPanel.tsx` (modifié) | Coque `SettingsDialog`. |
| `apps/windows/src/SettingsPrimitives.tsx` (modifié) | `SettingsDialog` accepte `className`. |
| `apps/windows/src/App.css` (modifié) | Styles ICS réécrits ; surface PC du panneau. |

---

### Task 1: `CalendarItemMenu` apprend les sous-menus

**Files:**
- Modify: `src/ui/calendar/CalendarItemMenu.tsx`
- Modify: `src/ui/calendar/CalendarSidebar.css` (bloc `.nc-cal-menu*`, lignes 400-490)
- Create: `src/ui/calendar/CalendarItemMenu.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface CalendarMenuItem {
      key: string;
      label: string;
      icon?: React.ReactNode;
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
      onClick?: () => void;
  }
  export default function CalendarItemMenu(props: { items: CalendarMenuItem[]; anchorRect: DOMRect; onClose: () => void }): JSX.Element
  ```
- Classes DOM : racine `.nc-cal-menu` (inchangée), sous-menu `.nc-cal-menu.nc-cal-menu--sub`, ligne `.nc-cal-menu-item[role=menuitem]`, `.nc-cal-menu-note`, `.nc-cal-menu-value`, `.nc-cal-menu-check`, `.nc-cal-menu-chevron`, bloc libre `.nc-cal-menu-content`.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/ui/calendar/CalendarItemMenu.test.tsx` :

```tsx
/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import CalendarItemMenu, { CalendarMenuItem } from "./CalendarItemMenu";

/*
 * Le menu d'un calendrier sait ouvrir un sous-menu : au survol après un court
 * délai d'intention, au clic, au clavier. Passer de la ligne à son sous-menu
 * ne le referme pas, et une ligne cochée le dit.
 */
describe("CalendarItemMenu en cascade", () => {
    let host: HTMLDivElement;
    const anchor = { top: 100, left: 100, right: 130, bottom: 120, width: 30, height: 20 } as DOMRect;

    beforeEach(() => {
        jest.useFakeTimers();
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-cal-menu, .nc-cal-menu-overlay")
            .forEach((node) => node.remove());
        jest.useRealTimers();
    });

    const render = (items: CalendarMenuItem[], onClose = jest.fn()) => {
        act(() => {
            ReactDOM.render(
                <CalendarItemMenu items={items} anchorRect={anchor} onClose={onClose} />,
                host
            );
        });
        return onClose;
    };

    const row = (label: string) =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>('.nc-cal-menu-item[role="menuitem"]')
        ).find((button) => button.textContent?.includes(label))!;

    const submenus = () => document.querySelectorAll(".nc-cal-menu--sub");

    const items = (extra: Partial<CalendarMenuItem> = {}): CalendarMenuItem[] => [
        { key: "plain", label: "Couleur", onClick: jest.fn() },
        {
            key: "reminder",
            label: "Rappel",
            children: [
                { key: "app", label: "Réglage de l'application", note: "5 minutes avant", checked: true, onClick: jest.fn() },
                { key: "30", label: "30 minutes avant", onClick: jest.fn() },
            ],
            ...extra,
        },
    ];

    it("ouvre le sous-menu au survol, après le délai d'intention", () => {
        render(items());
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
        });
        expect(submenus()).toHaveLength(0);
        act(() => {
            jest.advanceTimersByTime(150);
        });
        expect(submenus()).toHaveLength(1);
        expect(row("Rappel").getAttribute("aria-expanded")).toBe("true");
    });

    it("ouvre le sous-menu au clic sans refermer le menu", () => {
        const onClose = render(items());
        act(() => {
            row("Rappel").click();
        });
        expect(submenus()).toHaveLength(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("ne referme pas le sous-menu quand la souris passe de la ligne au sous-menu", () => {
        render(items());
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
            jest.advanceTimersByTime(150);
        });
        act(() => {
            Simulate.mouseLeave(row("Rappel"));
            Simulate.mouseEnter(submenus()[0]);
            jest.advanceTimersByTime(400);
        });
        expect(submenus()).toHaveLength(1);
    });

    it("referme le sous-menu quand la souris le quitte pour de bon", () => {
        render(items());
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
            jest.advanceTimersByTime(150);
        });
        act(() => {
            Simulate.mouseLeave(row("Rappel"));
            jest.advanceTimersByTime(320);
        });
        expect(submenus()).toHaveLength(0);
    });

    it("coche la ligne en cours et écrit sa note", () => {
        render(items());
        act(() => {
            row("Rappel").click();
        });
        const app = row("Réglage de l'application");
        expect(app.getAttribute("aria-checked")).toBe("true");
        expect(app.querySelector(".nc-cal-menu-check")).not.toBeNull();
        expect(app.querySelector(".nc-cal-menu-note")?.textContent).toBe("5 minutes avant");
        expect(row("30 minutes avant").getAttribute("aria-checked")).toBe("false");
    });

    it("agit et referme tout au clic sur une ligne du sous-menu", () => {
        const list = items();
        const onClose = render(list);
        act(() => {
            row("Rappel").click();
        });
        act(() => {
            row("30 minutes avant").click();
        });
        expect(list[1].children![1].onClick).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("laisse le menu ouvert sur une ligne keepOpen et rend son bloc libre", () => {
        const list = items({
            content: <input className="nc-test-field" aria-label="champ" />,
        });
        list[1].children!.push({ key: "custom", label: "Personnalisé", keepOpen: true, onClick: jest.fn() });
        const onClose = render(list);
        act(() => {
            row("Rappel").click();
        });
        expect(document.querySelector(".nc-cal-menu-content .nc-test-field")).not.toBeNull();
        act(() => {
            row("Personnalisé").click();
        });
        expect(onClose).not.toHaveBeenCalled();
        expect(submenus()).toHaveLength(1);
    });

    it("ouvre au clavier par flèche droite et referme par flèche gauche", () => {
        render(items());
        act(() => {
            Simulate.keyDown(row("Rappel"), { key: "ArrowRight" });
        });
        expect(submenus()).toHaveLength(1);
        act(() => {
            Simulate.keyDown(row("30 minutes avant"), { key: "ArrowLeft" });
        });
        expect(submenus()).toHaveLength(0);
    });

    it("referme le sous-menu par Échap, puis le menu", () => {
        const onClose = render(items());
        act(() => {
            row("Rappel").click();
        });
        act(() => {
            Simulate.keyDown(row("30 minutes avant"), { key: "Escape" });
        });
        expect(submenus()).toHaveLength(0);
        expect(onClose).not.toHaveBeenCalled();
        act(() => {
            Simulate.keyDown(row("Rappel"), { key: "Escape" });
        });
        expect(onClose).toHaveBeenCalled();
    });

    it("n'ouvre rien sur une ligne désactivée", () => {
        const list = items({ disabled: true });
        render(list);
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
            jest.advanceTimersByTime(150);
        });
        expect(submenus()).toHaveLength(0);
    });

    /* Le sous-menu se pose à droite de sa ligne, première ligne alignée sur
       elle ; quand la fenêtre manque de place à droite, il bascule à gauche. */
    it("bascule à gauche quand la place manque à droite", () => {
        const widthSpy = jest
            .spyOn(HTMLElement.prototype, "offsetWidth", "get")
            .mockReturnValue(230);
        const innerWidth = window.innerWidth;
        Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
        render(items());
        act(() => {
            row("Rappel").click();
        });
        const sub = submenus()[0] as HTMLElement;
        const left = parseFloat(sub.style.left);
        // À droite il déborderait (la racine est calée à droite de l'ancre,
        // vers 130 px, plus 230 px de menu, plus 230 px de sous-menu > 400).
        expect(left).toBeLessThan(130);
        widthSpy.mockRestore();
        Object.defineProperty(window, "innerWidth", { value: innerWidth, configurable: true });
    });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx jest src/ui/calendar/CalendarItemMenu.test.tsx`
Expected: échecs (aucun `.nc-cal-menu--sub`, `aria-expanded` absent, `onClick` requis en TS n'est pas bloquant sous ts-jest).

- [ ] **Step 3: Réécrire `CalendarItemMenu.tsx`**

```tsx
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
    const [path, setPath] = useState<string[]>([]);
    const [anchors, setAnchors] = useState<DOMRect[]>([]);
    const openTimer = useRef<number | null>(null);
    const exitTimer = useRef<number | null>(null);

    const clearTimer = (ref: React.MutableRefObject<number | null>) => {
        if (ref.current !== null) {
            window.clearTimeout(ref.current);
            ref.current = null;
        }
    };
    useEffect(() => () => {
        clearTimer(openTimer);
        clearTimer(exitTimer);
    }, []);

    const openAt = (depth: number, key: string, rect: DOMRect) => {
        clearTimer(openTimer);
        clearTimer(exitTimer);
        setPath((current) => [...current.slice(0, depth), key]);
        setAnchors((current) => [...current.slice(0, depth), rect]);
    };
    const closeBelow = (depth: number) => {
        setPath((current) => current.slice(0, depth));
        setAnchors((current) => current.slice(0, depth));
    };
    const scheduleClose = (depth: number) => {
        clearTimer(exitTimer);
        exitTimer.current = window.setTimeout(() => closeBelow(depth), EXIT_DELAY_MS);
    };
    const cancelClose = () => clearTimer(exitTimer);

    /* Les niveaux à rendre : la racine, puis un panneau par clé du chemin. */
    const levels: { items: CalendarMenuItem[]; content?: React.ReactNode; anchor: DOMRect | null }[] = [
        { items, anchor: null },
    ];
    let cursor = items;
    for (let depth = 0; depth < path.length; depth++) {
        const parent = cursor.find((item) => item.key === path[depth]);
        if (!parent || !parent.children) break;
        levels.push({ items: parent.children, content: parent.content, anchor: anchors[depth] });
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
                    onCloseAll={onClose}
                />
            ))}
        </>,
        document.body
    );
}
```

Puis le niveau :

```tsx
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
    onCloseLevel: () => void;
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
    onCloseAll,
}: MenuLevelProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const sub = depth > 0;
    const [pos, setPos] = useState<Placement>(() =>
        sub
            ? { top: anchorRect.top - PANEL_PADDING, left: anchorRect.right - SUBMENU_OVERLAP }
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
            if (top + h > window.innerHeight - MARGIN) top = anchorRect.top - h - 4;
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

    const onKeyDown = (event: React.KeyboardEvent, item: CalendarMenuItem, index: number) => {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
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
                    onCloseLevel();
                }
                break;
            case "Escape":
                event.preventDefault();
                event.stopPropagation();
                if (sub) onCloseLevel();
                else onCloseAll();
                break;
            case "ArrowDown":
                event.preventDefault();
                focusRow(items.filter((entry) => !entry.disabled).indexOf(item) + 1);
                break;
            case "ArrowUp":
                event.preventDefault();
                focusRow(items.filter((entry) => !entry.disabled).indexOf(item) - 1);
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
                const expanded = item.children ? openKey === item.key : undefined;
                return (
                    <button
                        key={item.key}
                        ref={(el) => {
                            if (el) rowRefs.current.set(item.key, el);
                            else rowRefs.current.delete(item.key);
                        }}
                        type="button"
                        role="menuitem"
                        className={`nc-cal-menu-item${item.danger ? " nc-cal-menu-danger" : ""}${
                            expanded ? " nc-cal-menu-item--open" : ""
                        }`}
                        disabled={item.disabled}
                        aria-haspopup={item.children ? "menu" : undefined}
                        aria-expanded={expanded}
                        aria-checked={item.checked === undefined ? undefined : item.checked}
                        onMouseEnter={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            if (item.children && !item.disabled) onIntent(item.key, rect);
                            else onLeaveRow();
                        }}
                        onMouseLeave={onLeaveRow}
                        onClick={(event) => activate(item, event.currentTarget.getBoundingClientRect())}
                        onKeyDown={(event) => onKeyDown(event, item, index)}
                    >
                        <span className="nc-cal-menu-icon">
                            {item.swatchColor !== undefined ? (
                                <span
                                    className="nc-cal-menu-swatch"
                                    style={{ backgroundColor: item.swatchColor }}
                                />
                            ) : (
                                item.icon
                            )}
                        </span>
                        <span className="nc-cal-menu-label">
                            {item.label}
                            {item.note && <small className="nc-cal-menu-note">{item.note}</small>}
                        </span>
                        {item.value && <span className="nc-cal-menu-value">{item.value}</span>}
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
```

Précision : au survol d'une ligne **sans** enfants, `onMouseEnter` appelle `onLeaveRow()`, qui programme `scheduleClose(depth)` : le sous-menu voisin se referme après 320 ms quand on glisse de « Rappel » à « Couleur ». Le test « referme le sous-menu quand la souris le quitte pour de bon » couvre le cas où la souris sort de la ligne sans entrer dans le sous-menu.

- [ ] **Step 4: Styles dans `CalendarSidebar.css`**

Ajouter après `.nc-cal-menu-danger .nc-cal-menu-icon { … }` :

```css
/* Un sous-menu se pose à droite de sa ligne, première ligne alignée sur elle,
   et touche le panneau parent de 3 px : c'est ce recouvrement qui permet à la
   souris de passer de l'un à l'autre sans traverser de vide. Même grammaire
   que le menu d'application Windows. */
.nc-cal-menu--sub {
    z-index: 10002;
}

.nc-cal-menu-item:disabled {
    opacity: 0.45;
    cursor: default;
}

.nc-cal-menu-item:disabled:hover {
    background: transparent !important;
}

/* Ouvert pèse plus lourd que survolé : la ligne dont le sous-menu est
   ouvert reste dessinée comme telle quand la souris est dans le sous-menu. */
.nc-cal-menu-item--open,
.nc-cal-menu-item--open:hover {
    background: var(--nc-bg-hover, var(--background-modifier-hover)) !important;
}

.nc-cal-menu-label {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.nc-cal-menu-note {
    font-size: 11px;
    color: var(--nc-text-secondary, var(--text-muted));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.nc-cal-menu-value {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--nc-text-secondary, var(--text-muted));
}

.nc-cal-menu-check,
.nc-cal-menu-chevron {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: auto;
    color: var(--nc-text-secondary, var(--text-muted));
}

.nc-cal-menu-check {
    color: var(--nc-accent, var(--interactive-accent));
}

/* La coche prend la place du chevron ; quand les deux sont là, le chevron
   seul reste calé au bord. */
.nc-cal-menu-check + .nc-cal-menu-chevron {
    margin-left: 6px;
}

/* Un bloc libre en fin de sous-menu (le champ personnalisé du rappel) : un
   filet au-dessus le sépare des lignes, et il garde leur retrait. */
.nc-cal-menu-content {
    margin-top: 3px;
    padding: 6px 10px 4px;
    border-top: 1px solid var(--nc-border, var(--background-modifier-border));
}
```

Et dans `.nc-cal-menu-label` existant, retirer `flex: 1;` n'est pas nécessaire : garder `flex: 1` et ajouter les propriétés ci-dessus dans la même règle (fusionner, une seule déclaration `.nc-cal-menu-label`).

- [ ] **Step 5: Lancer les tests**

Run: `npx jest src/ui/calendar/CalendarItemMenu.test.tsx src/ui/calendar/CalendarSidebar.test.ts`
Expected: tout passe. Puis `npx tsc --noEmit -p apps/windows/tsconfig.json` : `onClick` devenu optionnel ne casse rien (les appelants passent toujours `onClick`).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/ui/calendar/CalendarItemMenu.tsx src/ui/calendar/CalendarItemMenu.test.tsx src/ui/calendar/CalendarSidebar.css
git add src/ui/calendar/CalendarItemMenu.tsx src/ui/calendar/CalendarItemMenu.test.tsx src/ui/calendar/CalendarSidebar.css
git commit -m "Le menu d'un calendrier sait ouvrir des sous-menus en cascade"
```

---

### Task 2: Une seule prop `extraMenuItems`, et le menu « ⋯ » du panneau sur `CalendarItemMenu`

**Files:**
- Modify: `src/ui/calendar/CalendarSidebar.tsx` (props 60-75, destructuration ~110-120, `buildMenuItems` 230-300)
- Modify: `src/ui/calendar/CalendarEventsPanel.tsx` (props 44-95, état 149/225/283, en-tête 338-400, menu 491-625)
- Modify: `src/ui/calendar/CalendarLayout.tsx` (props 77-79, destructuration 185-187, rendu 381-384 et 420-424)
- Modify: `src/ui/calendar/CalendarSidebar.test.ts` (describe « ICS links menu entry » et « le menu d'un calendrier »)
- Modify: `src/ui/calendar/CalendarEventsPanel.calendarMenu.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx` (les trois props passées à `CalendarLayout`, ~4153-4160) — **temporairement** : passer `extraMenuItems` construit sur place avec les trois entrées actuelles (ouverture des dialogues), pour que l'app reste fonctionnelle jusqu'à la tâche 3.

**Interfaces:**
- Consumes: `CalendarMenuItem` (tâche 1).
- Produces: prop `extraMenuItems?: (calendarId: string) => CalendarMenuItem[]` sur `CalendarSidebar`, `CalendarEventsPanel`, `CalendarLayout`. Les props `onManageIcsFeeds`, `onManagePrayerTimes`, `onManageReminder` disparaissent des trois.

- [ ] **Step 1: Réécrire les tests de la colonne**

Dans `src/ui/calendar/CalendarSidebar.test.ts`, remplacer le describe `"ICS links menu entry"` et le describe `"le menu d'un calendrier"` par un seul :

```ts
/*
 * Ce que l'application ajoute au menu d'un calendrier local lui arrive tout
 * construit, par `extraMenuItems` : la colonne l'insère après « Ouvrir le
 * dossier », tel quel. Une surface qui ne passe rien (le plugin Obsidian)
 * n'a rien de plus.
 */
describe("le menu d'un calendrier", () => {
    const source = (id: string, name: string, type: "local" | "ical" = "local") => ({
        id,
        name,
        color: "#4477aa",
        editable: true,
        type,
    });

    const baseProps = () => ({ /* identique à l'ancien baseProps du describe « le menu d'un calendrier », sans onManagePrayerTimes/onManageReminder/onManageIcsFeeds */ });

    /* openMenu, mount, unmount, labels : reprendre tels quels depuis l'ancien describe. */

    it("insère les entrées de l'application après « Ouvrir le dossier »", () => {
        const extraMenuItems = jest.fn(() => [
            { key: "reminder", label: t("Reminder"), onClick: () => {} },
            { key: "ics-feeds", label: t("ICS links"), onClick: () => {} },
        ]);
        const host = mount({ calendarSources: [source("cours", "Cours")], extraMenuItems });
        try {
            const found = labels(openMenu(host, "Cours"));
            expect(extraMenuItems).toHaveBeenCalledWith("cours");
            const folder = found.findIndex((label) => label.includes("Open folder"));
            expect(found[folder + 1]).toContain(t("Reminder"));
            expect(found[folder + 2]).toContain(t("ICS links"));
        } finally {
            unmount(host);
        }
    });

    it("n'ajoute rien à un calendrier qui n'est pas local", () => {
        const extraMenuItems = jest.fn(() => [{ key: "reminder", label: t("Reminder"), onClick: () => {} }]);
        const host = mount({ calendarSources: [source("abo", "Abonnement", "ical")], extraMenuItems });
        try {
            expect(labels(openMenu(host, "Abonnement")).some((l) => l.includes(t("Reminder")))).toBe(false);
            expect(extraMenuItems).not.toHaveBeenCalled();
        } finally {
            unmount(host);
        }
    });

    it("n'a rien de plus quand la surface ne passe rien", () => {
        const host = mount({ calendarSources: [source("cours", "Cours")] });
        try {
            expect(labels(openMenu(host, "Cours")).some((l) => l.includes(t("Reminder")))).toBe(false);
        } finally {
            unmount(host);
        }
    });

    it("remonte le clic d'une entrée de l'application", () => {
        const onClick = jest.fn();
        const host = mount({
            calendarSources: [source("cours", "Cours")],
            extraMenuItems: () => [{ key: "reminder", label: t("Reminder"), onClick }],
        });
        try {
            const entry = openMenu(host, "Cours").find((item) => item.textContent?.includes(t("Reminder")));
            act(() => entry?.click());
            expect(onClick).toHaveBeenCalled();
        } finally {
            unmount(host);
        }
    });
});
```

Le describe `"calendar removal wording"` reste. Le test source-level `'key: "ics-feeds"'` / `onManageIcsFeeds(source.id)` de l'ancien describe est supprimé avec lui.

- [ ] **Step 2: Réécrire le test du menu du panneau**

`src/ui/calendar/CalendarEventsPanel.calendarMenu.test.tsx` : même `baseProps` (sans `pinned`/`onTogglePinned`, voir tâche 4 — les laisser pour l'instant, TS ne bloque pas sous ts-jest), et :

```tsx
    /** Ouvre le menu « ⋯ » du panneau et rend ses lignes, portées sur body. */
    const openMenu = (extra: Record<string, unknown>, name = "Cours") => {
        act(() => { ReactDOM.unmountComponentAtNode(host); });
        act(() => {
            ReactDOM.render(
                React.createElement(CalendarEventsPanel, { ...baseProps(name), ...extra } as React.ComponentProps<typeof CalendarEventsPanel>),
                host
            );
        });
        const trigger = document.body.querySelector(`[data-nc-tooltip="${t("More options")}"]`);
        act(() => {
            (trigger as HTMLElement)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        return Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nc-cal-menu [role="menuitem"]'));
    };

    it("rend son menu par le même composant que la colonne", () => {
        const rows = openMenu({});
        expect(rows.map((r) => r.textContent)).toEqual(
            expect.arrayContaining([
                expect.stringContaining(t("Color")),
                expect.stringContaining(t("Set as default")),
                expect.stringContaining(t("Show only this view")),
                expect.stringContaining(t("Show totals")),
                expect.stringContaining(t("Remove view from list")),
            ])
        );
    });

    it("insère les entrées de l'application avant « Retirer la vue »", () => {
        const rows = openMenu({ extraMenuItems: () => [{ key: "reminder", label: t("Reminder"), onClick: () => {} }] });
        const texts = rows.map((r) => r.textContent ?? "");
        const reminder = texts.findIndex((x) => x.includes(t("Reminder")));
        expect(reminder).toBeGreaterThan(-1);
        expect(texts[texts.length - 1]).toContain(t("Remove view from list"));
        expect(reminder).toBeLessThan(texts.length - 1);
    });

    it("coche « Afficher les totaux » une fois choisi", () => {
        const first = openMenu({});
        const totals = first.find((r) => r.textContent?.includes(t("Show totals")))!;
        expect(totals.getAttribute("aria-checked")).toBe("false");
        act(() => totals.click());
        // Le clic referme le menu ; le rouvrir montre la coche.
        const trigger = document.body.querySelector(`[data-nc-tooltip="${t("More options")}"]`);
        act(() => { (trigger as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        const again = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nc-cal-menu [role="menuitem"]'));
        expect(again.find((r) => r.textContent?.includes(t("Show totals")))!.getAttribute("aria-checked")).toBe("true");
    });

    it("n'a rien de plus quand la surface ne passe rien", () => {
        expect(openMenu({}).some((r) => r.textContent?.includes(t("Reminder")))).toBe(false);
    });
```

`afterEach` nettoie aussi `.nc-cal-menu, .nc-cal-menu-overlay`. Vérifier que les clés `"Show only this view"`, `"Set as default"`, `"Show totals"`, `"Remove view from list"`, `"Color"` existent dans `i18n.ts` (elles sont utilisées par le composant aujourd'hui).

- [ ] **Step 3: Vérifier qu'ils échouent**

Run: `npx jest src/ui/calendar/CalendarSidebar.test.ts src/ui/calendar/CalendarEventsPanel.calendarMenu.test.tsx`
Expected: échecs (prop inconnue, `.nc-cal-menu` absent du panneau).

- [ ] **Step 4: `CalendarSidebar.tsx`**

- Props : supprimer `onManageIcsFeeds`, `onManagePrayerTimes`, `onManageReminder` ; ajouter
  ```ts
  /** Ce que l'application ajoute au menu d'un calendrier local (rappel,
   *  liens ICS, horaires de prière), déjà construit : la colonne l'insère
   *  après « Ouvrir le dossier ». Absent sur une surface qui n'a rien à y
   *  mettre, comme le plugin Obsidian. */
  extraMenuItems?: (calendarId: string) => CalendarMenuItem[];
  ```
- Destructuration : idem.
- `buildMenuItems` : dans le bloc `if (source.type === "local")`, après l'entrée `open-folder`, remplacer les trois blocs (`ics-feeds`, `reminder`, `prayer-times`) par :
  ```ts
  if (extraMenuItems) items.push(...extraMenuItems(source.id));
  ```
- Retirer les imports devenus inutiles : `BellIcon`, `ClockIcon`, `isPrayerCalendarName`, et `LinkIcon` seulement s'il n'est plus utilisé ailleurs dans le fichier (il l'est par « Edit link » : le garder).

- [ ] **Step 5: `CalendarEventsPanel.tsx`**

- Props : supprimer les trois callbacks ; ajouter `extraMenuItems?: (calendarId: string) => CalendarMenuItem[];` avec le même commentaire.
- Import : `import CalendarItemMenu, { CalendarMenuItem } from "./CalendarItemMenu";`
- État : `type OpenMenu = "settings" | null;` ; ajouter `const [moreAnchor, setMoreAnchor] = React.useState<DOMRect | null>(null);` ; supprimer `colorRowRef`.
- Dans l'effet de fermeture au `pointerdown` (ligne ~235) rien ne change : le menu « ⋯ » est porté sur body et se ferme par son propre overlay.
- Dans l'effet de réinitialisation sur `calendar.id`, ajouter `setMoreAnchor(null);`.
- Bouton « ⋯ » de l'en-tête :
  ```tsx
  <button
      type="button"
      className={`nc-cep-icon-btn${moreAnchor ? " nc-active" : ""}`}
      aria-label={t("More options")}
      data-nc-tooltip={t("More options")}
      aria-haspopup="menu"
      aria-expanded={moreAnchor !== null}
      onClick={(event) => {
          setOpenMenu(null);
          setMoreAnchor((current) =>
              current ? null : event.currentTarget.getBoundingClientRect()
          );
      }}
  >
      <MoreHorizontalIcon />
  </button>
  ```
- Construire les entrées, juste avant le `return` :
  ```tsx
  /* Le menu « ⋯ » : les mêmes lignes qu'avant, rendues par le menu de la
     colonne plutôt que par une seconde implémentation. Ce que l'application
     ajoute (rappel, liens ICS, horaires de prière) arrive construit par
     `extraMenuItems`, avant la dernière ligne. */
  const moreItems: CalendarMenuItem[] = [
      {
          key: "color",
          label: t("Color"),
          swatchColor: calendar.color,
          value: getCalendarColorName(calendar.color),
          onClick: () => {
              if (moreAnchor) setColorAnchor(moreAnchor);
          },
      },
      {
          key: "default",
          label: t("Set as default"),
          icon: <CalendarGlyphIcon size={15} />,
          disabled: !calendar.editable || calendar.id === defaultCalendarId,
          onClick: () => onSetDefault(calendar.id),
      },
      {
          key: "solo",
          label: t("Show only this view"),
          icon: <EyeIcon size={15} />,
          onClick: () => onShowOnly(calendar.id),
      },
      {
          key: "totals",
          label: t("Show totals"),
          icon: <ChartColumnIcon size={15} />,
          checked: showTotals,
          onClick: () => setShowTotals((value) => !value),
      },
      ...(calendar.type === "local" && extraMenuItems ? extraMenuItems(calendar.id) : []),
      {
          key: "remove",
          label: t("Remove view from list"),
          icon: <ListXIcon size={15} />,
          danger: true,
          onClick: () => onRemove(calendar.id),
      },
  ];
  ```
  Vérifier les libellés exacts utilisés aujourd'hui dans le bloc `openMenu === "more"` (lignes 491-625) et les reprendre à l'identique.
- Remplacer tout le bloc `{openMenu === "more" && (<div className="nc-cep-popover" role="menu">…</div>)}` par :
  ```tsx
  {moreAnchor && (
      <CalendarItemMenu
          items={moreItems}
          anchorRect={moreAnchor}
          onClose={() => setMoreAnchor(null)}
      />
  )}
  ```
- `toggleMenu` ne sert plus qu'à `"settings"` : simplifier sa signature en `() => …` ou la laisser, mais retirer l'appel `toggleMenu("more")`.
- Supprimer les imports devenus inutiles (`ChevronRightIcon` si plus utilisé, `LinkIcon` si plus utilisé, `ClockIcon`, `BellIcon`, `isPrayerCalendarName`). `ColorPicker` reste (la pastille l'ouvre toujours, ancré sur le bouton « ⋯ »).
- Les règles CSS `.nc-cep-menu-row`, `.nc-cep-menu-label`, `.nc-cep-menu-value`, `.nc-cep-menu-swatch`, `.nc-cep-menu-separator`, `.nc-cep-menu-danger`, `.nc-cep-menu-check` de `CalendarEventsPanel.css` deviennent mortes : les supprimer (vérifier par `grep -rn "nc-cep-menu-" src apps/windows/src` qu'aucun `.tsx` ne les cite encore).

- [ ] **Step 6: `CalendarLayout.tsx`**

Remplacer les trois props par `extraMenuItems?: (calendarId: string) => CalendarMenuItem[];` (import du type depuis `./CalendarItemMenu`), la destructuration, et les deux passages (`CalendarSidebar` et `CalendarEventsPanel`) par `extraMenuItems={extraMenuItems}`.

- [ ] **Step 7: `DesktopCalendar.tsx`, branchement provisoire**

Remplacer les trois props passées à `CalendarLayout` par :

```tsx
extraMenuItems={(calendarId: string) => [
    { key: "reminder", label: t("Reminder"), icon: <BellIcon />, onClick: () => setReminderDialogCalendarId(calendarId) },
    { key: "ics-feeds", label: t("ICS links"), icon: <LinkIcon />, onClick: () => setIcsFeedsPanelCalendarId(calendarId) },
    ...(isPrayerCalendarName(calendarById.get(calendarId)?.name)
        ? [{ key: "prayer-times", label: t("Prayer times"), icon: <ClockIcon />, onClick: () => setPrayerDialogCalendarId(calendarId) }]
        : []),
]}
```

avec les imports `BellIcon`, `ClockIcon` depuis `../../../src/ui/calendar/EventPanelIcons` et `LinkIcon` depuis `../../../src/ui/calendar/Icons` (vérifier les noms exportés). La tâche 3 remplace ce bloc par `buildCalendarMenuItems`.

Vérifier aussi `src/ui/calendar/CalendarApp.tsx` : `grep -n "onManageIcsFeeds\|onManagePrayerTimes\|onManageReminder" src/ui/calendar/CalendarApp.tsx` — retirer toute occurrence.

- [ ] **Step 8: Tests, types, suite**

Run: `npx tsc --noEmit -p apps/windows/tsconfig.json && npx jest`
Expected: tout vert. Si `CalendarEventsPanel.icsFilter.test.tsx` ou un test de style cite `nc-cep-menu-row` ou `.nc-cep-popover` pour le menu « ⋯ », l'adapter (le popover des filtres, lui, reste).

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/ui/calendar/CalendarSidebar.tsx src/ui/calendar/CalendarEventsPanel.tsx src/ui/calendar/CalendarEventsPanel.css src/ui/calendar/CalendarLayout.tsx src/ui/calendar/CalendarSidebar.test.ts src/ui/calendar/CalendarEventsPanel.calendarMenu.test.tsx apps/windows/src/DesktopCalendar.tsx
git add -A src/ui/calendar apps/windows/src/DesktopCalendar.tsx
git commit -m "Une seule prop pour ce que l'application ajoute au menu d'un calendrier, et le panneau rend son menu par le même composant que la colonne"
```

---

### Task 3: Le sous-menu Rappel, et `calendarMenuItems.tsx`

**Files:**
- Create: `apps/windows/src/ReminderCustomField.tsx`
- Modify: `apps/windows/src/ReminderChoiceDialog.tsx` (utilise le champ extrait)
- Create: `apps/windows/src/calendarMenuItems.tsx`
- Create: `apps/windows/src/calendarMenuItems.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx` (remplace le bloc provisoire de la tâche 2)
- Modify: `src/ui/i18n.ts` si une clé manque

**Interfaces:**
- Produces:
  ```ts
  // ReminderCustomField.tsx
  export default function ReminderCustomField(props: {
      /** Le délai enregistré, ou null quand c'est celui de l'application qui vaut. */
      minutes: number | null;
      /** Le délai de l'application : ce dont on part pour s'en écarter. */
      fallbackMinutes: number;
      onChange: (minutes: number) => void;
  }): JSX.Element

  // calendarMenuItems.tsx
  export interface CalendarMenuContext {
      calendars: readonly { id: string; name: string; relativePath: string }[];
      reminderMinutes: number;
      calendarReminderMinutes: Record<string, number>;
      /** Vrai sur téléphone : pas de survol, les dialogues restent. */
      onPhone: boolean;
      setCalendarReminder: (relativePath: string, minutes: number | null) => void;
      openReminderDialog: (calendarId: string) => void;
      openIcsFeeds: (calendarId: string) => void;
      openPrayerTimes: (calendarId: string) => void;
  }
  export function buildCalendarMenuItems(context: CalendarMenuContext, calendarId: string): CalendarMenuItem[]
  ```

- [ ] **Step 1: Tests du constructeur d'entrées**

`apps/windows/src/calendarMenuItems.test.tsx` :

```tsx
/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { buildCalendarMenuItems, CalendarMenuContext } from "./calendarMenuItems";
import { applyLanguage, t } from "../../../src/ui/i18n";

describe("buildCalendarMenuItems", () => {
    beforeEach(() => applyLanguage("fr"));

    const context = (over: Partial<CalendarMenuContext> = {}): CalendarMenuContext => ({
        calendars: [
            { id: "cours", name: "Cours", relativePath: "Études" },
            { id: "islam", name: "الْإِسْلَامُ", relativePath: "الْإِسْلَامُ" },
        ],
        reminderMinutes: 10,
        calendarReminderMinutes: {},
        onPhone: false,
        setCalendarReminder: jest.fn(),
        openReminderDialog: jest.fn(),
        openIcsFeeds: jest.fn(),
        openPrayerTimes: jest.fn(),
        ...over,
    });

    const labels = (ctx: CalendarMenuContext, id: string) =>
        buildCalendarMenuItems(ctx, id).map((item) => item.label);

    it("propose Rappel et Liens ICS à tout calendrier, Horaires de prière au seul calendrier Islam", () => {
        expect(labels(context(), "cours")).toEqual([t("Reminder"), t("ICS links")]);
        expect(labels(context(), "islam")).toEqual([t("Reminder"), t("ICS links"), t("Prayer times")]);
    });

    it("sur PC, Rappel est un sous-menu qui coche le réglage de l'application par défaut", () => {
        const [reminder] = buildCalendarMenuItems(context(), "cours");
        expect(reminder.children).toBeDefined();
        const app = reminder.children![0];
        expect(app.label).toBe(t("App setting"));
        expect(app.note).toBe("10 minutes avant");
        expect(app.checked).toBe(true);
        expect(reminder.children!.map((c) => c.label)).toEqual([
            t("App setting"), t("No reminder"), "5 minutes avant", "10 minutes avant",
            "15 minutes avant", "30 minutes avant", "1 heure avant", t("Custom"),
        ]);
    });

    it("coche la valeur enregistrée, et écrit celle qu'on choisit", () => {
        const ctx = context({ calendarReminderMinutes: { Études: 30 } });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        const thirty = reminder.children!.find((c) => c.label === "30 minutes avant")!;
        expect(thirty.checked).toBe(true);
        reminder.children!.find((c) => c.label === "5 minutes avant")!.onClick!();
        expect(ctx.setCalendarReminder).toHaveBeenCalledWith("Études", 5);
    });

    it("« Réglage de l'application » retire l'entrée du calendrier", () => {
        const ctx = context({ calendarReminderMinutes: { Études: 30 } });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        reminder.children![0].onClick!();
        expect(ctx.setCalendarReminder).toHaveBeenCalledWith("Études", null);
    });

    it("coche Personnalisé pour un délai hors liste, et son champ écrit en minutes", () => {
        const ctx = context({ calendarReminderMinutes: { Études: 120 } });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        const custom = reminder.children!.find((c) => c.label === t("Custom"))!;
        expect(custom.checked).toBe(true);
        expect(custom.keepOpen).toBe(true);
        const host = document.createElement("div");
        document.body.appendChild(host);
        act(() => { ReactDOM.render(<>{reminder.content}</>, host); });
        const amount = host.querySelector<HTMLInputElement>(".nc-reminder-custom__amount")!;
        expect(amount.value).toBe("2");
        act(() => {
            amount.value = "3";
            Simulate.change(amount);
        });
        expect(ctx.setCalendarReminder).toHaveBeenLastCalledWith("Études", 180);
        act(() => { ReactDOM.unmountComponentAtNode(host); });
        host.remove();
    });

    it("sur téléphone, Rappel ouvre le dialogue", () => {
        const ctx = context({ onPhone: true });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        expect(reminder.children).toBeUndefined();
        reminder.onClick!();
        expect(ctx.openReminderDialog).toHaveBeenCalledWith("cours");
    });

    it("Liens ICS et Horaires de prière ouvrent leurs fenêtres", () => {
        const ctx = context();
        const items = buildCalendarMenuItems(ctx, "islam");
        items[1].onClick!();
        items[2].onClick!();
        expect(ctx.openIcsFeeds).toHaveBeenCalledWith("islam");
        expect(ctx.openPrayerTimes).toHaveBeenCalledWith("islam");
    });

    it("ne construit rien pour un calendrier inconnu", () => {
        expect(buildCalendarMenuItems(context(), "absent")).toEqual([]);
    });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx jest apps/windows/src/calendarMenuItems.test.tsx`
Expected: module introuvable.

- [ ] **Step 3: Extraire `ReminderCustomField.tsx`**

```tsx
import * as React from "react";
import {
    REMINDER_UNITS,
    ReminderDelay,
    reminderMinutesFrom,
    splitReminderDelay,
} from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";

export interface ReminderCustomFieldProps {
    /** Le délai enregistré, ou `null` quand c'est celui de l'application qui vaut. */
    minutes: number | null;
    /** Le délai de l'application : ce dont on part pour s'en écarter. */
    fallbackMinutes: number;
    onChange: (minutes: number) => void;
}

/**
 * Un nombre et son unité, pour les délais que la liste ne propose pas.
 *
 * Partagé par le dialogue (Android, Paramètres) et par le sous-menu du
 * calendrier (PC) : c'est le même champ, avec le même brouillon.
 */
export default function ReminderCustomField({
    minutes,
    fallbackMinutes,
    onChange,
}: ReminderCustomFieldProps) {
    // Le champ s'ouvre sur le délai en cours, relu dans son unité ; à défaut
    // sur celui de l'application, qui est ce dont on part pour s'en écarter.
    const [draft, setDraft] = React.useState(() =>
        splitReminderDelay(minutes ?? fallbackMinutes)
    );

    /*
     * Le brouillon est tenu dans une référence autant que dans un état.
     *
     * Changer le nombre puis l'unité, c'est deux modifications avant que React
     * ne redessine : lue depuis l'état, la seconde repartirait du nombre
     * d'avant et « 2 heures » serait enregistré comme quarante-cinq heures.
     */
    const draftRef = React.useRef(draft);

    const commit = (patch: Partial<ReminderDelay>) => {
        const next = { ...draftRef.current, ...patch };
        draftRef.current = next;
        setDraft(next);
        onChange(reminderMinutesFrom(next.amount, next.unit));
    };

    return (
        <div className="nc-reminder-custom">
            <input
                type="number"
                min={1}
                className="nc-reminder-custom__amount"
                aria-label={t("Custom")}
                value={draft.amount}
                onChange={(event) => commit({ amount: Number(event.target.value) })}
            />
            {/* Trois unités, donc trois boutons : un menu déroulant natif
                ouvrirait un popup dessiné par le système, que le thème ne sait
                pas habiller. */}
            <div className="nc-reminder-custom__units" role="group" aria-label={t("Unit")}>
                {REMINDER_UNITS.map((unit) => (
                    <button
                        key={unit}
                        type="button"
                        data-unit={unit}
                        className="nc-reminder-custom__unit"
                        aria-pressed={draft.unit === unit}
                        onClick={() => commit({ unit })}
                    >
                        {t(unit)}
                    </button>
                ))}
            </div>
            <span className="nc-reminder-custom__suffix">{t("before")}</span>
        </div>
    );
}
```

Dans `ReminderChoiceDialog.tsx` : supprimer `draft`, `draftRef`, `commit`, les imports `REMINDER_UNITS`, `ReminderDelay`, `reminderMinutesFrom`, `splitReminderDelay` ; remplacer le `<div className="nc-reminder-custom">…</div>` par
```tsx
<ReminderCustomField
    minutes={minutes}
    fallbackMinutes={inheritedMinutes ?? 10}
    onChange={onPick}
/>
```
et la ligne « Personnalisé » appelle `onPick(reminderMinutesFrom(...))` ? Non : elle n'a plus accès au brouillon. Faire porter au champ une méthode impérative serait lourd ; à la place, la ligne « Personnalisé » du dialogue ne fait rien d'autre que rester cochée : `onClick` vide, et c'est le champ qui écrit. Adapter `ReminderChoiceDialog.test.tsx` en conséquence si un test cliquait la ligne Personnalisé (aucun aujourd'hui : « ranges the chosen unit into minutes » n'écrit que dans le champ).

Run: `npx jest apps/windows/src/ReminderChoiceDialog.test.tsx` — doit rester vert.

- [ ] **Step 4: `calendarMenuItems.tsx`**

```tsx
import * as React from "react";
import type { CalendarMenuItem } from "../../../src/ui/calendar/CalendarItemMenu";
import { BellIcon, ClockIcon } from "../../../src/ui/calendar/EventPanelIcons";
import { LinkIcon } from "../../../src/ui/calendar/Icons";
import { isPrayerCalendarName } from "../../../src/ui/calendar/prayerCalendarName";
import { reminderDelayLabel } from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";
import { REMINDER_CHOICES } from "./platform/desktopWorkspacePreferences";
import ReminderCustomField from "./ReminderCustomField";

export interface CalendarMenuContext {
    calendars: readonly { id: string; name: string; relativePath: string }[];
    /** Le rappel des Paramètres, celui de tous les calendriers qui n'ont rien dit. */
    reminderMinutes: number;
    /** Par chemin de calendrier, le délai qui s'en écarte. */
    calendarReminderMinutes: Record<string, number>;
    /** Vrai sur téléphone : pas de survol, les dialogues restent. */
    onPhone: boolean;
    /** `null` retire l'entrée : le calendrier suit de nouveau l'application. */
    setCalendarReminder: (relativePath: string, minutes: number | null) => void;
    openReminderDialog: (calendarId: string) => void;
    openIcsFeeds: (calendarId: string) => void;
    openPrayerTimes: (calendarId: string) => void;
}

/**
 * Le sous-menu Rappel : la même liste que le dialogue, la coche sur le choix
 * courant, et le champ personnalisé en bloc libre à la fin. Choisir une ligne
 * écrit et referme ; écrire dans le champ écrit et laisse ouvert.
 */
function reminderSubmenu(
    context: CalendarMenuContext,
    relativePath: string
): Pick<CalendarMenuItem, "children" | "content"> {
    const current = context.calendarReminderMinutes[relativePath] ?? null;
    const isCustom = current !== null && !REMINDER_CHOICES.includes(current);
    const set = (minutes: number | null) => context.setCalendarReminder(relativePath, minutes);
    return {
        children: [
            {
                key: "inherit",
                label: t("App setting"),
                note: reminderDelayLabel(context.reminderMinutes),
                checked: current === null,
                onClick: () => set(null),
            },
            ...REMINDER_CHOICES.map((preset) => ({
                key: String(preset),
                label: reminderDelayLabel(preset),
                checked: current === preset,
                onClick: () => set(preset),
            })),
            {
                key: "custom",
                label: t("Custom"),
                checked: isCustom,
                keepOpen: true,
                onClick: () => undefined,
            },
        ],
        content: (
            <ReminderCustomField
                // La clé force un champ neuf quand le calendrier ou sa valeur
                // change de l'extérieur : le brouillon repart de la valeur lue.
                key={`${relativePath}:${current ?? "inherit"}`}
                minutes={current}
                fallbackMinutes={context.reminderMinutes}
                onChange={(minutes) => set(minutes)}
            />
        ),
    };
}

/**
 * Ce que l'application ajoute au menu d'un calendrier local : Rappel, Liens
 * ICS, et Horaires de prière pour le seul calendrier qui porte ce nom.
 *
 * Sur PC le rappel est un sous-menu ; sur téléphone, qui n'a pas de survol,
 * il ouvre le dialogue. Les deux autres ouvrent leurs fenêtres partout : ce
 * sont des champs à écrire, pas des choix.
 */
export function buildCalendarMenuItems(
    context: CalendarMenuContext,
    calendarId: string
): CalendarMenuItem[] {
    const calendar = context.calendars.find((entry) => entry.id === calendarId);
    if (!calendar) return [];
    const reminder: CalendarMenuItem = {
        key: "reminder",
        label: t("Reminder"),
        icon: <BellIcon />,
        ...(context.onPhone
            ? { onClick: () => context.openReminderDialog(calendarId) }
            : reminderSubmenu(context, calendar.relativePath)),
    };
    const items: CalendarMenuItem[] = [
        reminder,
        {
            key: "ics-feeds",
            label: t("ICS links"),
            icon: <LinkIcon />,
            onClick: () => context.openIcsFeeds(calendarId),
        },
    ];
    if (isPrayerCalendarName(calendar.name)) {
        items.push({
            key: "prayer-times",
            label: t("Prayer times"),
            icon: <ClockIcon />,
            onClick: () => context.openPrayerTimes(calendarId),
        });
    }
    return items;
}
```

Vérifier l'export `LinkIcon` dans `src/ui/calendar/Icons.tsx` (utilisé par `CalendarSidebar.tsx`, donc présent) et sa signature (`size` optionnel).

- [ ] **Step 5: Brancher dans `DesktopCalendar.tsx`**

Remplacer le bloc provisoire de la tâche 2 par :

```tsx
extraMenuItems={extraMenuItems}
```

avec, plus haut dans le composant (après `prayerCalendar`) :

```tsx
/* Ce que le menu d'un calendrier propose en plus, construit ici parce que
   c'est ici que vivent les préférences et les dialogues. */
const setCalendarReminder = useCallback(
    (relativePath: string, minutes: number | null) => {
        // Retirer l'entrée plutôt que d'y recopier le réglage de
        // l'application : figer une copie ferait cesser ce calendrier de le
        // suivre le jour où il change.
        const next = { ...preferences.calendarReminderMinutes };
        if (minutes === null) delete next[relativePath];
        else next[relativePath] = minutes;
        void updateWorkspacePreferences({ calendarReminderMinutes: next });
    },
    [preferences.calendarReminderMinutes, updateWorkspacePreferences]
);
const menuContext = useMemo(
    (): CalendarMenuContext => ({
        calendars,
        reminderMinutes: preferences.reminderMinutes,
        calendarReminderMinutes: preferences.calendarReminderMinutes,
        onPhone: isAndroid,
        setCalendarReminder,
        openReminderDialog: setReminderDialogCalendarId,
        openIcsFeeds: setIcsFeedsPanelCalendarId,
        openPrayerTimes: setPrayerDialogCalendarId,
    }),
    [calendars, isAndroid, preferences.calendarReminderMinutes, preferences.reminderMinutes, setCalendarReminder]
);
const extraMenuItems = useCallback(
    (calendarId: string) => buildCalendarMenuItems(menuContext, calendarId),
    [menuContext]
);
```

Le `ReminderChoiceDialog` déjà branché dans `DesktopCalendar` garde son `onPick` ; le factoriser sur `setCalendarReminder(path, minutes)`. Vérifier que `updateWorkspacePreferences` est stable (référence de `useCallback`) ou l'exclure des dépendances avec un commentaire, comme le fichier le fait ailleurs (`grep -n "updateWorkspacePreferences" apps/windows/src/DesktopCalendar.tsx | head`).

- [ ] **Step 6: Tests, types, suite, commit**

Run: `npx tsc --noEmit -p apps/windows/tsconfig.json && npx jest`
Expected: vert.

```bash
npx prettier --write apps/windows/src/ReminderCustomField.tsx apps/windows/src/ReminderChoiceDialog.tsx apps/windows/src/calendarMenuItems.tsx apps/windows/src/calendarMenuItems.test.tsx apps/windows/src/DesktopCalendar.tsx
git add apps/windows/src/ReminderCustomField.tsx apps/windows/src/ReminderChoiceDialog.tsx apps/windows/src/calendarMenuItems.tsx apps/windows/src/calendarMenuItems.test.tsx apps/windows/src/DesktopCalendar.tsx
git commit -m "Sur PC, le rappel d'un calendrier se règle dans un sous-menu au survol"
```

---

### Task 4: Le panneau, sur PC : pousse la grille, fond transparent, fondu, plus d'épinglage

**Files:**
- Modify: `src/ui/calendar/CalendarEventsPanel.css` (lignes 14-86)
- Modify: `src/ui/calendar/CalendarEventsPanel.tsx` (props `pinned`/`onTogglePinned`, bouton d'épinglage ~392-410)
- Modify: `src/ui/calendar/CalendarLayout.tsx` (`panelPinned` 228, effet 233-247, props passées 405-419)
- Modify: `apps/windows/src/App.css` (règle `.nc-desktop--calendar .nc-cep` ligne 768)
- Create: `src/ui/calendar/CalendarEventsPanel.desktop.style.test.ts`

**Interfaces:**
- Produces: `CalendarEventsPanel` n'a plus `pinned` ni `onTogglePinned` ; classe `.nc-cep-pinned` supprimée.

- [ ] **Step 1: Test de style**

`src/ui/calendar/CalendarEventsPanel.desktop.style.test.ts` :

```ts
import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(path.join(__dirname, "CalendarEventsPanel.css"), "utf8");
const appCss = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "apps", "windows", "src", "App.css"),
    "utf8"
);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const ruleOf = (source: string, selector: string): string => {
    const clean = strip(source);
    const start = clean.indexOf(selector + " {");
    if (start === -1) throw new Error(`Missing CSS selector: ${selector}`);
    const end = clean.indexOf("}", start);
    return clean.slice(start, end);
};

/*
 * Sur PC le panneau pousse la grille au lieu de la recouvrir : rien ne passe
 * derrière, donc rien à cacher, donc un fond transparent comme la colonne.
 * Et une seule transition, un fondu : plus de glissement ni de largeur
 * animée, qui remettait la grille en page à chaque image.
 */
describe("le panneau d'un calendrier sur PC", () => {
    it("prend sa largeur dès qu'il est ouvert, sans animer la largeur", () => {
        const rule = ruleOf(css, "body:not(.nc-platform-android) .nc-cep-slot.nc-cep-open");
        expect(rule).toContain("width: var(--cep-width)");
        expect(ruleOf(css, "body:not(.nc-platform-android) .nc-cep-slot")).toContain("transition: none");
    });

    it("ne glisse plus : un fondu de 150 ms, et c'est tout", () => {
        const rule = ruleOf(css, "body:not(.nc-platform-android) .nc-cep");
        expect(rule).toContain("transform: none");
        expect(rule).toContain("transition: opacity 150ms ease");
        expect(rule).toContain("box-shadow: none");
    });

    it("porte la teinte de la colonne, sans flou", () => {
        const rule = ruleOf(appCss, ".nc-desktop--calendar .nc-cep");
        expect(rule).toContain("var(--nc-sidebar-container-background");
        expect(rule).toContain("backdrop-filter: none");
        expect(rule).not.toContain("--nc-float-surface-secondary");
    });

    it("n'a plus d'état épinglé", () => {
        expect(css).not.toContain("nc-cep-pinned");
        const component = fs.readFileSync(path.join(__dirname, "CalendarEventsPanel.tsx"), "utf8");
        expect(component).not.toContain("onTogglePinned");
        expect(component).not.toContain('t("Pin panel")');
    });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx jest src/ui/calendar/CalendarEventsPanel.desktop.style.test.ts`

- [ ] **Step 3: CSS**

Dans `CalendarEventsPanel.css`, remplacer les règles `.nc-cep-slot.nc-cep-pinned { … }` et `.nc-cep-slot.nc-cep-pinned .nc-cep { … }` par (et adapter le commentaire de tête : le tiroir par-dessus la grille ne vaut plus que pour le téléphone) :

```css
/* Sur PC le panneau pousse la grille : le slot prend sa largeur dès que le
   panneau est ouvert, d'un coup. Animer cette largeur remettrait la grille en
   page à chaque image ; le seul mouvement est le fondu du panneau lui-même.
   Le téléphone garde le tiroir posé par-dessus la grille, avec sa bande de
   fermeture. */
body:not(.nc-platform-android) .nc-cep-slot {
    transition: none;
}

body:not(.nc-platform-android) .nc-cep-slot.nc-cep-open {
    width: var(--cep-width);
}

body:not(.nc-platform-android) .nc-cep {
    transform: none;
    transition: opacity 150ms ease;
    box-shadow: none;
    border-right-color: var(--nc-sidebar-divider-color, var(--cep-border));
}
```

La règle `.nc-cep-slot .nc-cep.nc-cep-drop-active` reste (son commentaire cite la règle épinglée : le mettre à jour).

Dans `apps/windows/src/App.css`, remplacer la règle `.nc-desktop--calendar .nc-cep { --cep-bg: var(--nc-float-surface-secondary); backdrop-filter…; }` (et son commentaire) par :

```css
/* Le panneau d'un calendrier est une colonne comme la bande latérale : même
   teinte, fond d'écran visible à travers, et aucun flou — la grille ne passe
   plus derrière lui, il n'y a plus rien à cacher. */
.nc-desktop--calendar .nc-cep {
    --cep-bg: var(--nc-sidebar-container-background, rgba(17, 17, 27, 0.54));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}
```

- [ ] **Step 4: Composants**

`CalendarEventsPanel.tsx` : supprimer les props `pinned` et `onTogglePinned`, le bouton d'épinglage (`{!onPhone && (<button … Pin panel …>)}`), et `nc-cep-pinned` de la classe du slot. `CalendarLayout.tsx` : supprimer `panelPinned`/`setPanelPinned` et les deux props passées ; passer le délai de démontage de 320 à 180 ms avec le commentaire « Unmount only after the fade-out (opacity is 150ms) ». Supprimer les clés i18n `"Pin panel"` / `"Unpin panel"` seulement si plus aucun fichier ne les cite (`grep -rn "Pin panel" src apps/windows/src`).

- [ ] **Step 5: Tests, suite, commit**

Run: `npx tsc --noEmit -p apps/windows/tsconfig.json && npx jest`
Expected: vert. Un test existant citant `Pin panel`, `onTogglePinned` ou `nc-cep-pinned` est adapté (grep avant).

```bash
npx prettier --write src/ui/calendar/CalendarEventsPanel.tsx src/ui/calendar/CalendarLayout.tsx src/ui/calendar/CalendarEventsPanel.desktop.style.test.ts
git add src/ui/calendar/CalendarEventsPanel.css src/ui/calendar/CalendarEventsPanel.tsx src/ui/calendar/CalendarLayout.tsx src/ui/calendar/CalendarEventsPanel.desktop.style.test.ts apps/windows/src/App.css src/ui/i18n.ts
git commit -m "Sur PC le panneau d'un calendrier pousse la grille, prend la teinte de la colonne et s'ouvre par un fondu"
```

---

### Task 5: L'en-tête du panneau monte dans la barre de titre

**Files:**
- Modify: `apps/windows/src/DesktopTitlebar.tsx`
- Modify: `apps/windows/src/DesktopTitlebar.css`
- Modify: `apps/windows/src/DesktopCalendar.tsx` (~4037-4055 et props de `CalendarLayout`)
- Modify: `src/ui/calendar/CalendarLayout.tsx` (nouvelle prop `panelHeaderHost`)
- Modify: `src/ui/calendar/CalendarEventsPanel.tsx` (prop `headerHost`, portail de l'en-tête)
- Modify: `src/ui/calendar/CalendarEventsPanel.css` (`--cep-header-height` à 0 quand l'en-tête est ailleurs)
- Modify: `apps/windows/src/DesktopTitlebar.test.tsx`
- Create: `src/ui/calendar/CalendarEventsPanel.headerHost.test.tsx`

**Interfaces:**
- Produces:
  - `DesktopTitlebar` : props `panelOpen: boolean`, `onPanelHeaderHost?: (element: HTMLElement | null) => void`.
  - `CalendarLayout` : prop `panelHeaderHost?: HTMLElement | null`.
  - `CalendarEventsPanel` : prop `headerHost?: HTMLElement | null` ; classe `.nc-cep--headless` sur `.nc-cep` quand l'en-tête est porté ailleurs.

- [ ] **Step 1: Tests**

`src/ui/calendar/CalendarEventsPanel.headerHost.test.tsx` :

```tsx
/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarEventsPanel from "./CalendarEventsPanel";
import { applyLanguage } from "../i18n";

/*
 * Sur Windows l'en-tête du panneau (icône, nom, boutons) est porté dans la
 * barre de titre, dans un segment de la largeur du panneau : le corps du
 * panneau commence au ras de la barre, sans vide au-dessus.
 */
describe("l'en-tête du panneau porté dans la barre", () => {
    let host: HTMLDivElement;
    let bar: HTMLDivElement;

    const props = () => ({
        calendar: { id: "cal-1", name: "Études", color: "#4a7dfc", type: "local" as const, editable: true },
        events: [],
        timeFormat24h: true,
        defaultCalendarId: "cal-1",
        onEventClick: jest.fn(),
        onClose: jest.fn(),
        onAddEvent: jest.fn(),
        onSetDefault: jest.fn(),
        onShowOnly: jest.fn(),
        onRemove: jest.fn(),
        onColorChange: jest.fn(),
        open: true,
        onPanelDragTarget: jest.fn(),
        onPanelDrop: jest.fn(),
    });

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        bar = document.createElement("div");
        document.body.append(host, bar);
    });

    afterEach(() => {
        act(() => { ReactDOM.unmountComponentAtNode(host); });
        host.remove();
        bar.remove();
    });

    it("rend l'en-tête dans l'hôte et plus dans la colonne", () => {
        act(() => {
            ReactDOM.render(<CalendarEventsPanel {...props()} headerHost={bar} />, host);
        });
        expect(bar.querySelector(".nc-cep-header")).not.toBeNull();
        expect(host.querySelector(".nc-cep .nc-cep-header")).toBeNull();
        expect(host.querySelector(".nc-cep")!.classList.contains("nc-cep--headless")).toBe(true);
        expect(bar.textContent).toContain("Études");
    });

    it("garde l'en-tête dans la colonne sans hôte", () => {
        act(() => {
            ReactDOM.render(<CalendarEventsPanel {...props()} />, host);
        });
        expect(host.querySelector(".nc-cep .nc-cep-header")).not.toBeNull();
        expect(host.querySelector(".nc-cep--headless")).toBeNull();
    });

    it("ignore l'hôte sur téléphone", () => {
        document.body.classList.add("nc-platform-android");
        try {
            act(() => {
                ReactDOM.render(<CalendarEventsPanel {...props()} headerHost={bar} />, host);
            });
            expect(bar.querySelector(".nc-cep-header")).toBeNull();
            expect(host.querySelector(".nc-cep .nc-cep-header")).not.toBeNull();
        } finally {
            document.body.classList.remove("nc-platform-android");
        }
    });
});
```

Vérifier comment `isAndroidRuntime()` décide (`grep -n "export function isAndroidRuntime" -A 8 src/ui/calendar/CalendarUtils.ts`) et adapter le troisième test à son mécanisme (classe sur body, `navigator`, ou variable globale).

Dans `apps/windows/src/DesktopTitlebar.test.tsx`, ajouter un describe :

```tsx
describe("le segment du panneau", () => {
    it("existe, fermé, et s'ouvre à la largeur du panneau", () => {
        const onPanelHeaderHost = jest.fn();
        renderLayout({ withSlot: true, panelOpen: false, onPanelHeaderHost });
        const segment = document.querySelector(".nc-desktop-toolbar__panel")!;
        expect(segment).not.toBeNull();
        expect(segment.getAttribute("data-panel")).toBe("closed");
        expect(onPanelHeaderHost).toHaveBeenCalledWith(segment);
    });
});
```

en faisant passer `panelOpen` et `onPanelHeaderHost` par le `renderLayout` du fichier jusqu'au `<DesktopTitlebar>` (lire le helper, lignes ~80-120, et lui ajouter ces deux options ; `panelOpen` par défaut `false`).

- [ ] **Step 2: Vérifier l'échec**

Run: `npx jest src/ui/calendar/CalendarEventsPanel.headerHost.test.tsx apps/windows/src/DesktopTitlebar.test.tsx`

- [ ] **Step 3: `DesktopTitlebar.tsx`**

Props ajoutées :

```ts
/** Vrai quand le panneau d'un calendrier est ouvert : la barre lui réserve
    un segment de sa largeur, juste après la bande latérale. */
panelOpen: boolean;
/** L'élément de ce segment, pour que le panneau y porte son en-tête. */
onPanelHeaderHost?: (element: HTMLElement | null) => void;
```

Rendu, entre `</div>` du groupe gauche et `<div className="nc-desktop-toolbar__drag-space" />` :

```tsx
{/* Le panneau d'un calendrier monte ici son en-tête : la colonne de gauche
    a ses boutons dans la barre, le panneau a les siens au même endroit,
    et le vide qu'il laissait au-dessus de lui disparaît. Le segment n'a de
    largeur que panneau ouvert et bande latérale visible : repliée, le
    panneau part du bord gauche et garde son en-tête chez lui. */}
<div
    className="nc-desktop-toolbar__panel"
    data-panel={panelOpen && sidebarVisible ? "open" : "closed"}
    ref={onPanelHeaderHost}
/>
```

- [ ] **Step 4: `DesktopTitlebar.css`**

Ajouter après la règle `.nc-desktop-window-shell .nc-desktop-toolbar__left[data-sidebar="open"] { … }` :

```css
/* Le segment du panneau d'un calendrier : fermé, il n'existe pas ; ouvert, il
   a la largeur du panneau et porte son en-tête. Les jetons du panneau sont
   redéclarés ici parce que l'en-tête n'est plus un descendant de `.nc-cep`. */
.nc-desktop-window-shell .nc-desktop-toolbar__panel {
    --cep-width: min(320px, 45vw);
    --cep-text: var(--nc-text-primary, var(--text-normal));
    --cep-text-muted: var(--nc-text-secondary, var(--text-muted));
    --cep-hover: var(--nc-bg-hover, var(--background-modifier-hover));
    --cep-border: var(--nc-sidebar-divider-color);
    display: flex;
    flex: none;
    align-items: center;
    box-sizing: border-box;
    width: 0;
    height: 100%;
    overflow: hidden;
}

.nc-desktop-window-shell .nc-desktop-toolbar__panel[data-panel="open"] {
    width: var(--cep-width);
    border-right: 1px solid var(--nc-sidebar-divider-color);
}

.nc-desktop-window-shell .nc-desktop-toolbar__panel .nc-cep-header {
    width: 100%;
    height: 100%;
    padding: 0 8px 0 12px;
    border-bottom: 0;
}

/* Trois arrêts quand le panneau est ouvert : la bande latérale, le panneau,
   puis le reste. Même teinte pour les deux colonnes. */
.nc-desktop-window-shell .nc-desktop-titlebar:has(
    .nc-desktop-toolbar__left[data-sidebar="open"]
):has(.nc-desktop-toolbar__panel[data-panel="open"]) {
    background: linear-gradient(
        to right,
        var(--nc-sidebar-container-background, rgba(17, 17, 27, 0.54)) 0 calc(var(--nc-sidebar-width) + min(320px, 45vw)),
        var(--nc-chrome-container-background, rgba(17, 17, 27, 0.4)) calc(var(--nc-sidebar-width) + min(320px, 45vw)) 100%
    );
}
```

Placer cette dernière règle **après** la règle à deux arrêts existante (même spécificité renforcée par le second `:has`, mais l'ordre lève le doute). Vérifier que les boutons de l'en-tête reçoivent les clics : la règle `.nc-desktop-window-shell .nc-desktop-toolbar button { pointer-events: auto }` les couvre (ligne ~94).

- [ ] **Step 5: `DesktopCalendar.tsx`**

```tsx
const [panelHeaderHost, setPanelHeaderHost] = useState<HTMLElement | null>(null);
```

Dans le `<DesktopTitlebar …>` du portail : `panelOpen={selectedCalendar !== null}` et `onPanelHeaderHost={setPanelHeaderHost}`. Sur `<CalendarLayout …>` : `panelHeaderHost={sidebarVisible ? panelHeaderHost : null}`.

- [ ] **Step 6: `CalendarLayout.tsx` et `CalendarEventsPanel.tsx`**

`CalendarLayout` : prop `panelHeaderHost?: HTMLElement | null;` passée telle quelle en `headerHost={panelHeaderHost}` au panneau.

`CalendarEventsPanel` : prop `headerHost?: HTMLElement | null;`. Extraire le JSX de l'en-tête dans une constante `const header = (<div className="nc-cep-header">…</div>);` et le rendre :

```tsx
const hostedHeader = !!headerHost && !onPhone;
…
<div className={`nc-cep${hostedHeader ? " nc-cep--headless" : ""}`} ref={panelRef}>
    {hostedHeader ? ReactDOM.createPortal(header, headerHost!) : header}
    …
```

Le `useEffect` de fermeture au `pointerdown` teste `panelRef.current.contains(target)` : un clic sur les boutons de l'en-tête porté n'est plus « dans » le panneau et refermerait le popover des filtres au moment de l'ouvrir. Étendre le test : `if (!panelRef.current?.contains(t) && !headerHost?.contains(t))`.

`CalendarEventsPanel.css` :

```css
/* L'en-tête porté dans la barre de titre : les popovers qui pendaient sous
   lui partent du haut du panneau. */
.nc-cep.nc-cep--headless {
    --cep-header-height: 0px;
}
```

- [ ] **Step 7: Tests, types, suite, commit**

Run: `npx tsc --noEmit -p apps/windows/tsconfig.json && npx jest`

```bash
npx prettier --write apps/windows/src/DesktopTitlebar.tsx apps/windows/src/DesktopTitlebar.test.tsx apps/windows/src/DesktopCalendar.tsx src/ui/calendar/CalendarLayout.tsx src/ui/calendar/CalendarEventsPanel.tsx src/ui/calendar/CalendarEventsPanel.headerHost.test.tsx
git add apps/windows/src/DesktopTitlebar.tsx apps/windows/src/DesktopTitlebar.css apps/windows/src/DesktopTitlebar.test.tsx apps/windows/src/DesktopCalendar.tsx src/ui/calendar/CalendarLayout.tsx src/ui/calendar/CalendarEventsPanel.tsx src/ui/calendar/CalendarEventsPanel.css src/ui/calendar/CalendarEventsPanel.headerHost.test.tsx
git commit -m "L'en-tête du panneau d'un calendrier monte dans la barre de titre"
```

---

### Task 6: La fenêtre des liens ICS dans la coque des autres dialogues

**Files:**
- Modify: `apps/windows/src/SettingsPrimitives.tsx` (`SettingsDialog`, ~258-310)
- Modify: `apps/windows/src/IcsFeedsPanel.tsx` (coque 177-210, lignes 218-350)
- Modify: `apps/windows/src/App.css` (bloc `.nc-ics-*`, lignes 2920-3305)
- Modify: `apps/windows/src/IcsFeedsPanel.test.tsx` (nettoyage `.nc-ics-panel` → `.nc-choice-backdrop`)

**Interfaces:**
- Consumes: `SettingsDialog({ title, onClose, children })`.
- Produces: `SettingsDialog` accepte `className?: string` (ajouté à `section.nc-choice-dialog`). Le dialogue ICS a la classe `nc-choice-dialog--ics`.

- [ ] **Step 1: Test**

Dans `IcsFeedsPanel.test.tsx`, remplacer le nettoyage `.nc-ics-panel` par `.nc-choice-backdrop`, et ajouter :

```tsx
it("prend la coque des autres dialogues de l'application", () => {
    render(baseProps());
    const dialog = document.body.querySelector(".nc-choice-dialog.nc-choice-dialog--ics");
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector(".nc-choice-dialog__title")!.textContent).toContain("Liens ICS");
    expect(document.body.querySelector(".nc-ics-panel")).toBeNull();
});
```

Run: `npx jest apps/windows/src/IcsFeedsPanel.test.tsx` → ce test échoue.

- [ ] **Step 2: `SettingsDialog` accepte une classe**

```tsx
export function SettingsDialog({ title, onClose, className, children }: { title: string; onClose: () => void; className?: string; children: React.ReactNode }) {
    …
    <section className={`nc-choice-dialog${className ? ` ${className}` : ""}`} …>
```

- [ ] **Step 3: `IcsFeedsPanel.tsx`**

Remplacer la coque (`<div className="nc-ics-backdrop">…<section className="nc-ics-panel">…<header>…</header>` et la fermeture) par :

```tsx
const content = (
    <SettingsDialog
        title={`${t("ICS links")} — ${calendarName}`}
        className="nc-choice-dialog--ics"
        onClose={onClose}
    >
        <button type="button" className="nc-ics-panel__close" onClick={onClose} aria-label={t("Close")}>
            <XIcon size={16} />
        </button>
        {feeds.length > 1 && (<p className="nc-ics-panel__summary">…</p>)}
        <div className="nc-ics-panel__list">…</div>
        <form className="nc-ics-panel__add-form" onSubmit={submitAdd}>…</form>
        {addError && …}
        {atLimit && …}
    </SettingsDialog>
);
```

`SettingsDialog` porte déjà le portail sur `document.body` et Échap : retirer du panneau ICS son propre `useEffect` Échap et son `createPortal` (garder `return content;`). Import `SettingsDialog` depuis `./SettingsPrimitives`. Le formulaire d'ajout : le bouton garde `<PlusIcon size={15} />` mais son libellé devient `t("Add")` (ajouter `Add: "Ajouter"` dans `i18n.ts` si absent) ; garder `aria-label={t("Add an ICS link")}` sur le bouton pour que le test `findByText("Ajouter un lien ICS")` — vérifier lequel le test utilise et l'adapter s'il cible le texte.

Structure d'une ligne de lien (remplace `nc-ics-feed` > `nc-ics-feed-row` + `nc-ics-feed-address`) :

```tsx
<div className="nc-ics-feed" key={feed.id}>
    <span className="nc-ics-feed-row__icon"><LinkIcon size={15} /></span>
    <div className="nc-ics-feed-row__body">
        <input className="nc-ics-feed-row__name" … />          {/* inchangé */}
        <div className="nc-ics-feed-row__meta">
            <span className="nc-ics-feed-row__url" …>{feed.url}</span>   {/* inchangé */}
            <FeedStatus … />                                            {/* inchangé */}
        </div>
        <label className="nc-ics-feed-address">…</label>                {/* inchangé, déplacé dans le corps */}
    </div>
    <select className="nc-ics-feed-row__frequency" … />                {/* inchangé */}
    <button className="nc-ics-feed-row__action" … />                   {/* refresh, inchangé */}
    <button className="nc-ics-feed-row__action nc-ics-feed-row__action--danger" … />
</div>
```

Ne toucher à aucun handler, `aria-label`, `data-testid` ni `name=`.

- [ ] **Step 4: CSS**

Dans `App.css`, supprimer les règles `.nc-ics-backdrop { … }`, `.nc-ics-panel { … }`, `.nc-ics-panel__header`, `__icon`, `__header h2` (et retirer `.nc-ics-backdrop` de la liste des voiles à la ligne ~780). Réécrire le bloc restant :

```css
/* La fenêtre des liens ICS : la coque des autres dialogues, plus large parce
   qu'une URL a besoin de place, et des lignes plutôt que des cartes bordées
   dans une carte bordée. */
.nc-choice-dialog--ics {
    position: relative;
    width: min(560px, 100%);
    max-height: min(80vh, 680px);
    padding-bottom: 16px;
}

.nc-choice-dialog--ics .nc-choice-dialog__body {
    padding: 0 8px;
}

.nc-ics-panel__close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--nc-text-secondary, var(--text-muted));
    cursor: pointer;
}

.nc-ics-panel__close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}

.nc-ics-panel__summary {
    margin: 0 8px 6px;
    font-size: 12px;
    color: var(--nc-text-secondary, var(--text-muted));
}

.nc-ics-panel__list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
}

.nc-ics-panel__empty {
    margin: 12px 8px;
    font-size: 13px;
    color: var(--nc-text-secondary, var(--text-muted));
}

/* Une ligne par lien : icône, corps (nom, URL + état, adresse), fréquence,
   deux glyphes. Un filet entre les lignes, aucun cadre autour. */
.nc-ics-feed {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto auto auto;
    align-items: start;
    gap: 4px 10px;
    padding: 10px 8px;
}

.nc-ics-feed + .nc-ics-feed {
    border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
}

.nc-ics-feed-row__icon {
    display: inline-flex;
    align-items: center;
    height: 28px;
    color: var(--nc-text-secondary, var(--text-muted));
}

.nc-ics-feed-row__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.nc-ics-feed-row__name {
    width: 100%;
    height: 28px;
    padding: 0 6px;
    margin-left: -6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-normal);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    box-shadow: none;
}

.nc-ics-feed-row__name:hover {
    background: var(--background-modifier-hover);
}

.nc-ics-feed-row__name:focus-visible {
    outline: none;
    border-color: var(--nc-accent);
    background: var(--background-modifier-form-field);
}

.nc-ics-feed-row__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    color: var(--nc-text-secondary, var(--text-muted));
}

.nc-ics-feed-row__url {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.nc-ics-feed-row__status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    white-space: nowrap;
}

.nc-ics-feed-row__status--syncing svg {
    animation: nc-ics-spin 900ms linear infinite;
}

@keyframes nc-ics-spin {
    to { transform: rotate(360deg); }
}

.nc-ics-feed-row__status--error {
    color: var(--nc-error, var(--text-error));
}

.nc-ics-feed-row__status-secondary {
    opacity: 0.8;
}

.nc-ics-feed-address {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--nc-text-secondary, var(--text-muted));
}

.nc-ics-feed-address__input {
    flex: 1;
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    margin-left: -6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-normal);
    font: inherit;
    font-size: 12px;
    box-shadow: none;
}

.nc-ics-feed-address__input::placeholder {
    color: var(--nc-text-faint, var(--text-faint));
}

.nc-ics-feed-address__input:hover {
    background: var(--background-modifier-hover);
}

.nc-ics-feed-address__input:focus {
    outline: none;
    border-color: var(--nc-accent);
    background: var(--background-modifier-form-field);
}

.nc-ics-feed-row__frequency {
    height: 28px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    font: inherit;
    font-size: 12px;
}

.nc-ics-feed-row__frequency:focus-visible {
    outline: none;
    border-color: var(--nc-accent);
}

/* Deux glyphes nus, qui ne prennent une surface qu'au survol. */
.nc-ics-feed-row__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--nc-text-secondary, var(--text-muted));
    cursor: pointer;
}

.nc-ics-feed-row__action:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}

.nc-ics-feed-row__action:focus-visible {
    outline: 2px solid var(--nc-accent);
    outline-offset: -2px;
}

.nc-ics-feed-row__action--danger:hover {
    color: var(--nc-error, var(--text-error));
}

.nc-ics-feed-row__action:disabled {
    opacity: 0.4;
    cursor: default;
}

/* Le formulaire d'ajout : une ligne, deux champs sans bordure au repos et un
   bouton plein. */
.nc-ics-panel__add-form {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) auto;
    gap: 8px;
    margin: 10px 8px 0;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
}

.nc-ics-panel__add-form input {
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    font: inherit;
    font-size: 13px;
    box-shadow: none;
}

.nc-ics-panel__add-form input::placeholder {
    color: var(--nc-text-faint, var(--text-faint));
}

.nc-ics-panel__add-form input:focus-visible {
    outline: none;
    border-color: var(--nc-accent);
}

.nc-ics-panel__add-form input:disabled {
    opacity: 0.5;
}

.nc-ics-panel__add-form button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    background: var(--nc-accent);
    color: var(--text-on-accent, #fff);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}

.nc-ics-panel__add-form button:disabled {
    opacity: 0.5;
    cursor: default;
}

.nc-ics-panel__error,
.nc-ics-panel__limit-note {
    margin: 8px 8px 0;
    font-size: 12px;
}

.nc-ics-panel__error {
    color: var(--nc-error, var(--text-error));
}

.nc-ics-panel__limit-note {
    color: var(--nc-text-secondary, var(--text-muted));
}
```

Avant d'écrire, lire le bloc actuel (2920-3305) pour reprendre toute règle qui porterait un état non listé ici (`--syncing`, `--error`, `:disabled`, `::placeholder`) et ne rien perdre.

- [ ] **Step 5: Tests, suite, commit**

Run: `npx tsc --noEmit -p apps/windows/tsconfig.json && npx jest apps/windows/src/IcsFeedsPanel.test.tsx && npx jest`

```bash
npx prettier --write apps/windows/src/SettingsPrimitives.tsx apps/windows/src/IcsFeedsPanel.tsx apps/windows/src/IcsFeedsPanel.test.tsx apps/windows/src/App.css src/ui/i18n.ts
git add apps/windows/src/SettingsPrimitives.tsx apps/windows/src/IcsFeedsPanel.tsx apps/windows/src/IcsFeedsPanel.test.tsx apps/windows/src/App.css src/ui/i18n.ts
git commit -m "La fenêtre des liens ICS prend la coque des autres dialogues"
```

---

### Task 7: Vu tourner — build de dev, WebView pilotée, captures

**Files:**
- Modify: `docs/PROCHAINE_VERSION.md` (cocher les quatre points « Reste au 2026-09-11 (soir, après la 1.75.0) » avec ce qui a été vu)
- Captures dans le scratchpad de session (`…/scratchpad/`)

- [ ] **Step 1: Lancer le build de dev**

Une instance de Neo Calendar installée peut tourner (instance unique : le build de dev s'effacerait devant elle) : `Get-Process neo-calendar | Stop-Process -Force`. Puis :

```bash
cd /c/dev/neo-calendar && node scripts/configure-tauri-updater.mjs >/dev/null
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npm run dev > "$SCRATCH/dev.log" 2>&1 &
```

Attendre `Running \`target\debug\neo-calendar.exe\`` dans le log puis `curl -s http://127.0.0.1:9222/json` qui liste la page `Neo Calendar`.

- [ ] **Step 2: Piloter et capturer**

`export AGENT_BROWSER_SESSION=neocal; AB="timeout 25 agent-browser --cdp 9222"` :

1. `$AB snapshot -i` → repérer le bouton `[ref]` sans nom sous la ligne « Études » (le « Plus d'options » de la ligne), le cliquer, `$AB snapshot -i | grep menuitem` : Couleur, Renommer, Open folder, Liens ICS, Rappel, N'afficher…, Retirer — pas d'Horaires de prière.
2. Survoler « Rappel » : `$AB eval "…"` en dispatchant `mouseover` sur la ligne (ou `$AB hover @ref` si disponible : `agent-browser skills get core --full` liste les commandes), attendre 200 ms, `$AB screenshot "$SCRATCH/submenu-rappel.png"` : le sous-menu à droite, « Réglage de l'application · 5 minutes avant » coché, la ligne Personnalisé et son champ. Lire la capture.
3. Cliquer « 30 minutes avant » ; vérifier dans `C:/Neo Calendar/.neo-calendar/.neo-calendar.json` que `calendarReminderMinutes` porte `{"Études": 30}` ; rouvrir, vérifier la coche ; cliquer « Réglage de l'application » ; vérifier `{}`.
4. Sur `الْإِسْلَامُ` : le menu a Rappel et Horaires de prière.
5. Ouvrir « Liens ICS » sur Études : `$AB screenshot "$SCRATCH/ics-dialog.png"`, lire : coque `.nc-choice-dialog`, lignes, formulaire sur une ligne. Fermer par Échap.
6. Cliquer le nom « Études » dans la colonne : le panneau s'ouvre. `$AB screenshot "$SCRATCH/panel.png"`, lire : l'en-tête est dans la barre de titre à côté de la bande latérale (mesurer par `$AB eval` que `.nc-desktop-toolbar__panel .nc-cep-header` existe et que `.nc-cep .nc-cep-header` n'existe pas), la grille commence après le panneau (`$AB eval` : `document.querySelector('.nc-main').getBoundingClientRect().left >= document.querySelector('.nc-cep').getBoundingClientRect().right - 1`), le fond laisse voir le fond d'écran (le `background-color` calculé de `.nc-cep` a une alpha < 1).
7. Ouvrir le menu « ⋯ » du panneau : `$AB snapshot -i | grep menuitem` liste Couleur … Rappel, Liens ICS, Retirer ; survoler Rappel : sous-menu. Capture `panel-menu.png`.
8. Fermer le panneau (bouton « Réduire ») : il disparaît par un fondu, la grille reprend sa largeur.
9. Remettre les préférences comme trouvées (`reminderMinutes`, `calendarReminderMinutes` vides).

- [ ] **Step 3: Ranger**

```bash
$AB close
Get-Process neo-calendar | Stop-Process -Force   # PowerShell
git checkout apps/windows/src-tauri/tauri.conf.json apps/windows/src-tauri/Cargo.toml
Start-Process "C:\Users\Ahmed\AppData\Local\Neo Calendar\neo-calendar.exe"   # relancer l'app installée si elle tournait
```

- [ ] **Step 4: Cocher le pense-bête et commiter**

Dans `docs/PROCHAINE_VERSION.md`, passer les quatre points de la section « Reste au 2026-09-11 (soir, après la 1.75.0) » à `[x]`, en ajoutant à chacun une phrase « Vu tourner le 2026-09-12 dans le build de dev Windows, WebView pilotée par CDP : … » avec ce qui a été observé. Le fichier n'est pas versionné : pas de commit pour lui. Si une capture montre un défaut, le corriger (TDD) avant de cocher, et le noter.

---

## Auto-revue

**Couverture de la spec :** §1 cascade → T1 ; §1 menu du panneau sur le même composant → T2 ; §1 `extraMenuItems` et tableau PC/Android → T2 + T3 ; §2 Rappel ▸ et `ReminderCustomField` → T3 ; §3 fenêtre ICS → T6 ; §4 en-tête dans la barre → T5 ; §4 pousse la grille, fond, transition, épinglage → T4 ; tests listés → répartis ; « vu tourner » → T7.

**Cohérence des noms :** `extraMenuItems` (T2, T3, T5), `CalendarMenuContext` / `buildCalendarMenuItems` (T3), `ReminderCustomField({ minutes, fallbackMinutes, onChange })` (T3), `headerHost` sur le panneau / `panelHeaderHost` sur le layout et `DesktopCalendar` / `onPanelHeaderHost` + `panelOpen` sur la barre (T5), `.nc-cep--headless`, `.nc-desktop-toolbar__panel[data-panel]`, `.nc-choice-dialog--ics` (T6).

**Placeholders :** aucun ; chaque étape de code est écrite.
