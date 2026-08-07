import {
    Hotkey,
    OTHER_SECTION_TITLE,
    POINTER_ROWS,
    POINTER_SECTION_TITLE,
    SHORTCUT_SECTIONS,
    ShortcutCommand,
    ViewBinding,
    buildSections,
    filterSections,
    formatHotkey,
    resolveHotkeys,
    shortcutKey,
    stripPluginPrefix,
} from "./shortcutRegistry";

const commands: ShortcutCommand[] = [
    {
        id: "neo-calendar:neo-calendar-go-today",
        name: "Neo Calendar: Go to Today",
    },
    {
        id: "neo-calendar:neo-calendar-view-week",
        name: "Neo Calendar: Switch to Week View",
    },
    {
        id: "neo-calendar:neo-calendar-brand-new",
        name: "Neo Calendar: Brand New Thing",
    },
];

const noKeys = () => [] as Hotkey[];

/** Les liaisons de la vue sont injectees explicitement : un test qui n'en parle
    pas n'en veut pas, et n'a donc pas a suivre la vraie table.

    La section souris et tactile est retiree : c'est une table constante que
    buildSections ajoute toujours, et non un resultat de la construction. Elle a
    son propre test plus bas. */
const build = (
    cmds: ShortcutCommand[],
    hotkeysOf: (id: string) => Hotkey[],
    bindings: ViewBinding[] = []
) =>
    buildSections(cmds, hotkeysOf, "Ctrl", bindings).filter(
        (section) => section.title !== POINTER_SECTION_TITLE
    );

const goTodayBinding: ViewBinding = {
    id: "go-today",
    label: "Aujourd'hui",
    section: "Navigation",
    hotkeys: [{ modifiers: ["Shift"], key: "T" }],
    commandKey: "go-today",
};

const paletteBinding: ViewBinding = {
    id: "command-palette",
    label: "Open Command Palette",
    section: "Windows",
    hotkeys: [{ modifiers: [], key: "/" }],
};

describe("shortcutKey", () => {
    it("retire le prefixe du plugin et celui de l'id de commande", () => {
        expect(shortcutKey("neo-calendar:neo-calendar-go-today")).toBe(
            "go-today"
        );
    });

    it("retombe sur l'id complet quand la forme est inattendue", () => {
        expect(shortcutKey("autre-plugin:truc")).toBe("autre-plugin:truc");
    });
});

describe("stripPluginPrefix", () => {
    it("retire le nom du plugin devant le libelle", () => {
        expect(stripPluginPrefix("Neo Calendar: Go to Today")).toBe(
            "Go to Today"
        );
    });

    it("laisse intact un libelle sans prefixe", () => {
        expect(stripPluginPrefix("Go to Today")).toBe("Go to Today");
    });
});

describe("formatHotkey", () => {
    it("rend une touche nue", () => {
        expect(formatHotkey({ modifiers: [], key: "T" })).toEqual(["T"]);
    });

    it("rend les modificateurs avant la touche", () => {
        expect(formatHotkey({ modifiers: ["Shift"], key: "T" })).toEqual([
            "Shift",
            "T",
        ]);
    });

    it("traduit Mod par le libelle de la plateforme", () => {
        expect(formatHotkey({ modifiers: ["Mod"], key: "K" })).toEqual([
            "Ctrl",
            "K",
        ]);
        expect(formatHotkey({ modifiers: ["Mod"], key: "K" }, "Cmd")).toEqual([
            "Cmd",
            "K",
        ]);
    });

    it("ordonne les modificateurs de maniere stable", () => {
        expect(
            formatHotkey({ modifiers: ["Shift", "Mod", "Alt"], key: "P" })
        ).toEqual(["Ctrl", "Shift", "Alt", "P"]);
    });

    it("garde la casse d'un nom de touche au lieu de le crier", () => {
        expect(formatHotkey({ modifiers: [], key: "Delete" })).toEqual([
            "Delete",
        ]);
    });
});

describe("resolveHotkeys", () => {
    const custom: Hotkey[] = [{ modifiers: ["Mod"], key: "T" }];
    const defaults: Hotkey[] = [{ modifiers: [], key: "T" }];

    it("prend le defaut quand l'utilisateur n'a rien personnalise", () => {
        expect(resolveHotkeys(undefined, defaults)).toEqual(defaults);
    });

    it("prend la personnalisation quand elle existe", () => {
        expect(resolveHotkeys(custom, defaults)).toEqual(custom);
    });

    it("rend un raccourci supprime par l'utilisateur, pas le defaut", () => {
        expect(resolveHotkeys([], defaults)).toEqual([]);
    });

    it("rend une liste vide quand il n'y a ni personnalisation ni defaut", () => {
        expect(resolveHotkeys(undefined, undefined)).toEqual([]);
    });
});

describe("buildSections", () => {
    it("range chaque commande dans sa section", () => {
        const sections = build(commands, noKeys);
        const nav = sections.find((s) => s.title === "Navigation");
        const views = sections.find((s) => s.title === "Views");
        expect(nav?.rows.map((r) => r.label)).toContain("Go to Today");
        expect(views?.rows.map((r) => r.label)).toContain(
            "Switch to Week View"
        );
    });

    it("range une commande inconnue dans la section Other au lieu de la perdre", () => {
        const sections = build(commands, noKeys);
        const other = sections.find((s) => s.title === OTHER_SECTION_TITLE);
        expect(other?.rows.map((r) => r.label)).toEqual(["Brand New Thing"]);
    });

    it("conserve une commande sans raccourci, sans accord", () => {
        const sections = build(commands, noKeys);
        const row = sections
            .flatMap((s) => s.rows)
            .find((r) => r.label === "Go to Today");
        expect(row?.chords).toEqual([]);
    });

    it("porte les accords des raccourcis assignes", () => {
        const sections = build(commands, (id) =>
            id === "neo-calendar:neo-calendar-go-today"
                ? [
                      { modifiers: ["Shift"], key: "T" },
                      { modifiers: ["Mod"], key: "T" },
                  ]
                : []
        );
        const row = sections
            .flatMap((s) => s.rows)
            .find((r) => r.label === "Go to Today");
        expect(row?.chords).toEqual([
            ["Shift", "T"],
            ["Ctrl", "T"],
        ]);
    });

    it("marque les lignes issues des commandes comme remappables", () => {
        const rows = build(commands, noKeys).flatMap((s) => s.rows);
        expect(rows.every((r) => r.remappable)).toBe(true);
    });

    it("omet les sections vides", () => {
        const sections = build([commands[0]], noKeys);
        expect(sections.map((s) => s.title)).toEqual(["Navigation"]);
    });
});

describe("buildSections, fusion des deux sources", () => {
    it("remplace une commande sans raccourci par la touche de la vue", () => {
        const rows = build([commands[0]], noKeys, [goTodayBinding]).flatMap(
            (s) => s.rows
        );
        expect(rows).toEqual([
            {
                id: "view:go-today",
                // Le libelle vient de la commande : c'est elle qui le nomme,
                // la table de la vue ne peut donc pas deriver.
                label: "Go to Today",
                chords: [["Shift", "T"]],
                remappable: false,
            },
        ]);
    });

    it("garde les deux lignes quand l'utilisateur a aussi assigne un raccourci", () => {
        const rows = build(
            [commands[0]],
            () => [{ modifiers: ["Mod"], key: "T" }],
            [goTodayBinding]
        ).flatMap((s) => s.rows);
        expect(rows.map((r) => [r.label, r.chords, r.remappable])).toEqual([
            ["Go to Today", [["Ctrl", "T"]], true],
            ["Aujourd'hui", [["Shift", "T"]], false],
        ]);
    });

    it("liste une touche de la vue qui n'a aucune commande", () => {
        const sections = build([], noKeys, [paletteBinding]);
        expect(sections).toEqual([
            {
                title: "Windows",
                rows: [
                    {
                        id: "view:command-palette",
                        label: "Open Command Palette",
                        chords: [["/"]],
                        remappable: false,
                    },
                ],
            },
        ]);
    });

    it("range dans Other une touche de la vue dont la section est inconnue", () => {
        const sections = build([], noKeys, [
            { ...paletteBinding, section: "Nulle part" },
        ]);
        expect(sections.map((s) => s.title)).toEqual([OTHER_SECTION_TITLE]);
    });

    it("annonce exactement les touches cablees dans la vue", () => {
        // Sans commande : il ne reste que la vraie table du module, donc ce test
        // est le contrat de ce que le panneau affiche comme non remappable.
        // La section souris est ecartee ici, elle a le sien.
        const rows = buildSections([], noKeys)
            .filter((section) => section.title !== POINTER_SECTION_TITLE)
            .flatMap((s) => s.rows);
        expect(
            rows.map(
                (r) =>
                    `${r.label}: ${r.chords
                        .map((c) => c.join(" "))
                        .join(" / ")}`
            )
        ).toEqual([
            "Align today left: T",
            "Go to Today: Shift T",
            "Go to Previous Period: K / [",
            "Go to Next Period: J / ]",
            "Switch to Day View: D",
            "Switch to Week View: W",
            "Switch to Month View: M",
            "Switch to 3-Day View: 3",
            "Switch to List View: L",
            "New Event: C",
            "Undo Event Deletion: Ctrl Z",
            "Copy Event: Ctrl C",
            "Cut Event: Ctrl X",
            "Paste Event: Ctrl V",
            "Duplicate Event: Ctrl D",
            "Delete Event: Delete / Backspace",
            "Toggle Sidebar: B / .",
            "Open Command Palette: /",
        ]);
        expect(rows.every((r) => !r.remappable)).toBe(true);
    });

    it("ne perd aucune touche de la vue dans une section fantome", () => {
        const titles = [
            ...SHORTCUT_SECTIONS.map((s) => s.title),
            POINTER_SECTION_TITLE,
        ];
        const sections = buildSections([], noKeys);
        expect(sections.map((s) => s.title)).not.toContain(OTHER_SECTION_TITLE);
        expect(sections.every((s) => titles.includes(s.title))).toBe(true);
    });
});

describe("filterSections", () => {
    const sections = build(commands, (id) =>
        id === "neo-calendar:neo-calendar-view-week"
            ? [{ modifiers: ["Shift"], key: "W" }]
            : []
    );

    it("renvoie tout pour une requete vide", () => {
        expect(filterSections(sections, "  ")).toEqual(sections);
    });

    it("filtre par libelle", () => {
        const out = filterSections(sections, "week");
        expect(out.flatMap((s) => s.rows).map((r) => r.label)).toEqual([
            "Switch to Week View",
        ]);
    });

    it("filtre par touche, sur une requete absente des libelles", () => {
        const out = filterSections(sections, "shift");
        expect(out.flatMap((s) => s.rows).map((r) => r.label)).toEqual([
            "Switch to Week View",
        ]);
    });

    it("filtre aussi les touches cablees dans la vue", () => {
        const merged = build(commands, noKeys, [paletteBinding]);
        const out = filterSections(merged, "/");
        expect(out.flatMap((s) => s.rows).map((r) => r.label)).toEqual([
            "Open Command Palette",
        ]);
    });

    it("ignore les accents et la casse", () => {
        const accented = build(
            [
                {
                    id: "neo-calendar:neo-calendar-go-today",
                    name: "Neo Calendar: Évènement du jour",
                },
            ],
            noKeys
        );
        expect(filterSections(accented, "EVENEMENT")).toHaveLength(1);
    });

    it("fait disparaitre une section dont plus aucune ligne ne passe", () => {
        const out = filterSections(sections, "week");
        expect(out.map((s) => s.title)).toEqual(["Views"]);
    });

    it("renvoie une liste vide quand rien ne correspond", () => {
        expect(filterSections(sections, "zzzz")).toEqual([]);
    });
});

describe("la section souris et tactile", () => {
    // Elle ne depend ni des commandes ni des touches de la vue : elle decrit
    // des gestes cables dans l'interface, donc elle est toujours la.
    it("est presente meme sans aucune commande ni liaison", () => {
        const sections = buildSections([], noKeys, "Ctrl", []);
        const pointer = sections.find((s) => s.title === POINTER_SECTION_TITLE);

        expect(pointer?.rows).toEqual(POINTER_ROWS);
    });

    it("n'annonce aucune de ses lignes comme remappable", () => {
        expect(POINTER_ROWS.every((row) => row.remappable)).toBe(false);
    });
});
