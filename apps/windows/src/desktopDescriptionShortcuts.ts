const commandByKey: Record<string, "bold" | "italic" | "underline"> = {
    b: "bold",
    i: "italic",
    u: "underline",
};

document.addEventListener(
    "keydown",
    (event) => {
        if (
            !event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            event.repeat
        ) {
            return;
        }

        const command = commandByKey[event.key.toLowerCase()];
        if (!command) return;

        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        const section = target.closest(".nc-description-section");
        if (!section) return;

        const button = section.querySelector(
            `.nc-description-tool[data-format-command="${command}"]`
        );
        if (!(button instanceof HTMLButtonElement) || button.disabled) return;

        event.preventDefault();
        event.stopPropagation();
        button.click();
    },
    true
);
