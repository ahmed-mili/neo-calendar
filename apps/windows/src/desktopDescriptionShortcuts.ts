import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "../../../src/ui/calendar/descriptionLinkShortcut";

/* Ctrl+B, Ctrl+I and Ctrl+L belong to the editor's own keymap (Obsidian's
   rules); only the keys the editor does not know are handled here. */

export function handleDesktopDescriptionShortcut(event: KeyboardEvent): void {
    if (
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat
    ) {
        return;
    }

    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".cm-editor")) return;
    const section = target.closest(".nc-description-section");
    if (!section) return;

    const key = event.key.toLowerCase();
    if (key === "k") {
        event.preventDefault();
        event.stopPropagation();
        section.dispatchEvent(new Event(OPEN_DESCRIPTION_LINK_DIALOG_EVENT));
        return;
    }

    if (key !== "u") return;

    const button = section.querySelector(
        '.nc-description-tool[data-format-command="underline"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    button.click();
}

document.addEventListener("keydown", handleDesktopDescriptionShortcut, true);
