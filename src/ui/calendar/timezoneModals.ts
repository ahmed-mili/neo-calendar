import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";
import { listZones, richZoneLabel } from "./TimezonePicker";

/**
 * Native Obsidian searchable picker to choose a timezone (used by the
 * "Change time zone" menu action). Recently-used zones are listed first.
 * Calls `onPick` with the chosen IANA name.
 */
export function openTimezonePicker(
    app: App,
    referenceDate: Date,
    recents: string[],
    onPick: (tz: string) => void
): void {
    class TimezoneSuggestModal extends FuzzySuggestModal<string> {
        getItems(): string[] {
            const all = listZones();
            const rec = recents.filter((z) => all.includes(z));
            const recentSet = new Set(rec);
            return [...rec, ...all.filter((z) => !recentSet.has(z))];
        }
        getItemText(tz: string): string {
            return richZoneLabel(tz, referenceDate);
        }
        onChooseItem(tz: string): void {
            onPick(tz);
        }
    }
    const modal = new TimezoneSuggestModal(app);
    modal.setPlaceholder("Time zone…");
    modal.open();
}

/**
 * Small modal with a text field to set a custom label for a timezone (the
 * "Rename" menu action). Submitting an empty value clears the custom label.
 */
export function openTimezoneRename(
    app: App,
    current: string,
    onSubmit: (label: string) => void
): void {
    class RenameModal extends Modal {
        private value = current;

        onOpen(): void {
            const { contentEl } = this;
            contentEl.createEl("h3", { text: "Rename time zone" });
            const commit = () => {
                onSubmit(this.value.trim());
                this.close();
            };
            new Setting(contentEl).setName("Label").addText((text) => {
                text.setValue(current).onChange((v) => (this.value = v));
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") commit();
                });
                window.setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                }, 0);
            });
            new Setting(contentEl).addButton((btn) =>
                btn.setButtonText("Save").setCta().onClick(commit)
            );
        }

        onClose(): void {
            this.contentEl.empty();
        }
    }
    new RenameModal(app).open();
}
