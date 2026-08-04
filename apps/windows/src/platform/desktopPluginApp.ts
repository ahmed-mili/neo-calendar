interface DesktopShortcutCommand {
    id: string;
    name: string;
}

const command = (id: string, name: string): DesktopShortcutCommand => ({
    id: `neo-calendar:neo-calendar-${id}`,
    name: `Neo Calendar: ${name}`,
});

const commands = [
    command("align-today", "Align today left"),
    command("go-today", "Go to Today"),
    command("go-prev", "Go to Previous Period"),
    command("go-next", "Go to Next Period"),
    command("view-day", "Switch to Day View"),
    command("view-week", "Switch to Week View"),
    command("view-month", "Switch to Month View"),
    command("view-3days", "Switch to 3-Day View"),
    command("view-list", "Switch to List View"),
    command("new-event", "New Event"),
    command("undo", "Undo Event Deletion"),
    command("revalidate", "Revalidate remote calendars"),
    command("reset", "Reset Event Cache"),
    command("open", "Open Calendar"),
    command("open-sidebar", "Open in sidebar"),
    command("toggle-sidebar", "Toggle Sidebar"),
];

const commandMap = Object.fromEntries(commands.map((item) => [item.id, item]));

/**
 * Browser-safe equivalent of the tiny part of Obsidian's App used by the
 * shared shortcuts panel. The desktop app has fixed view shortcuts rather than
 * Obsidian-remappable hotkeys, so custom/default command hotkeys are undefined.
 */
const desktopPluginApp = {
    commands: { commands: commandMap },
    hotkeyManager: {
        getHotkeys: (_id: string) => undefined,
        getDefaultHotkeys: (_id: string) => undefined,
    },
};

export function getPluginApp(): typeof desktopPluginApp {
    return desktopPluginApp;
}

export function setPluginApp(_app: unknown): void {
    // Kept for API compatibility with the plugin module.
}
