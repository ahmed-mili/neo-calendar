/** @jest-environment jsdom */
import {
    DesktopCommands,
    DesktopShortcutContext,
    handleDesktopShortcut,
} from "./desktopCommands";

test("ArrowRight utilise la même action que le bouton", () => {
    const next = jest.fn();
    const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
    });
    expect(
        handleDesktopShortcut(event, {
            commands: { next: { enabled: true, run: next } },
            blocked: false,
            onError: jest.fn(),
        })
    ).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
});

/**
 * Frappe reelle : l'evenement est distribue sur une cible du document, comme
 * dans la fenetre, sinon `event.target` reste nul et les gardes de champ de
 * saisie ne seraient jamais eprouvees.
 */
function press(
    init: KeyboardEventInit,
    context: Partial<DesktopShortcutContext> = {},
    target: EventTarget = document.body
): { handled: boolean; event: KeyboardEvent } {
    const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
    });
    let handled = false;
    const listener = (fired: Event) => {
        handled = handleDesktopShortcut(fired as KeyboardEvent, {
            commands: {},
            blocked: false,
            onError: jest.fn(),
            ...context,
        });
    };
    window.addEventListener("keydown", listener, true);
    target.dispatchEvent(event);
    window.removeEventListener("keydown", listener, true);
    return { handled, event };
}

/** Une cible attachee au document, retiree apres chaque test. */
function mount(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.firstElementChild as HTMLElement;
}

afterEach(() => {
    document.body.innerHTML = "";
});

const navigation = (): {
    commands: DesktopCommands;
    previous: jest.Mock;
    next: jest.Mock;
} => {
    const previous = jest.fn();
    const next = jest.fn();
    return {
        commands: {
            previous: { enabled: true, run: previous },
            next: { enabled: true, run: next },
        },
        previous,
        next,
    };
};

describe("les flèches horizontales", () => {
    it("recule d'une période sur ArrowLeft", () => {
        const { commands, previous, next } = navigation();
        const { handled, event } = press({ key: "ArrowLeft" }, { commands });
        expect(handled).toBe(true);
        expect(previous).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
    });

    it("avance d'une période sur ArrowRight", () => {
        const { commands, next } = navigation();
        expect(press({ key: "ArrowRight" }, { commands }).handled).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("laisse les flèches verticales au reste de l'interface", () => {
        const { commands, previous, next } = navigation();
        expect(press({ key: "ArrowUp" }, { commands }).handled).toBe(false);
        expect(press({ key: "ArrowDown" }, { commands }).handled).toBe(false);
        expect(previous).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});

describe("les gardes", () => {
    it("ne fait rien quand une superposition tient le clavier", () => {
        const { commands, next } = navigation();
        const { handled, event } = press(
            { key: "ArrowRight" },
            { commands, blocked: true }
        );
        expect(handled).toBe(false);
        expect(next).not.toHaveBeenCalled();
        // Sans preventDefault : la touche appartient a la superposition.
        expect(event.defaultPrevented).toBe(false);
    });

    it("ne coupe pas une composition IME", () => {
        const { commands, next } = navigation();
        expect(
            press({ key: "ArrowRight", isComposing: true }, { commands })
                .handled
        ).toBe(false);
        expect(next).not.toHaveBeenCalled();
    });

    it("laisse un évènement déjà traité par quelqu'un d'autre", () => {
        const { commands, next } = navigation();
        const event = new KeyboardEvent("keydown", {
            key: "ArrowRight",
            cancelable: true,
        });
        event.preventDefault();
        expect(
            handleDesktopShortcut(event, {
                commands,
                blocked: false,
                onError: jest.fn(),
            })
        ).toBe(false);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(["<input />", "<textarea></textarea>", "<select></select>"])(
        "laisse %s déplacer son curseur",
        (html) => {
            const { commands, next } = navigation();
            const field = mount(html);
            const { handled, event } = press(
                { key: "ArrowRight" },
                { commands },
                field
            );
            expect(handled).toBe(false);
            expect(next).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        }
    );

    it("laisse un descendant d'un contenteditable déplacer son curseur", () => {
        const { commands, next } = navigation();
        const editor = mount(
            '<div contenteditable="true"><p><span>texte</span></p></div>'
        );
        const leaf = editor.querySelector("span") as HTMLElement;
        expect(press({ key: "ArrowRight" }, { commands }, leaf).handled).toBe(
            false
        );
        expect(next).not.toHaveBeenCalled();
    });

    it.each(["menu", "menubar", "dialog", "alertdialog"])(
        "laisse un rôle %s garder ses flèches",
        (role) => {
            const { commands, next } = navigation();
            const overlay = mount(
                `<div role="${role}"><button type="button">x</button></div>`
            );
            const button = overlay.querySelector("button") as HTMLElement;
            expect(
                press({ key: "ArrowRight" }, { commands }, button).handled
            ).toBe(false);
            expect(next).not.toHaveBeenCalled();
        }
    );

    it.each([
        ["Ctrl", { ctrlKey: true }],
        ["Alt", { altKey: true }],
        ["Shift", { shiftKey: true }],
        ["Meta", { metaKey: true }],
    ])("ne consomme pas %s + ArrowRight", (_label, modifier) => {
        const { commands, next } = navigation();
        expect(
            press({ key: "ArrowRight", ...modifier }, { commands }).handled
        ).toBe(false);
        expect(next).not.toHaveBeenCalled();
    });
});

describe("les commandes absentes ou désactivées", () => {
    it("laisse passer un accord qu'aucune commande ne réclame", () => {
        // Sans commande `delete`, l'ancien gestionnaire doit continuer a
        // supprimer : le routeur ne peut pas manger la touche a sa place.
        const { handled, event } = press({ key: "Delete" }, { commands: {} });
        expect(handled).toBe(false);
        expect(event.defaultPrevented).toBe(false);
    });

    it("consomme l'accord d'une commande présente mais désactivée", () => {
        const run = jest.fn();
        const { handled, event } = press(
            { key: "ArrowRight" },
            { commands: { next: { enabled: false, run } } }
        );
        expect(handled).toBe(true);
        expect(run).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
    });

    it("laisse un champ de saisie tranquille même pour une commande désactivée", () => {
        const run = jest.fn();
        const field = mount("<input />");
        const { handled, event } = press(
            { key: "ArrowRight" },
            { commands: { next: { enabled: false, run } } },
            field
        );
        expect(handled).toBe(false);
        expect(event.defaultPrevented).toBe(false);
    });
});

describe("les erreurs d'exécution", () => {
    it("rapporte un rejet de promesse plutôt que de l'oublier", async () => {
        const onError = jest.fn();
        const reason = new Error("échec");
        press(
            { key: "ArrowRight" },
            {
                commands: {
                    next: { enabled: true, run: () => Promise.reject(reason) },
                },
                onError,
            }
        );
        await Promise.resolve();
        expect(onError).toHaveBeenCalledWith(reason);
    });

    it("rapporte une exception synchrone sans relancer la touche", () => {
        const onError = jest.fn();
        const reason = new Error("échec");
        const { handled } = press(
            { key: "ArrowRight" },
            {
                commands: {
                    next: {
                        enabled: true,
                        run: () => {
                            throw reason;
                        },
                    },
                },
                onError,
            }
        );
        expect(handled).toBe(true);
        expect(onError).toHaveBeenCalledWith(reason);
    });
});

/*
 * Disposition AZERTY, relevee sur ce poste avec ToUnicodeEx et la disposition
 * fr-FR (0x040C) : le CARACTERE se lit dans `event.key`, la POSITION dans
 * `event.code`, et les deux divergent.
 *   « 0 » est Maj + code Digit0 (sans Maj le meme code donne « à »)
 *   « - » est le code Digit6 (le code Minus donne « ) »)
 *   « , » est le code KeyM   (le code Comma donne « ; »)
 * Les accords se lisent donc sur `event.key`, jamais sur la position.
 */
describe("les accords de ponctuation sur AZERTY", () => {
    it("ouvre les réglages sur Ctrl + « , » posé sur la touche M", () => {
        const run = jest.fn();
        const { handled } = press(
            { key: ",", code: "KeyM", ctrlKey: true },
            { commands: { settings: { enabled: true, run } } }
        );
        expect(handled).toBe(true);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("réduit la hauteur d'heure sur Ctrl + « - » posé sur la touche 6", () => {
        const run = jest.fn();
        const { handled } = press(
            { key: "-", code: "Digit6", ctrlKey: true },
            { commands: { "hours-decrease": { enabled: true, run } } }
        );
        expect(handled).toBe(true);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("remet la hauteur d'heure sur Ctrl + Maj + « 0 », le seul « 0 » d'AZERTY", () => {
        const run = jest.fn();
        const { handled } = press(
            { key: "0", code: "Digit0", ctrlKey: true, shiftKey: true },
            { commands: { "hours-reset": { enabled: true, run } } }
        );
        expect(handled).toBe(true);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("laisse AltGr écrire ses caractères", () => {
        // AltGr, sur Windows, se presente comme Ctrl + Alt. AltGr + code Digit0
        // ecrit « @ », AltGr + code Equal ecrit « } » : aucun ne doit declencher
        // de commande.
        const settings = jest.fn();
        const increase = jest.fn();
        const commands: DesktopCommands = {
            settings: { enabled: true, run: settings },
            "hours-increase": { enabled: true, run: increase },
        };
        expect(
            press(
                { key: "@", code: "Digit0", ctrlKey: true, altKey: true },
                { commands }
            ).handled
        ).toBe(false);
        expect(
            press(
                { key: "}", code: "Equal", ctrlKey: true, altKey: true },
                { commands }
            ).handled
        ).toBe(false);
        expect(settings).not.toHaveBeenCalled();
        expect(increase).not.toHaveBeenCalled();
    });
});

describe("les accords d'édition", () => {
    it("distingue Ctrl + Z de Ctrl + Maj + Z", () => {
        const undo = jest.fn();
        const redo = jest.fn();
        const commands: DesktopCommands = {
            undo: { enabled: true, run: undo },
            redo: { enabled: true, run: redo },
        };
        press({ key: "z", ctrlKey: true }, { commands });
        press({ key: "Z", ctrlKey: true, shiftKey: true }, { commands });
        expect(undo).toHaveBeenCalledTimes(1);
        expect(redo).toHaveBeenCalledTimes(1);
    });

    it("distingue Ctrl + V de Ctrl + Maj + V", () => {
        const paste = jest.fn();
        const plain = jest.fn();
        const commands: DesktopCommands = {
            paste: { enabled: true, run: paste },
            "paste-plain": { enabled: true, run: plain },
        };
        press({ key: "v", ctrlKey: true }, { commands });
        press({ key: "V", ctrlKey: true, shiftKey: true }, { commands });
        expect(paste).toHaveBeenCalledTimes(1);
        expect(plain).toHaveBeenCalledTimes(1);
    });

    it("Ctrl + A route vers select-all plutôt que de laisser le navigateur agir", () => {
        const selectAll = jest.fn();
        const commands: DesktopCommands = {
            "select-all": { enabled: true, run: selectAll },
        };
        const { handled, event } = press(
            { key: "a", ctrlKey: true },
            { commands }
        );
        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(selectAll).toHaveBeenCalledTimes(1);
    });

    it("un menu Modifier ouvert (role=menu) ne consomme pas les accords d'un champ éditable derrière lui", () => {
        // Le clavier appartient à un menu ouvert au même titre qu'un champ de
        // saisie : la garde `targetKeepsKeys` le traite déjà comme une
        // surface qui garde ses touches pour elle, donc l'accord n'atteint
        // jamais la table de commandes tant que le focus y reste — la
        // sélection d'évènements sous le menu n'est donc jamais touchée par
        // cette frappe.
        const host = mount('<div role="menu"><button>Item</button></div>');
        const button = host.querySelector("button") as HTMLElement;
        const selectAll = jest.fn();
        const commands: DesktopCommands = {
            "select-all": { enabled: true, run: selectAll },
        };
        const { handled } = press(
            { key: "a", ctrlKey: true },
            { commands },
            button
        );
        expect(handled).toBe(false);
        expect(selectAll).not.toHaveBeenCalled();
        host.remove();
    });
});
