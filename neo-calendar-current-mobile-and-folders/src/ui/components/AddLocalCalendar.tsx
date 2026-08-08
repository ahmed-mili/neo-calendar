import * as React from "react";
import { useMemo, useState } from "react";
import { TFolder } from "obsidian";
import { CalendarInfo } from "../../types";
import { FolderIcon, PlusIcon, CheckIcon } from "../calendar/Icons";

/**
 * The "add calendar" picker behind the sidebar "+". A local calendar is just a
 * vault folder, so this simply lists the available folders (pick one) plus an
 * explicit "New calendar" action that reveals a name field. No search box: the
 * folders are few and always shown, so searching them adds nothing. Colour is
 * NOT chosen here; a new calendar starts on the theme accent and is recoloured
 * afterwards from its row in the sidebar.
 */

interface AddLocalCalendarProps {
    /** Vault folders that can still back a calendar (none already in use). */
    directories: string[];
    /** When set, subfolders of it ARE the calendars and a new one can be made. */
    calendarRootFolder?: string;
    /** Colour every new calendar starts on (theme accent). */
    defaultColor: string;
    /** Creates a folder at `path` (or returns the existing one), null on error. */
    createFolder: (path: string) => Promise<TFolder | null>;
    /** Commits the finished source (pushes it, saves, closes the modal). */
    onCreate: (source: CalendarInfo) => Promise<void>;
}

export const AddLocalCalendar = ({
    directories,
    calendarRootFolder,
    defaultColor,
    createFolder,
    onCreate,
}: AddLocalCalendarProps) => {
    // With a root folder, calendars are named by their short subfolder name;
    // without one, any vault folder works and only the full path is meaningful.
    const labelOf = (dir: string) =>
        calendarRootFolder ? dir.slice(dir.lastIndexOf("/") + 1) : dir;

    const options = useMemo(
        () =>
            // Dedupe defensively: the caller can hand the same path twice, which
            // would otherwise render duplicate rows (and clash on React keys).
            [...new Set(directories)]
                .map((dir) => ({ dir, label: labelOf(dir) }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        // labelOf depends only on calendarRootFolder.
        [directories, calendarRootFolder]
    );

    // An empty vault (no candidate folders) jumps straight to naming a new one.
    const [creating, setCreating] = useState(
        () => options.length === 0 && !!calendarRootFolder
    );
    const [newName, setNewName] = useState("");
    const [busy, setBusy] = useState(false);

    const commit = async (directory: string) => {
        await onCreate({
            type: "local",
            color: defaultColor,
            directory,
        } as CalendarInfo);
    };

    const pickExisting = async (dir: string) => {
        if (busy) return;
        setBusy(true);
        await commit(dir);
    };

    const createNew = async () => {
        const name = newName.trim();
        if (busy || !calendarRootFolder || !name) return;
        setBusy(true);
        const directory = `${calendarRootFolder}/${name}`;
        const folder = await createFolder(directory);
        if (folder) {
            await commit(directory);
        } else {
            setBusy(false);
        }
    };

    return (
        <div className="nc-add-cal">
            <span className="nc-add-cal-chip">Calendar</span>

            <div className="nc-add-cal-list">
                {options.map((o) => (
                    <button
                        key={o.dir}
                        type="button"
                        className="nc-add-cal-row"
                        onClick={() => pickExisting(o.dir)}
                        disabled={busy}
                        title={o.dir}
                    >
                        <span className="nc-add-cal-icon">
                            <FolderIcon size={16} />
                        </span>
                        <span className="nc-add-cal-label">{o.label}</span>
                    </button>
                ))}

                {options.length === 0 && !calendarRootFolder && (
                    <div className="nc-add-cal-empty">
                        No available folders in the vault.
                    </div>
                )}

                {calendarRootFolder && (
                    <>
                        {options.length > 0 && (
                            <div className="nc-add-cal-sep" />
                        )}
                        {!creating ? (
                            <button
                                type="button"
                                className="nc-add-cal-row nc-add-cal-create"
                                onClick={() => setCreating(true)}
                                disabled={busy}
                            >
                                <span className="nc-add-cal-icon">
                                    <PlusIcon size={16} />
                                </span>
                                <span className="nc-add-cal-label">
                                    New calendar
                                </span>
                            </button>
                        ) : (
                            <div className="nc-add-cal-newrow">
                                <span className="nc-add-cal-icon">
                                    <PlusIcon size={16} />
                                </span>
                                <input
                                    type="text"
                                    autoFocus
                                    disabled={busy}
                                    placeholder="Calendar name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            createNew();
                                        } else if (e.key === "Escape") {
                                            setCreating(false);
                                            setNewName("");
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className="nc-add-cal-confirm"
                                    onClick={createNew}
                                    disabled={busy || !newName.trim()}
                                    title="Create calendar"
                                >
                                    <CheckIcon size={16} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
