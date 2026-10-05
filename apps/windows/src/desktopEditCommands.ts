import {
    deleteCharForward,
    redo,
    selectAll,
    undo,
} from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { addDays, startOfDay } from "../../../src/ui/calendar/CalendarUtils";
import { visibleColumnRange } from "../../../src/ui/calendar/gridColumns";
import { DisplayEvent } from "../../../src/ui/types";

/**
 * Quelles occurrences affichées recouvrent réellement `[start, end[`.
 *
 * `displayEvents` porte un tampon de préchargement de part et d'autre de la
 * plage visible (voir `DesktopCalendar.tsx`, `rangeStart`/`rangeEnd`) : le
 * sélectionner tel quel prendrait aussi ce qui n'est pas montré à l'écran.
 * Un évènement ponctuel (start === end) compte quand son instant tombe dans
 * la plage ; les doublons d'occurrence (même id répété) sont dédupliqués.
 */
export function visibleEventIds(
    events: DisplayEvent[],
    start: Date,
    end: Date
): string[] {
    return [
        ...new Set(
            events
                .filter(
                    (event) =>
                        event.start < end &&
                        (event.end > start ||
                            (event.end.getTime() === event.start.getTime() &&
                                event.start >= start))
                )
                .map((event) => event.id)
        ),
    ];
}

/**
 * La plage réellement peinte de la grille horaire, mesurée sur les colonnes
 * plutôt que déduite de `currentDate` : un scroll partiel entre deux
 * rebasages ne bouge pas `currentDate`, mais bouge ce que l'œil voit.
 *
 * `.nc-main-scroller` porte les colonnes `.nc-timegrid-day[data-date]`
 * (`TimeGridSections.tsx`) ; `visibleColumnRange` (gridColumns.ts) dit
 * lesquelles sont réellement montrées, pas seulement dans la plage logique.
 */
function measuredTimeGridRange(
    root: HTMLElement | null
): { start: Date; end: Date } | null {
    if (!root) return null;
    const scroller = root.querySelector<HTMLElement>(".nc-main-scroller");
    if (!scroller) return null;
    const range = visibleColumnRange(scroller);
    if (!range) return null;
    const columns = scroller.querySelectorAll<HTMLElement>(".nc-timegrid-day");
    const first = columns[range.first];
    const last = columns[range.last];
    if (!first || !last) return null;
    const firstDate = first.getAttribute("data-date");
    const lastDate = last.getAttribute("data-date");
    if (!firstDate || !lastDate) return null;
    const start = startOfDay(new Date(firstDate));
    const end = addDays(startOfDay(new Date(lastDate)), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }
    return { start, end };
}

/**
 * La plage `[start, end[` à sélectionner pour « Tout sélectionner ».
 *
 * En grille horaire, la mesure DOM prime — elle seule reflète le scroll
 * partiel. Absente un instant (montage, transition de vue), ou en vue
 * mois/liste où il n'y a pas de scroller à mesurer, `visibleDates` sert de
 * repli : en vue mois il porte les 42 cellules affichées, tampon compris,
 * ce qui EST la plage visible dans ce cas.
 */
export function visibleSelectionRange(
    root: HTMLElement | null,
    hasTimeGrid: boolean,
    visibleDates: Date[]
): { start: Date; end: Date } | null {
    if (hasTimeGrid) {
        const measured = measuredTimeGridRange(root);
        if (measured) return measured;
    }
    if (!visibleDates.length) return null;
    const start = startOfDay(visibleDates[0]);
    const end = addDays(startOfDay(visibleDates[visibleDates.length - 1]), 1);
    return { start, end };
}

/**
 * Ce qu'il faut retenir d'un champ éditable pour lui redonner exactement la
 * même sélection après qu'un menu lui a pris le focus.
 */
export type EditTargetSnapshot =
    | {
          kind: "range";
          element: HTMLInputElement | HTMLTextAreaElement;
          start: number | null;
          end: number | null;
      }
    | {
          kind: "contenteditable";
          element: HTMLElement;
          range: Range;
      };

/** `isContentEditable` n'est pas implémenté par jsdom (toujours `undefined`),
    donc lu sur l'attribut plutôt que sur la propriété calculée — ce que fait
    déjà `desktopCommands.ts` pour la même raison. */
function isContentEditableElement(element: HTMLElement): boolean {
    return (
        element.hasAttribute("contenteditable") &&
        element.getAttribute("contenteditable") !== "false"
    );
}

/**
 * Mémorise la cible d'édition et sa sélection à l'ouverture du menu Modifier.
 * `null` quand rien d'éditable n'a le focus — les commandes de grille ne
 * capturent rien.
 */
export function captureEditTarget(
    active: Element | null = document.activeElement
): EditTargetSnapshot | null {
    if (!active) return null;
    const tag = active.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
        const element = active as HTMLInputElement | HTMLTextAreaElement;
        return {
            kind: "range",
            element,
            start: element.selectionStart,
            end: element.selectionEnd,
        };
    }
    if (isContentEditableElement(active as HTMLElement)) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        return {
            kind: "contenteditable",
            element: active as HTMLElement,
            range: selection.getRangeAt(0).cloneRange(),
        };
    }
    return null;
}

/**
 * Rend le focus et la sélection à la cible mémorisée avant qu'une commande
 * native (`executeNativeTextCommand`) ne s'exécute — sans quoi elle
 * s'appliquerait au menu qui vient de se fermer plutôt qu'au champ.
 *
 * `false` quand la cible a été démontée ou désactivée entre-temps : l'appelant
 * annule la commande plutôt que de l'envoyer dans le vide.
 */
export function restoreEditTarget(
    snapshot: EditTargetSnapshot | null
): boolean {
    if (!snapshot) return false;
    if (!snapshot.element.isConnected) return false;
    if (snapshot.kind === "range") {
        const element = snapshot.element;
        if (element.disabled) return false;
        element.focus();
        try {
            element.setSelectionRange(
                snapshot.start ?? element.value.length,
                snapshot.end ?? element.value.length
            );
        } catch {
            // Certains types d'input (number, email...) refusent
            // setSelectionRange : le focus a tout de même pris.
        }
        return true;
    }
    const element = snapshot.element;
    if (!isContentEditableElement(element)) return false;
    element.focus();
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(snapshot.range);
    return true;
}

/** The edit commands the description editor answers to itself. */
export type EditorCommandId =
    | "undo"
    | "redo"
    | "cut"
    | "copy"
    | "paste"
    | "paste-plain"
    | "delete"
    | "select-all";

export const EDITOR_COMMAND_IDS: readonly EditorCommandId[] = [
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "paste-plain",
    "delete",
    "select-all",
];
const EDITOR_COMMANDS: ReadonlySet<string> = new Set(EDITOR_COMMAND_IDS);

/** The CodeMirror view the captured target lives in, if any. */
function editorViewOf(snapshot: EditTargetSnapshot | null): EditorView | null {
    if (!snapshot || snapshot.kind !== "contenteditable") return null;
    const host = snapshot.element.closest<HTMLElement>(".cm-editor");
    return host ? EditorView.findFromDOM(host) : null;
}

/** True when the Edit menu command belongs to the editor holding the focus. */
export function editorOwnsCommand(
    snapshot: EditTargetSnapshot | null,
    id: string
): boolean {
    return EDITOR_COMMANDS.has(id) && editorViewOf(snapshot) !== null;
}

/**
 * Runs an Edit menu command on the description editor.
 *
 * Undo and redo must go through CodeMirror's own history: the app-wide undo is
 * the deletion history (an event brought back), which has nothing to do with
 * the text the person is typing. Returns false when the target is not a
 * CodeMirror editor, so the caller falls back to the calendar command.
 */
export function runEditorCommand(
    snapshot: EditTargetSnapshot | null,
    id: string
): boolean {
    const view = editorViewOf(snapshot);
    if (!view || !EDITOR_COMMANDS.has(id)) return false;
    view.focus();
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to);
    const readOnly = view.state.readOnly;
    switch (id as EditorCommandId) {
        case "undo":
            if (!readOnly) undo(view);
            break;
        case "redo":
            if (!readOnly) redo(view);
            break;
        case "select-all":
            selectAll(view);
            break;
        case "copy":
            if (selected) void navigator.clipboard?.writeText(selected);
            break;
        case "cut":
            if (selected && !readOnly) {
                void navigator.clipboard?.writeText(selected);
                deleteCharForward(view); // deletes a non-empty selection
            }
            break;
        case "delete":
            if (!readOnly) {
                deleteCharForward(view);
            }
            break;
        case "paste":
        case "paste-plain":
            if (!readOnly) void pasteInto(view);
            break;
    }
    return true;
}

/** Pastes through the editor's own paste handlers (a bare URL becomes a link). */
async function pasteInto(view: EditorView): Promise<void> {
    let text = "";
    try {
        text = (await navigator.clipboard?.readText()) ?? "";
    } catch {
        return;
    }
    if (!text) return;
    if (typeof DataTransfer === "function" && typeof ClipboardEvent === "function") {
        const data = new DataTransfer();
        data.setData("text/plain", text);
        const event = new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
        });
        view.contentDOM.dispatchEvent(event);
        if (event.defaultPrevented) return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.paste",
        scrollIntoView: true,
    });
}
