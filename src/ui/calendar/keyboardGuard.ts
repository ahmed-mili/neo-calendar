/** Ce qu'il faut connaitre d'un element pour decider s'il recoit de la frappe.
    Un objet simple plutot qu'un HTMLElement, pour que la decision reste
    testable sans DOM. */
export interface EditableProbe {
    tagName?: string;
    isContentEditable?: boolean;
}

/**
 * Le focus est-il sur quelque chose qui recoit de la frappe ?
 *
 * Les raccourcis du calendrier sont des touches nues (T, C, W...). Sans cette
 * garde, taper un titre d'evenement declencherait une action. Elle vit dans le
 * gestionnaire de touches de la vue (useKeyboardShortcuts), seul endroit ou ces
 * touches agissent, et reste pure pour rester testable sans DOM.
 */
export function isEditableTarget(
    target: EditableProbe | null | undefined
): boolean {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = (target.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
