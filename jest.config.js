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

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
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
    },
};
