import { findObsidianVaultAncestor, PathAccess } from "./vaultGuard";

function createPathAccess(obsidianFolders: readonly string[]): PathAccess {
    return {
        dirname: async (path) => {
            if (path === "C:/") {
                throw new Error("path does not have a parent");
            }
            const index = path.lastIndexOf("/");
            return index > "C:".length ? path.slice(0, index) : "C:/";
        },
        hasObsidianConfig: async (path) =>
            obsidianFolders.includes(`${path.replace(/\/$/, "")}/.obsidian`),
    };
}

describe("findObsidianVaultAncestor", () => {
    it("finds a vault above a selected subfolder", async () => {
        const access = createPathAccess([
            "C:/obsidian-vaults/Personal/.obsidian",
        ]);

        await expect(
            findObsidianVaultAncestor(
                "C:/obsidian-vaults/Personal/Calendar data",
                access
            )
        ).resolves.toBe("C:/obsidian-vaults/Personal");
    });

    it("accepts a folder with no vault ancestor", async () => {
        const access = createPathAccess([]);

        await expect(
            findObsidianVaultAncestor("C:/Shared/Neo Calendar", access)
        ).resolves.toBeNull();
    });

    it("stops at the Windows drive root without asking for its parent", async () => {
        const access = createPathAccess([]);

        await expect(
            findObsidianVaultAncestor("C:/", access)
        ).resolves.toBeNull();
    });
});
