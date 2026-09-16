import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "../../../src/ui/calendar/descriptionLinkShortcut";

const commandByKey: Record<string, "bold" | "italic" | "underline"> = {
    b: "bold",
    i: "italic",
    u: "underline",
};

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
    if (!(target instanceof HTMLTextAreaElement)) return;
    const section = target.closest(".nc-description-section");
    if (!section) return;

    const key = event.key.toLowerCase();
    if (key === "k") {
        event.preventDefault();
        event.stopPropagation();
        section.dispatchEvent(new Event(OPEN_DESCRIPTION_LINK_DIALOG_EVENT));
        return;
    }

    const command = commandByKey[key];
    if (!command) return;

    const button = section.querySelector(
        `.nc-description-tool[data-format-command="${command}"]`
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    button.click();
}

document.addEventListener("keydown", handleDesktopDescriptionShortcut, true);
