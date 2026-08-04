import { normalizeSearch } from "./CalendarEventsPanel.helpers";

/** Un raccourci tel qu'Obsidian le stocke. */
export interface Hotkey {
    modifiers: string[];
    key: string;
}

/** Une commande telle qu'Obsidian l'expose dans app.commands.commands. */
export interface ShortcutCommand {
    id: string;
    name: string;
}

/** Une ligne du panneau. `chords` porte un tableau de touches par raccourci
    assigne, donc plusieurs accords quand la commande en a plusieurs. */
export interface ShortcutRow {
    id: string;
    label: string;
    chords: string[][];
    /**
     * Les touches affichees sont-elles remappables dans les reglages
     * d'Obsidian ? Vrai pour une commande, faux pour une touche cablee dans la
     * vue du calendrier.
     */
    remappable: boolean;
}

export interface ShortcutSection {
    title: string;
    rows: ShortcutRow[];
}

/**
 * Une liaison clavier cablee dans la vue du calendrier, donc non remappable.
 * Cette table est le reflet de `useKeyboardShortcuts.ts` : chaque entree
 * correspond a une branche reellement presente la-bas, et rien d'autre.
 * `commandKey` designe la commande que la touche declenche quand il en existe
 * une, pour que le panneau montre une seule ligne par action.
 */
export interface ViewBinding {
    id: string;
    label: string;
    section: string;
    hotkeys: Hotkey[];
    commandKey?: string;
}

/** Prefixes poses par Obsidian et par nos ids de commande. */
const ID_PREFIX = "neo-calendar:neo-calendar-";
const NAME_PREFIX = "Neo Calendar: ";

export const OTHER_SECTION_TITLE = "Other";
export const POINTER_SECTION_TITLE = "Mouse & touch";

/** Mouse and touch interactions implemented by the shared calendar UI and by
 * the desktop shell. They are displayed in the shortcuts panel just like the
 * plugin, but are intentionally not remappable. */
export const POINTER_ROWS: ShortcutRow[] = [
    {
        id: "pointer:open-event",
        label: "Open an event",
        chords: [["Click"]],
        remappable: false,
    },
    {
        id: "pointer:multi-select",
        label: "Add or remove an event from selection",
        chords: [["Ctrl", "Click"]],
        remappable: false,
    },
    {
        id: "pointer:marquee",
        label: "Select several events",
        chords: [["Shift", "Drag"]],
        remappable: false,
    },
    {
        id: "pointer:create",
        label: "Create a 30-minute event",
        chords: [["Double-click"]],
        remappable: false,
    },
    {
        id: "pointer:create-range",
        label: "Create an event over a time range",
        chords: [["Click", "Drag"]],
        remappable: false,
    },
    {
        id: "pointer:context",
        label: "Open the context menu",
        chords: [["Right-click"]],
        remappable: false,
    },
    {
        id: "pointer:move",
        label: "Move an event",
        chords: [["Drag event"]],
        remappable: false,
    },
    {
        id: "pointer:resize",
        label: "Resize an event",
        chords: [["Drag edge"]],
        remappable: false,
    },
    {
        id: "pointer:default-calendar",
        label: "Set the default calendar",
        chords: [["Click color"]],
        remappable: false,
    },
    {
        id: "pointer:calendar-color",
        label: "Change a calendar color",
        chords: [["Shift", "Click color"]],
        remappable: false,
    },
];

/**
 * Rangement des commandes en sections. C'est la SEULE partie ecrite a la main :
 * une commande absente de cette table tombe dans "Other" plutot que de
 * disparaitre, donc un oubli est visible et sans consequence.
 */
export const SHORTCUT_SECTIONS: { title: string; keys: string[] }[] = [
    {
        title: "Navigation",
        keys: ["align-today", "go-today", "go-prev", "go-next"],
    },
    {
        title: "Views",
        keys: [
            "view-day",
            "view-week",
            "view-month",
            "view-3days",
            "view-list",
        ],
    },
    { title: "Events", keys: ["new-event", "undo"] },
    { title: "Calendars", keys: ["revalidate", "reset"] },
    { title: "Windows", keys: ["open", "open-sidebar", "toggle-sidebar"] },
];

/**
 * Les touches gerees dans la vue. Ecrite en lisant le `switch` de
 * `useKeyboardShortcuts.ts` : une entree ici sans branche la-bas serait un
 * raccourci annonce qui n'agit pas.
 */
export const VIEW_BINDINGS: ViewBinding[] = [
    {
        id: "align-today",
        label: "Align today left",
        section: "Navigation",
        hotkeys: [{ modifiers: [], key: "T" }],
        commandKey: "align-today",
    },
    {
        id: "go-today",
        label: "Go to Today",
        section: "Navigation",
        hotkeys: [{ modifiers: ["Shift"], key: "T" }],
        commandKey: "go-today",
    },
    {
        id: "go-prev",
        label: "Go to Previous Period",
        section: "Navigation",
        hotkeys: [
            { modifiers: [], key: "K" },
            { modifiers: [], key: "[" },
        ],
        commandKey: "go-prev",
    },
    {
        id: "go-next",
        label: "Go to Next Period",
        section: "Navigation",
        hotkeys: [
            { modifiers: [], key: "J" },
            { modifiers: [], key: "]" },
        ],
        commandKey: "go-next",
    },
    {
        id: "view-day",
        label: "Switch to Day View",
        section: "Views",
        hotkeys: [{ modifiers: [], key: "D" }],
        commandKey: "view-day",
    },
    {
        id: "view-week",
        label: "Switch to Week View",
        section: "Views",
        hotkeys: [{ modifiers: [], key: "W" }],
        commandKey: "view-week",
    },
    {
        id: "view-month",
        label: "Switch to Month View",
        section: "Views",
        hotkeys: [{ modifiers: [], key: "M" }],
        commandKey: "view-month",
    },
    {
        id: "view-3days",
        label: "Switch to 3-Day View",
        section: "Views",
        hotkeys: [{ modifiers: [], key: "3" }],
        commandKey: "view-3days",
    },
    {
        id: "view-list",
        label: "Switch to List View",
        section: "Views",
        hotkeys: [{ modifiers: [], key: "L" }],
        commandKey: "view-list",
    },
    {
        id: "new-event",
        label: "New Event",
        section: "Events",
        hotkeys: [{ modifiers: [], key: "C" }],
        commandKey: "new-event",
    },
    {
        id: "undo",
        label: "Undo Event Deletion",
        section: "Events",
        hotkeys: [{ modifiers: ["Mod"], key: "Z" }],
        commandKey: "undo",
    },
    {
        id: "copy-event",
        label: "Copy Event",
        section: "Events",
        hotkeys: [{ modifiers: ["Mod"], key: "C" }],
    },
    {
        id: "cut-event",
        label: "Cut Event",
        section: "Events",
        hotkeys: [{ modifiers: ["Mod"], key: "X" }],
    },
    {
        id: "paste-event",
        label: "Paste Event",
        section: "Events",
        hotkeys: [{ modifiers: ["Mod"], key: "V" }],
    },
    {
        id: "duplicate-event",
        label: "Duplicate Event",
        section: "Events",
        hotkeys: [{ modifiers: ["Mod"], key: "D" }],
    },
    {
        id: "delete-event",
        label: "Delete Event",
        section: "Events",
        hotkeys: [
            { modifiers: [], key: "Delete" },
            { modifiers: [], key: "Backspace" },
        ],
    },
    {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        section: "Windows",
        hotkeys: [
            { modifiers: [], key: "B" },
            { modifiers: [], key: "." },
        ],
        commandKey: "toggle-sidebar",
    },
    {
        id: "command-palette",
        label: "Open Command Palette",
        section: "Windows",
        hotkeys: [{ modifiers: [], key: "/" }],
    },
];

/** L'id court d'une commande, celui que la table de sections utilise. */
export function shortcutKey(fullId: string): string {
    return fullId.startsWith(ID_PREFIX)
        ? fullId.slice(ID_PREFIX.length)
        : fullId;
}

/** Le libelle sans le nom du plugin qu'Obsidian prefixe. */
export function stripPluginPrefix(name: string): string {
    return name.startsWith(NAME_PREFIX) ? name.slice(NAME_PREFIX.length) : name;
}

// Ordre d'affichage des modificateurs, fixe pour que deux raccourcis
// equivalents se lisent toujours pareil.
const MODIFIER_ORDER = ["Mod", "Ctrl", "Meta", "Shift", "Alt"];

/** Les touches d'un raccourci, pretes a etre rendues en badges. */
export function formatHotkey(hotkey: Hotkey, modLabel = "Ctrl"): string[] {
    const mods = [...(hotkey.modifiers || [])].sort(
        (a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b)
    );
    // Une touche d'un seul caractere se lit en majuscule (T, W), un nom de
    // touche garde sa casse : "DELETE" ne se lirait pas.
    const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
    return [...mods.map((m) => (m === "Mod" ? modLabel : m)), key];
}

/**
 * Les touches REELLEMENT assignees a une commande.
 *
 * Un tableau vide n'est pas l'absence de personnalisation : c'est une
 * personnalisation qui retire le raccourci. Seul `undefined` signifie que
 * l'utilisateur n'a rien touche, donc que le defaut s'applique.
 */
export function resolveHotkeys(
    custom: Hotkey[] | undefined,
    defaults: Hotkey[] | undefined
): Hotkey[] {
    if (custom) return custom;
    return defaults || [];
}

/**
 * Construit les sections affichables en fusionnant DEUX sources : les commandes
 * d'Obsidian (remappables) et les touches cablees dans la vue (fixes).
 *
 * `hotkeysOf` et `bindings` sont injectes plutot que lus depuis l'API et depuis
 * la table du module : c'est ce qui rend cette fonction testable sans Obsidian.
 * L'appelant branche sur `hotkeysOf` les touches REELLEMENT assignees a la
 * commande (voir `resolveHotkeys`).
 *
 * Une action tenue par les deux sources ne donne qu'une ligne : celle qui dit
 * vrai. La commande sans raccourci assigne cede la place a la touche de la vue,
 * sinon le panneau afficherait deux fois le meme libelle dont une fois sans
 * aucune touche.
 */
export function buildSections(
    commands: ShortcutCommand[],
    hotkeysOf: (id: string) => Hotkey[],
    modLabel = "Ctrl",
    bindings: ViewBinding[] = VIEW_BINDINGS
): ShortcutSection[] {
    const chordsOf = (hotkeys: Hotkey[] | undefined): string[][] =>
        (hotkeys || []).map((h) => formatHotkey(h, modLabel));

    const used = new Set<ViewBinding>();
    const bindingRow = (binding: ViewBinding, label?: string): ShortcutRow => {
        used.add(binding);
        return {
            id: `view:${binding.id}`,
            label: label || binding.label,
            chords: chordsOf(binding.hotkeys),
            remappable: false,
        };
    };
    const commandRow = (
        command: ShortcutCommand,
        chords: string[][]
    ): ShortcutRow => ({
        id: command.id,
        label: stripPluginPrefix(command.name),
        chords,
        remappable: true,
    });

    const placed = new Set<string>();
    const rowsBySection = new Map<string, ShortcutRow[]>();

    // Les commandes forment l'ossature : leur ordre dans SHORTCUT_SECTIONS
    // decide de l'ordre des lignes.
    for (const section of SHORTCUT_SECTIONS) {
        const rows: ShortcutRow[] = [];
        for (const key of section.keys) {
            const command = commands.find((c) => shortcutKey(c.id) === key);
            const binding = bindings.find((b) => b.commandKey === key);
            if (!command) {
                if (binding) rows.push(bindingRow(binding));
                continue;
            }
            placed.add(command.id);
            const chords = chordsOf(hotkeysOf(command.id));
            if (chords.length === 0 && binding) {
                rows.push(bindingRow(binding, stripPluginPrefix(command.name)));
            } else {
                rows.push(commandRow(command, chords));
            }
        }
        rowsBySection.set(section.title, rows);
    }

    const rest: ShortcutRow[] = [];

    // Les touches de la vue qui ne doublent aucune ligne deja posee : celles
    // sans commande, et celles dont la commande porte en plus un raccourci
    // assigne par l'utilisateur (les deux agissent, les deux se lisent).
    for (const binding of bindings) {
        if (used.has(binding)) continue;
        const rows = rowsBySection.get(binding.section);
        (rows || rest).push(bindingRow(binding));
    }

    for (const command of commands) {
        if (placed.has(command.id)) continue;
        rest.push(commandRow(command, chordsOf(hotkeysOf(command.id))));
    }

    const sections: ShortcutSection[] = [];
    for (const section of SHORTCUT_SECTIONS) {
        const rows = rowsBySection.get(section.title) || [];
        if (rows.length > 0) sections.push({ title: section.title, rows });
    }
    sections.push({ title: POINTER_SECTION_TITLE, rows: POINTER_ROWS });
    if (rest.length > 0) {
        sections.push({ title: OTHER_SECTION_TITLE, rows: rest });
    }

    return sections;
}

/** Filtre sur le libelle ET sur les touches, insensible a la casse et aux
    accents. Une section videe disparait. */
export function filterSections(
    sections: ShortcutSection[],
    query: string
): ShortcutSection[] {
    const needle = normalizeSearch(query.trim());
    if (!needle) return sections;
    const out: ShortcutSection[] = [];
    for (const section of sections) {
        const rows = section.rows.filter((row) => {
            const haystack = normalizeSearch(
                `${row.label} ${row.chords.map((c) => c.join(" ")).join(" ")}`
            );
            return haystack.includes(needle);
        });
        if (rows.length > 0) out.push({ title: section.title, rows });
    }
    return out;
}
