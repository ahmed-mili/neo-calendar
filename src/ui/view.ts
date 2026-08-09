import "./calendar/Calendar.css";
import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import * as ReactDOM from "react-dom";
import { createElement } from "react";
import NeoCalendarPlugin from "../main";
import { NeoCalendarError, NeoEvent } from "../types";
import { renderOnboarding } from "./onboard";
import { openFileForEvent } from "./actions";
import { cycleTaskStatus, isTask } from "src/ui/tasks";
import CalendarApp from "./calendar/CalendarApp";

export const NEO_CALENDAR_VIEW_TYPE = "neo-calendar-view";
export const NEO_CALENDAR_SIDEBAR_VIEW_TYPE = "neo-calendar-sidebar-view";

/** How long the "event deleted" toast sticks around, in ms. */
const UNDO_NOTICE_MS = 5000;

/**
 * The Obsidian view the calendar lives in — the same class for the main tab and
 * the sidebar, told apart by `inSidebar`.
 *
 * It mounts the React app and hands it the few actions that need Obsidian
 * itself: opening a note, deleting with an undo toast, ticking a task. Everything
 * else the calendar does, it does inside React.
 */
export class CalendarView extends ItemView {
    plugin: NeoCalendarPlugin;
    inSidebar: boolean;

    /** Where React is mounted, so it can be unmounted again. */
    private reactRoot: HTMLElement | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        plugin: NeoCalendarPlugin,
        inSidebar = false
    ) {
        super(leaf);
        this.plugin = plugin;
        this.inSidebar = inSidebar;
    }

    getIcon(): string {
        return "calendar-glyph";
    }

    getViewType(): string {
        return this.inSidebar
            ? NEO_CALENDAR_SIDEBAR_VIEW_TYPE
            : NEO_CALENDAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.inSidebar ? "Neo Calendar" : "Calendar";
    }

    async onOpen() {
        await this.plugin.loadSettings();

        if (!this.plugin.cache) {
            new Notice("Neo Calendar event cache not loaded.");
            return;
        }
        if (!this.plugin.cache.initialized) {
            await this.plugin.cache.populate();
        }

        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        // A previous render may have left our class on this (reused) container.
        // Onboarding must not inherit the calendar's padding/overflow, so start
        // clean and only re-add the class on the calendar path below.
        container.removeClass("nc-view-content");

        const root = container.createEl("div");

        const configured = this.plugin.settings.calendarSources.filter(
            (source) => source.type !== "FOR_TEST_ONLY"
        );
        if (configured.length === 0) {
            renderOnboarding(this.app, this.plugin, root);
            return;
        }

        // Let the React root fill the view, so the time grid's own scroller is
        // the only vertical one — that's what keeps the day headers and the
        // all-day bar pinned while the grid scrolls under them.
        container.addClass("nc-view-content");
        root.addClass("nc-root");

        this.reactRoot = root;
        ReactDOM.render(this.renderApp(), root);

        // Remote calendars are stale-while-revalidate: coming back to the view
        // is a good moment to check for fresh data.
        this.registerDomEvent(this.containerEl, "mouseenter", () =>
            this.plugin.cache.revalidateRemoteCalendars()
        );
    }

    private renderApp() {
        return createElement(CalendarApp, {
            cache: this.plugin.cache,
            settings: this.plugin.settings,
            plugin: this.plugin,

            onOpenFile: (id: string) =>
                openFileForEvent(this.plugin.cache, this.app, id),

            onDeleteEvent: (id: string) => this.deleteWithUndo([id]),
            onDeleteEvents: (ids: string[]) => this.deleteWithUndo(ids),
            onToggleTask: (id: string) => this.cycleTask(id),

            // Creating, editing, range selection and the context menu are all
            // handled inside React (the event panel and the menu components), so
            // these hooks exist only to satisfy the props.
            onEventClick: () => {},
            onSelectRange: () => {},
            onContextMenu: () => {},
        });
    }

    /**
     * Delete one or more events as a SINGLE undoable action, announced by one
     * toast — so deleting a multi-selection undoes in one go rather than event
     * by event.
     */
    private async deleteWithUndo(ids: string[]) {
        const unique = [...new Set(ids)].filter(Boolean);
        if (unique.length === 0) {
            return;
        }

        // Snapshot what's being deleted BEFORE deleting it: afterwards the ids
        // resolve to nothing.
        //
        // Several selected ids can be the same event: every occurrence of a
        // series resolves to its parent. Left as-is, the series was snapshotted
        // once per selected occurrence, and undoing the deletion wrote it back
        // that many times — two occurrences selected gave two identical series
        // on disk.
        const batch: { calendarId: string; event: NeoEvent }[] = [];
        const targets: string[] = [];
        const seen = new Set<string>();
        for (const id of unique) {
            const details = this.plugin.cache.getEventDetails(id);
            if (!details || seen.has(details.id)) {
                continue;
            }
            seen.add(details.id);
            targets.push(id);
            batch.push({
                calendarId: details.calendarId,
                event: details.event,
            });
        }
        this.plugin.pushUndoBatch(batch);

        let deleted = 0;
        for (const id of targets) {
            try {
                await this.plugin.cache.deleteEvent(id);
                deleted++;
            } catch (e) {
                console.error("Delete failed for", id, e);
            }
        }
        if (deleted > 0) {
            this.showUndoNotice(deleted);
        }
    }

    /** "N events deleted. Undo" — the link restores the whole batch. */
    private showUndoNotice(deleted: number) {
        const notice = new Notice("", UNDO_NOTICE_MS);
        const el = (notice as any).noticeEl as HTMLElement;
        el.empty();

        el.createSpan({
            text:
                deleted === 1
                    ? "Event deleted. "
                    : `${deleted} events deleted. `,
        });

        const undo = el.createEl("a", { text: "Undo", cls: "nc-undo-link" });
        undo.addEventListener("click", async () => {
            if (await this.plugin.popUndo()) {
                new Notice(
                    deleted === 1 ? "Event restored." : "Events restored."
                );
            }
            notice.hide();
        });
    }

    /** Tick a task event through its next status. */
    private async cycleTask(id: string): Promise<boolean> {
        const event = this.plugin.cache.getEventById(id);
        // Ask the task module rather than re-stating its rule here: this copy
        // said "single only", so an unscheduled event drew a checkbox that
        // silently refused to tick.
        if (!event || !isTask(event)) {
            return false;
        }
        try {
            await this.plugin.cache.updateEventWithId(
                id,
                cycleTaskStatus(event)
            );
            return true;
        } catch (e) {
            if (e instanceof NeoCalendarError) {
                new Notice(e.message);
            }
            return false;
        }
    }

    onResize(): void {
        // Nothing to do: the React layout is driven by CSS.
    }

    async onunload() {
        if (this.reactRoot) {
            // React 17: unmount by hand or the tree leaks.
            ReactDOM.unmountComponentAtNode(this.reactRoot);
            this.reactRoot = null;
        }
    }

    async onClose() {
        // The content container is reused when this leaf switches to another
        // view type, so take our class back off it — otherwise whatever mounts
        // next inherits the calendar's padding and overflow.
        (this.containerEl.children[1] as HTMLElement)?.removeClass(
            "nc-view-content"
        );
    }
}
