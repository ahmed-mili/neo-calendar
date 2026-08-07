import { Notice } from "obsidian";
import * as React from "react";
import { useState } from "react";

import { CalendarInfo } from "../../types";
import { HolidayRule } from "../../calendars/auto/rules";
import { serializeSharedCalendar } from "../../calendars/auto/presets";
import { ObsidianIcon } from "./ObsidianIcon";
import { normalizeColor } from "../../utils/color";
import { t } from "../i18n";

/**
 * The list of configured calendars in the settings tab: recolour one, rename it,
 * or remove it.
 */

///
// Icons (Lucide, inlined)
///

const iconProps = {
    viewBox: "0 0 24 24",
    width: 15,
    height: 15,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};

const PencilIcon = () => (
    <svg {...iconProps}>
        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="m15 5 4 4" />
    </svg>
);

const XIcon = () => (
    <svg {...iconProps}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);

const CheckIcon = () => (
    <svg {...iconProps}>
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

const FileTextIcon = () => (
    <svg {...iconProps}>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v5h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
    </svg>
);

const CalendarDayIcon = () => (
    <svg {...iconProps}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
    </svg>
);

const WifiIcon = () => (
    <svg {...iconProps}>
        <path d="M12 20h.01" />
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.859a10 10 0 0 1 14 0" />
        <path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </svg>
);

const ServerIcon = () => (
    <svg {...iconProps}>
        <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
        <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
        <path d="M6 6h.01" />
        <path d="M6 18h.01" />
    </svg>
);

const CloudIcon = () => (
    <svg {...iconProps}>
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
);

/** How each kind of source shows itself in the list. */
const kindOf = (type?: string): { icon: React.ReactNode; label: string } => {
    switch (type) {
        case "dailynote":
            return { icon: <CalendarDayIcon />, label: t("Daily note") };
        case "ical":
            return { icon: <WifiIcon />, label: "Online calendar (.ics)" };
        case "caldav":
            return { icon: <ServerIcon />, label: "CalDAV" };
        case "icloud":
            return { icon: <CloudIcon />, label: "iCloud" };
        case "auto":
            return { icon: <CalendarDayIcon />, label: t("Auto calendar") };
        case "local":
        default:
            return { icon: <FileTextIcon />, label: t("Full note") };
    }
};

/** A calendar has no name of its own — it's named for whatever backs it. */
const nameOf = (source: Partial<CalendarInfo>): string => {
    const fields = source as Record<string, any>;

    if (source.type === "local") {
        const directory: string = fields.directory || "";
        return directory.slice(directory.lastIndexOf("/") + 1);
    }
    if (source.type === "dailynote") {
        return fields.heading ? `Daily note · ${fields.heading}` : "Daily Note";
    }
    if (source.type === "auto") {
        return fields.name || "Auto calendar";
    }
    return fields.name || fields.url || source.type || "";
};

/** How long a delete stays armed before it disarms itself again, in ms. */
const CONFIRM_DELETE_MS = 3000;

///
// One row
///

interface RowProps {
    setting: Partial<CalendarInfo>;
    onColorChange: (color: string) => void;
    deleteCalendar: () => void;
    /** Only a full-note calendar can be renamed — it's a folder on disk. */
    onRename?: (name: string) => Promise<void>;
}

export const CalendarSettingRow = ({
    setting,
    onColorChange,
    deleteCalendar,
    onRename,
}: RowProps) => {
    const name = nameOf(setting);
    const kind = kindOf(setting.type);
    const renameable = setting.type === "local" && !!onRename;
    // An auto calendar is just rules: it can be handed to someone else as JSON.
    const shareable = setting.type === "auto";

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const [renaming, setRenaming] = useState(false);
    const [armed, setArmed] = useState(false);
    const [copied, setCopied] = useState(false);

    const startEditing = () => {
        setDraft(name);
        setEditing(true);
    };

    const cancel = () => {
        setDraft(name);
        setEditing(false);
    };

    const commit = async () => {
        const next = draft.trim();
        if (onRename && next && next !== name && !renaming) {
            setRenaming(true);
            try {
                await onRename(next);
            } finally {
                setRenaming(false);
            }
        }
        setEditing(false);
    };

    // Deleting a calendar drops it from the settings, so ask twice.
    const requestDelete = () => {
        if (armed) {
            deleteCalendar();
            return;
        }
        setArmed(true);
        setTimeout(() => setArmed(false), CONFIRM_DELETE_MS);
    };

    return (
        <div className="neo-cal-row">
            <label className="neo-cal-row-color" title={t("Change color")}>
                <span
                    className="neo-cal-row-color-pill"
                    style={{ backgroundColor: setting.color }}
                />
                <input
                    type="color"
                    className="neo-cal-row-color-input"
                    // `<input type="color">` n'accepte QUE `#rrggbb` : sur une
                    // couleur heritee au format `rgb(...)` il retomberait
                    // silencieusement sur du noir, en desaccord avec la
                    // pastille juste a cote.
                    value={normalizeColor(setting.color)}
                    onChange={(e) => onColorChange(e.target.value)}
                />
            </label>

            <span className="neo-cal-row-type" title={kind.label}>
                {kind.icon}
            </span>

            {editing ? (
                <input
                    type="text"
                    className="neo-cal-row-edit"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                        if (e.key === "Escape") cancel();
                    }}
                    disabled={renaming}
                    autoFocus
                />
            ) : (
                <span
                    className="neo-cal-row-name"
                    onClick={renameable ? startEditing : undefined}
                    title={renameable ? "Click to rename" : name}
                >
                    {name}
                </span>
            )}

            <div className="neo-cal-row-actions">
                {editing ? (
                    <>
                        <button
                            type="button"
                            className="neo-cal-row-btn"
                            onClick={commit}
                            disabled={renaming}
                            title={t("Save")}
                        >
                            <CheckIcon />
                        </button>
                        <button
                            type="button"
                            className="neo-cal-row-btn"
                            onClick={cancel}
                            disabled={renaming}
                            title={t("Cancel")}
                        >
                            <XIcon />
                        </button>
                    </>
                ) : (
                    <>
                        {shareable && (
                            <button
                                type="button"
                                className="neo-cal-row-btn"
                                title={
                                    copied
                                        ? "Copied"
                                        : "Copy as JSON, to share this calendar"
                                }
                                onClick={async () => {
                                    await navigator.clipboard.writeText(
                                        serializeSharedCalendar({
                                            name,
                                            icon: (setting as { icon?: string })
                                                .icon,
                                            rules:
                                                (
                                                    setting as {
                                                        rules?: HolidayRule[];
                                                    }
                                                ).rules ?? [],
                                        })
                                    );
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                            >
                                {copied ? (
                                    <CheckIcon />
                                ) : (
                                    <ObsidianIcon name="copy" size={15} />
                                )}
                            </button>
                        )}
                        {renameable && (
                            <button
                                type="button"
                                className="neo-cal-row-btn"
                                onClick={startEditing}
                                title={t("Rename")}
                            >
                                <PencilIcon />
                            </button>
                        )}
                    </>
                )}
                <button
                    type="button"
                    className={`neo-cal-row-btn neo-cal-row-delete${
                        armed ? " is-confirm" : ""
                    }`}
                    onClick={requestDelete}
                    title={armed ? "Click again to confirm" : "Delete"}
                >
                    <XIcon />
                </button>
            </div>
        </div>
    );
};

///
// The list
///

interface CalendarSettingProps {
    sources: CalendarInfo[];
    submit: (sources: CalendarInfo[]) => void;
    onRenameCalendar?: (index: number, name: string) => Promise<void>;
}

type CalendarSettingState = {
    sources: CalendarInfo[];
    /** A source was added but not saved yet — the settings tab owns the button. */
    dirty: boolean;
};

export class CalendarSettings extends React.Component<
    CalendarSettingProps,
    CalendarSettingState
> {
    constructor(props: CalendarSettingProps) {
        super(props);
        this.state = { sources: props.sources, dirty: false };
    }

    /** Called from the settings tab when the "add calendar" modal submits. */
    addSource(source: CalendarInfo) {
        this.setState((state) => ({
            sources: [...state.sources, source],
            dirty: true,
        }));
    }

    /** Colour and delete apply straight away; only an add waits for Save. */
    private replace(sources: CalendarInfo[]) {
        this.setState({ sources, dirty: false });
        this.props.submit(sources);
    }

    private save = () => {
        // Every daily note event lives under one heading, so a second daily-note
        // calendar would just shadow the first.
        const dailyNotes = this.state.sources.filter(
            (source) => source.type === "dailynote"
        );
        if (dailyNotes.length > 1) {
            new Notice("Only one daily note calendar is allowed.");
            return;
        }
        this.props.submit(this.state.sources);
        this.setState({ dirty: false });
    };

    render() {
        const { sources, dirty } = this.state;

        return (
            <div style={{ width: "100%" }}>
                {sources.map((source, index) => (
                    <CalendarSettingRow
                        key={index}
                        setting={source}
                        onColorChange={(color) =>
                            this.replace(
                                sources.map((s, i) =>
                                    i === index ? { ...s, color } : s
                                )
                            )
                        }
                        deleteCalendar={() =>
                            this.replace(sources.filter((_, i) => i !== index))
                        }
                        onRename={
                            this.props.onRenameCalendar &&
                            ((name: string) =>
                                this.props.onRenameCalendar!(index, name))
                        }
                    />
                ))}

                {dirty && (
                    <div className="setting-item-control">
                        <button className="mod-cta" onClick={this.save}>
                            Save
                        </button>
                    </div>
                )}
            </div>
        );
    }
}
