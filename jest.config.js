/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testPathIgnorePatterns: [
        "/node_modules/",
        "/\\.claude/",
        // Snapshots of the tree kept on disk. Their tests import paths that only
        // resolve inside their own copy, so running them here only ever reports
        // failures about the copy rather than about the code being worked on.
        "/android-backups/",
        "/neo-calendar-current-mobile-and-folders/",
        "\\.bak\\.",
    ],
    moduleNameMapper: {
        "^react$": "<rootDir>/node_modules/react",
        "^react-dom$": "<rootDir>/node_modules/react-dom",
        "^react-dom/(.*)$": "<rootDir>/node_modules/react-dom/$1",
    },
};
