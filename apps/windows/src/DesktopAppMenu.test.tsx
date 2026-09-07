/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import DesktopAppMenu from "./DesktopAppMenu";
import {
    DesktopCommandId,
    DesktopCommands,
    handleDesktopShortcut,
} from "./desktopCommands";
import { appVersion } from "../../../src/ui/calendar/appUpdates";
import { applyLanguage } from "../../../src/ui/i18n";

/*
 * Le menu d'application de la barre unifiée, éprouvé par ce qu'il FAIT.
 *
 * Les libellés sont lus en français — la langue par défaut de l'application —
 * et les commandes sont des doublures : ce test répond de la surface, pas de
 * ce que `DesktopCalendar` met derrière chaque identifiant.
 */

const ALL_IDS: DesktopCommandId[] = [
    "previous",
    "next",
    "settings",
    "check-updates",
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "paste-plain",
    "delete",
    "select-all",
    "duplicate",
    "hours-reset",
    "hours-increase",
    "hours-decrease",
    "reload",
    "hard-reload",
    "devtools",
    "fullscreen",
];

function makeCommands(
    disabled: DesktopCommandId[] = []
): Required<DesktopCommands> {
    const table = {} as Required<DesktopCommands>;
    for (const id of ALL_IDS) {
        table[id] = {
            enabled: disabled.indexOf(id) === -1,
            run: jest.fn(),
        };
    }
    return table;
}

let host: HTMLDivElement;
let commands: Required<DesktopCommands>;
let setScale: jest.Mock;

const mount = (table: Required<DesktopCommands> = commands) => {
    act(() => {
        ReactDOM.render(
            <DesktopAppMenu
                commands={table}
                interfaceScale={1.25}
                onSetInterfaceScale={setScale}
            />,
            host
        );
    });
};

const trigger = (): HTMLButtonElement =>
    host.querySelector<HTMLButtonElement>(".nc-app-menu-trigger")!;

const panels = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]'));

const rowsOf = (panel: HTMLElement): HTMLButtonElement[] =>
    Array.from(panel.querySelectorAll<HTMLButtonElement>(".nc-app-menu-item"));

const rowNamed = (label: string): HTMLButtonElement => {
    const found = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".nc-app-menu-item")
    ).find(
        (row) => row.querySelector(".nc-app-menu-label")?.textContent === label
    );
    if (!found) throw new Error(`Aucune ligne « ${label} »`);
    return found;
};

const hover = (element: Element) => {
    act(() => {
        element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    });
};

const press = (key: string, target: Element = document.activeElement!) => {
    act(() => {
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true })
        );
    });
};

beforeEach(() => {
    applyLanguage("fr");
    commands = makeCommands();
    setScale = jest.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(host);
    });
    document.body.innerHTML = "";
    jest.useRealTimers();
});

describe("les trois rubriques", () => {
    it("s'ouvre au survol du chevron et n'en montre que trois, sans Aide", () => {
        mount();
        hover(trigger());
        expect(document.querySelector('[role="menu"]')).not.toBeNull();
        const labels = rowsOf(panels()[0]).map(
            (row) => row.querySelector(".nc-app-menu-label")!.textContent
        );
        expect(labels).toEqual(["Neo Calendar", "Modifier", "Afficher"]);
        expect(document.body.textContent).not.toContain("Aide");
    });

    it("remplace « À propos » par la version réelle, qui n'est pas activable", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Neo Calendar"));
        expect(document.body.textContent).not.toContain(
            "À propos de Neo Calendar"
        );
        expect(document.body.textContent).toContain(`v${appVersion()}`);
        const version = document.querySelector(".nc-app-menu-version")!;
        expect(version.tagName).toBe("DIV");
        expect(version.getAttribute("role")).toBeNull();
    });

    it("garde l'ordre exact des entrées de Modifier", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Modifier"));
        const labels = rowsOf(panels()[1]).map(
            (row) => row.querySelector(".nc-app-menu-label")!.textContent
        );
        expect(labels).toEqual([
            "Annuler l'action",
            "Rétablir",
            "Couper",
            "Copier",
            "Coller",
            "Coller et respecter le style",
            "Supprimer",
            "Sélectionner tous les éléments visibles",
            "Dupliquer",
        ]);
        expect(
            panels()[1].querySelectorAll(".nc-app-menu-separator")
        ).toHaveLength(1);
    });

    it("garde l'ordre exact des entrées d'Afficher, deux séparateurs compris", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Afficher"));
        const labels = rowsOf(panels()[1]).map(
            (row) => row.querySelector(".nc-app-menu-label")!.textContent
        );
        expect(labels).toEqual([
            "Espacement des heures par défaut",
            "Augmenter l'espacement des heures",
            "Réduire l'espacement des heures",
            "Échelle de l'interface",
            "Relancer",
            "Forcer le rafraîchissement",
            "Afficher les outils de développement",
            "Basculer en plein écran",
        ]);
        expect(
            panels()[1].querySelectorAll(".nc-app-menu-separator")
        ).toHaveLength(2);
    });

    it("affiche le raccourci de la spec pour les outils de développement", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Afficher"));
        expect(
            rowNamed("Afficher les outils de développement").querySelector(
                ".nc-app-menu-shortcut"
            )!.textContent
        ).toBe("Ctrl+Alt+I");
        expect(
            rowNamed("Espacement des heures par défaut").querySelector(
                ".nc-app-menu-shortcut"
            )!.textContent
        ).toBe("Ctrl+Maj+0");
    });
});

describe("la souris", () => {
    it("garde le sous-menu ouvert quand on entre dedans", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Modifier"));
        expect(panels()).toHaveLength(2);
        hover(rowNamed("Dupliquer"));
        // Entrer dans le sous-menu ne referme rien : les deux surfaces
        // appartiennent au même périmètre.
        expect(panels()).toHaveLength(2);
    });

    it("lance la commande de la ligne cliquée et referme tout", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Modifier"));
        act(() => {
            rowNamed("Dupliquer").click();
        });
        expect(commands.duplicate.run).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[role="menu"]')).toBeNull();
    });

    it("laisse la ligne désactivée visible, atténuée et muette", () => {
        commands = makeCommands(["delete", "duplicate"]);
        mount();
        hover(trigger());
        hover(rowNamed("Modifier"));
        const row = rowNamed("Supprimer");
        expect(row.getAttribute("data-disabled")).toBe("true");
        expect(row.getAttribute("aria-disabled")).toBe("true");
        act(() => {
            row.click();
        });
        expect(commands.delete.run).not.toHaveBeenCalled();
        expect(document.querySelector('[role="menu"]')).not.toBeNull();
    });

    it("referme tout au clic extérieur et rend le focus au chevron", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Modifier"));
        act(() => {
            document.body.dispatchEvent(
                new MouseEvent("pointerdown", { bubbles: true }) as PointerEvent
            );
        });
        expect(document.querySelector('[role="menu"]')).toBeNull();
        expect(document.activeElement).toBe(trigger());
    });
});

describe("le clavier", () => {
    it("ouvre au clic, descend, remonte et va aux extrémités", () => {
        mount();
        act(() => {
            trigger().click();
        });
        const root = panels()[0];
        const rows = rowsOf(root);
        expect(document.activeElement).toBe(rows[0]);
        press("ArrowDown");
        expect(document.activeElement).toBe(rows[1]);
        press("End");
        expect(document.activeElement).toBe(rows[2]);
        press("ArrowUp");
        expect(document.activeElement).toBe(rows[1]);
        press("Home");
        expect(document.activeElement).toBe(rows[0]);
    });

    it("entre dans un sous-menu par Droite et en ressort par Gauche", () => {
        mount();
        act(() => {
            trigger().click();
        });
        press("ArrowDown");
        press("ArrowRight");
        expect(panels()).toHaveLength(2);
        expect(document.activeElement).toBe(rowsOf(panels()[1])[0]);
        press("ArrowLeft");
        expect(panels()).toHaveLength(1);
        // De retour sur « Modifier », la ligne qui avait ouvert le sous-menu.
        expect(
            document.activeElement!.querySelector(".nc-app-menu-label")!
                .textContent
        ).toBe("Modifier");
    });

    it("saute la version, qui n'est pas une cible de focus", () => {
        mount();
        act(() => {
            trigger().click();
        });
        press("ArrowRight");
        expect(
            document.activeElement!.querySelector(".nc-app-menu-label")!
                .textContent
        ).toBe("Rechercher les mises à jour…");
    });

    it("active par Entrée et par Espace", () => {
        mount();
        act(() => {
            trigger().click();
        });
        press("ArrowDown");
        press("ArrowRight");
        press("Enter");
        expect(commands.undo.run).toHaveBeenCalledTimes(1);

        mount();
        act(() => {
            trigger().click();
        });
        press("ArrowDown");
        press("ArrowRight");
        press("ArrowDown");
        press(" ");
        expect(commands.redo.run).toHaveBeenCalledTimes(1);
    });

    it("referme le niveau courant puis le menu avec Échap", () => {
        mount();
        act(() => {
            trigger().click();
        });
        press("ArrowDown");
        press("ArrowRight");
        expect(panels()).toHaveLength(2);
        press("Escape");
        expect(panels()).toHaveLength(1);
        press("Escape");
        expect(panels()).toHaveLength(0);
        expect(document.activeElement).toBe(trigger());
    });

    it("referme le menu quand Tab l'abandonne", () => {
        mount();
        act(() => {
            trigger().click();
        });
        press("Tab");
        expect(panels()).toHaveLength(0);
    });
});

describe("les paliers d'échelle", () => {
    it("sont des menuitemradio, un seul coché sur celui qui est appliqué", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Afficher"));
        hover(rowNamed("Échelle de l'interface"));
        const steps = rowsOf(panels()[2]);
        expect(steps).toHaveLength(8);
        expect(
            steps.every((step) => step.getAttribute("role") === "menuitemradio")
        ).toBe(true);
        const checked = steps.filter(
            (step) => step.getAttribute("aria-checked") === "true"
        );
        expect(checked).toHaveLength(1);
        expect(
            checked[0].querySelector(".nc-app-menu-label")!.textContent
        ).toBe("125 %");
    });

    it("applique le palier choisi", () => {
        mount();
        hover(trigger());
        hover(rowNamed("Afficher"));
        hover(rowNamed("Échelle de l'interface"));
        act(() => {
            rowNamed("150 %").click();
        });
        expect(setScale).toHaveBeenCalledWith(1.5);
        expect(panels()).toHaveLength(0);
    });
});

describe("le menu tient le clavier", () => {
    it("laisse la flèche droite au menu, jamais au calendrier", () => {
        /* Le routeur de la tâche 1 est monté comme dans l'application, avec la
           garde `blocked` que `DesktopCalendar` alimente par
           `overlayHoldsKeyboard`. Menu ouvert, la flèche parcourt les lignes ;
           elle ne change pas de période. */
        let open = false;
        const onKeyDown = (event: KeyboardEvent) => {
            handleDesktopShortcut(event, {
                commands,
                blocked: open,
                onError: () => {},
            });
        };
        document.addEventListener("keydown", onKeyDown);
        try {
            act(() => {
                ReactDOM.render(
                    <DesktopAppMenu
                        commands={commands}
                        onOpenChange={(value) => {
                            open = value;
                        }}
                        interfaceScale={1}
                        onSetInterfaceScale={setScale}
                    />,
                    host
                );
            });
            act(() => {
                trigger().click();
            });
            expect(open).toBe(true);
            press("ArrowRight");
            expect(commands.next.run).not.toHaveBeenCalled();
            expect(panels()).toHaveLength(2);
        } finally {
            document.removeEventListener("keydown", onKeyDown);
        }
    });
});

describe("le délai de sortie", () => {
    it("referme après un court délai, et l'annule si la souris revient", () => {
        jest.useFakeTimers();
        mount();
        hover(trigger());
        hover(rowNamed("Modifier"));
        act(() => {
            panels()[0].dispatchEvent(
                new MouseEvent("mouseout", { bubbles: true })
            );
        });
        // Revenue avant la fin du délai : rien ne se ferme.
        hover(rowNamed("Modifier"));
        act(() => {
            jest.advanceTimersByTime(1000);
        });
        expect(panels()).toHaveLength(2);

        act(() => {
            panels()[1].dispatchEvent(
                new MouseEvent("mouseout", { bubbles: true })
            );
        });
        act(() => {
            jest.advanceTimersByTime(1000);
        });
        expect(panels()).toHaveLength(0);
    });
});
