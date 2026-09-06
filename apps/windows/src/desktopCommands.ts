import {
    EditableProbe,
    isEditableTarget,
} from "../../../src/ui/calendar/keyboardGuard";

/**
 * Le contrat de commandes de la fenetre Windows.
 *
 * Une seule table d'accords, un seul jeu d'identifiants : le clavier, la barre
 * de titre et le menu d'application declenchent la MEME action, donc aucun des
 * trois ne peut deriver des deux autres. Ce module ne connait ni React ni
 * Tauri : il decide, il n'agit pas.
 */
export type DesktopCommandId =
    | "previous"
    | "next"
    | "settings"
    | "check-updates"
    | "undo"
    | "redo"
    | "cut"
    | "copy"
    | "paste"
    | "paste-plain"
    | "delete"
    | "select-all"
    | "duplicate"
    | "hours-reset"
    | "hours-increase"
    | "hours-decrease"
    | "reload"
    | "hard-reload"
    | "devtools"
    | "fullscreen";

export interface DesktopCommand {
    enabled: boolean;
    run: () => void | Promise<void>;
}

/**
 * Partiel a dessein : une commande absente n'existe pas dans cette fenetre, et
 * son accord retombe sur l'ancien gestionnaire. Une commande presente mais
 * `enabled: false` existe et refuse : son accord est consomme.
 */
export type DesktopCommands = Partial<Record<DesktopCommandId, DesktopCommand>>;

export interface DesktopShortcutContext {
    commands: DesktopCommands;
    blocked: boolean;
    onError: (error: unknown) => void;
}

/**
 * Un accord clavier. `shift: "any"` dit que le caractere porte DEJA l'etat de
 * Maj, ce qui est le cas de tout le pave numerique haut d'un clavier francais.
 */
interface ChordSpec {
    id: DesktopCommandId;
    ctrl?: boolean;
    shift?: boolean | "any";
    /** Compare a `event.key`, donc au CARACTERE, minuscule pour les lettres. */
    keys?: string[];
    /** Compare a `event.code`, donc a la POSITION physique de la touche. */
    codes?: string[];
}

/*
 * Pourquoi le caractere et non la position.
 *
 * Releve sur ce poste avec ToUnicodeEx et la disposition fr-FR (0x040C), face a
 * en-US (0x0409) :
 *
 *   event.code    AZERTY            QWERTY
 *   Digit0        « à », Maj « 0 »  « 0 »
 *   Digit6        « - », Maj « 6 »  « 6 »
 *   Minus         « ) », Maj « ° »  « - »
 *   Equal         « = », Maj « + »  « = », Maj « + »
 *   Comma         « ; », Maj « . »  « , »
 *   KeyM          « , », Maj « ? »  « m »
 *
 * La position ment donc sur trois des six lignes : lier Ctrl + « , » au code
 * Comma poserait le raccourci sous la touche « ; » d'un clavier francais. Les
 * accords se lisent sur `event.key`.
 *
 * Deux consequences suivent de ce releve :
 *   - Un chiffre EXIGE Maj sur AZERTY. Un accord chiffre ne peut donc pas
 *     interdire Maj, sinon Ctrl + « 0 » serait injouable en France.
 *   - AltGr ecrit de vrais caracteres (@ } ] # { [ | \ ^), et Windows le
 *     presente comme Ctrl + Alt. Aucun accord n'accepte Alt.
 */
const CHORDS: ChordSpec[] = [
    { id: "previous", keys: ["ArrowLeft"] },
    { id: "next", keys: ["ArrowRight"] },

    { id: "settings", ctrl: true, keys: [","] },

    { id: "redo", ctrl: true, shift: true, keys: ["z"] },
    { id: "redo", ctrl: true, keys: ["y"] },
    { id: "undo", ctrl: true, keys: ["z"] },
    { id: "cut", ctrl: true, keys: ["x"] },
    { id: "copy", ctrl: true, keys: ["c"] },
    { id: "paste-plain", ctrl: true, shift: true, keys: ["v"] },
    { id: "paste", ctrl: true, keys: ["v"] },
    { id: "select-all", ctrl: true, keys: ["a"] },
    { id: "duplicate", ctrl: true, keys: ["d"] },
    { id: "delete", keys: ["Delete", "Backspace"] },

    {
        id: "hours-reset",
        ctrl: true,
        shift: "any",
        keys: ["0"],
        codes: ["Digit0", "Numpad0"],
    },
    {
        id: "hours-increase",
        ctrl: true,
        shift: "any",
        keys: ["+", "="],
        codes: ["NumpadAdd"],
    },
    {
        id: "hours-decrease",
        ctrl: true,
        shift: "any",
        keys: ["-"],
        codes: ["NumpadSubtract"],
    },

    { id: "hard-reload", ctrl: true, shift: true, keys: ["r"] },
    { id: "hard-reload", shift: true, keys: ["F5"] },
    { id: "reload", ctrl: true, keys: ["r"] },
    { id: "reload", keys: ["F5"] },
    { id: "devtools", ctrl: true, shift: true, keys: ["i"] },
    { id: "devtools", keys: ["F12"] },
    { id: "fullscreen", keys: ["F11"] },
];

/** Les surfaces qui reclament les fleches pour elles : un menu les parcourt,
    un dialogue les garde a l'interieur de son contenu. */
const OVERLAY_ROLES =
    '[role="menu"],[role="menubar"],[role="dialog"],[role="alertdialog"]';

/** `isContentEditable` ne remonte pas aux ancetres et n'existe pas partout :
    l'attribut, lui, est herite par le sous-arbre. */
function inContentEditable(element: Element): boolean {
    const host = element.closest("[contenteditable]");
    return host !== null && host.getAttribute("contenteditable") !== "false";
}

/** La frappe appartient-elle a la cible plutot qu'au calendrier ? */
function targetKeepsKeys(target: EventTarget | null): boolean {
    if (isEditableTarget(target as EditableProbe | null)) return true;
    const element = target as Element | null;
    if (!element || typeof element.closest !== "function") return false;
    return (
        inContentEditable(element) || element.closest(OVERLAY_ROLES) !== null
    );
}

function matches(event: KeyboardEvent, chord: ChordSpec): boolean {
    // Alt seul n'ouvre aucun accord, et Ctrl + Alt EST AltGr.
    if (event.altKey || event.metaKey) return false;
    if (event.ctrlKey !== Boolean(chord.ctrl)) return false;
    if (chord.shift !== "any" && event.shiftKey !== Boolean(chord.shift)) {
        return false;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (chord.keys && chord.keys.indexOf(key) !== -1) return true;
    return Boolean(chord.codes && chord.codes.indexOf(event.code) !== -1);
}

/**
 * Route une frappe vers la commande de la fenetre.
 *
 * @returns true quand l'accord est reconnu ET tenu par cette fenetre, donc
 * consomme ; false quand l'ancien gestionnaire doit continuer.
 */
export function handleDesktopShortcut(
    event: KeyboardEvent,
    context: DesktopShortcutContext
): boolean {
    if (event.defaultPrevented) return false;
    if (event.isComposing) return false;
    if (context.blocked) return false;
    if (targetKeepsKeys(event.target)) return false;

    const chord = CHORDS.find((candidate) => matches(event, candidate));
    if (!chord) return false;

    const command = context.commands[chord.id];
    if (!command) return false;

    event.preventDefault();
    if (!command.enabled) return true;

    try {
        const result: unknown = command.run();
        if (result instanceof Promise) {
            void result.then(undefined, context.onError);
        }
    } catch (reason) {
        context.onError(reason);
    }
    return true;
}
