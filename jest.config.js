// Snapshots of the tree kept on disk beside it. Their tests import paths that
// only resolve inside their own copy, so running them here only ever reports
// failures about the copy rather than about the code being worked on.
const SNAPSHOT_COPIES = [
    "/android-backups/",
    "/android-diagnostics/",
    "/neo-calendar-current-draft-debug/",
    "/neo-calendar-current-mobile-and-folders/",
    "/neo-calendar-editor-sources/",
    "/neo-calendar-hour-height-diagnostic/",
    "/neo-calendar-scroll-draft-runtime/",
];

// The version the two apps bake into their bundles at build time. Defined here
// too, from the same place, so a component that shows it renders under test
// exactly as it does in the app.
const { version } = require("./package.json");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    globals: {
        __NEO_VERSION__: version,
    },
    testPathIgnorePatterns: [
        "/node_modules/",
        "/\\.claude/",
        ...SNAPSHOT_COPIES,
        "\\.bak\\.",
    ],
    // Same copies, hidden from the module map as well: each carries a
    // package.json whose name matches the real one, and Jest reports every
    // duplicate as a haste collision on startup.
    modulePathIgnorePatterns: SNAPSHOT_COPIES,
    moduleNameMapper: {
        "^react$": "<rootDir>/node_modules/react",
        "^react-dom$": "<rootDir>/node_modules/react-dom",
        "^react-dom/(.*)$": "<rootDir>/node_modules/react-dom/$1",
        // Le pont natif n'est installé que dans apps/windows, et la suite tourne
        // depuis la racine : sans cette ligne, tout fichier partagé qui importe
        // @tauri-apps fait tomber la suite entière à l'import, avant le premier
        // rendu. C'est arrivé deux fois, et deux versions sont sorties sans
        // artefact pour cette raison. La doublure se laisse importer et refuse
        // d'être appelée — voir test_helpers/tauriModuleStub.ts.
        "^@tauri-apps/.*$": "<rootDir>/test_helpers/tauriModuleStub.ts",
    },
};
