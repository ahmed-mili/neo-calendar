import { MarkdownView, TFile, Vault, Workspace } from "obsidian";
import EventCache from "src/core/EventCache";

/**
 * Open the note an event lives in, and put the cursor on it.
 *
 * A pinned leaf is left alone — the event opens in a new tab instead, since the
 * user pinned that pane precisely so it wouldn't be navigated away from.
 */
export async function openFileForEvent(
    cache: EventCache,
    { workspace, vault }: { workspace: Workspace; vault: Vault },
    id: string
) {
    const details = cache.getInfoForEditableEvent(id);
    if (!details) {
        throw new Error("Event does not have local representation.");
    }
    const { path, lineNumber } = details.location;

    const file = vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        return;
    }

    let leaf = workspace.getMostRecentLeaf();
    if (!leaf) {
        return;
    }
    if (leaf.getViewState().pinned) {
        leaf = workspace.getLeaf("tab");
    }

    await leaf.openFile(file);

    // Line 0 is a real line: check for a missing line number, not a falsy one.
    if (lineNumber !== undefined && leaf.view instanceof MarkdownView) {
        leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
    }
}
