import * as React from "react";
import { useEffect, useState } from "react";
import { App, TFolder } from "obsidian";
import { CalendarInfo } from "../../types";
import { SuggestSelect } from "./SuggestSelect";
import { AUTO_CALENDAR_ICONS, ObsidianIcon } from "./ObsidianIcon";
import {
    CustomPreset,
    PresetCatalogue,
    loadCustomPresets,
    loadPresetCatalogue,
    parseSharedCalendar,
    presetOptions,
} from "../../calendars/auto/presets";

/**
 * The form behind "add calendar". Which fields it shows depends on the kind of
 * source being added, so the whole thing is assembled from small pieces rather
 * than branching inside one big component.
 */

/** A source under construction — nothing is required until it's submitted. */
type Draft = Partial<CalendarInfo> & Record<string, any>;
type Update = (patch: Partial<CalendarInfo>) => void;

/** Sentinel option: the user wants a folder that doesn't exist yet. */
const CREATE_NEW = "__new__";

///
// Layout
///

function SettingRow({
    name,
    description,
    controlStyle,
    children,
}: {
    name: string;
    description?: string;
    controlStyle?: React.CSSProperties;
    children: React.ReactNode;
}) {
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">{name}</div>
                {description && (
                    <div className="setting-item-description">
                        {description}
                    </div>
                )}
            </div>
            <div className="setting-item-control" style={controlStyle}>
                {children}
            </div>
        </div>
    );
}

///
// Fields
///

interface FieldProps {
    source: Draft;
    update: Update;
}

/** A plain text field bound to one key of the draft. */
function TextField({
    source,
    update,
    field,
    name,
    description,
    type = "text",
}: FieldProps & {
    field: "url" | "username" | "password";
    name: string;
    description: string;
    type?: "text" | "password";
}) {
    return (
        <SettingRow name={name} description={description}>
            <input
                required
                type={type}
                value={source[field] || ""}
                onChange={(e) =>
                    update({ [field]: e.target.value } as Partial<CalendarInfo>)
                }
            />
        </SettingRow>
    );
}

function ColorPicker({ source, update }: FieldProps) {
    return (
        <SettingRow
            name="Color"
            description="The color of events on the calendar"
        >
            <input
                required
                type="color"
                value={source.color || ""}
                style={{ maxWidth: "25%", minWidth: "3rem" }}
                onChange={(e) => update({ color: e.target.value })}
            />
        </SettingRow>
    );
}

/** Which heading of the daily note the events go under. */
function HeadingField({
    source,
    update,
    headings,
    app,
}: FieldProps & { headings: string[]; app: App }) {
    const value = source.heading || "";
    const onChange = (heading: string) =>
        update({ heading } as Partial<CalendarInfo>);

    return (
        <SettingRow
            name="Heading"
            description="Heading to store events under in the daily note."
        >
            {headings.length > 0 ? (
                <SuggestSelect
                    app={app}
                    value={value}
                    options={headings.map((h) => ({ value: h, label: h }))}
                    onChange={onChange}
                    placeholder="Choose a heading"
                    required
                />
            ) : (
                // No daily-note template to read headings from: let them type one.
                <input
                    required
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
        </SettingRow>
    );
}

/**
 * Which folder backs a full-note calendar.
 *
 * With a root folder configured, its subfolders ARE the calendars, so they're
 * offered by their short name and a new one can be created inline. Without a
 * root, any folder in the vault will do and only the full paths make sense.
 */
function DirectoryField({
    source,
    update,
    directories,
    calendarRootFolder,
    newName,
    setNewName,
    app,
}: FieldProps & {
    directories: string[];
    calendarRootFolder?: string;
    newName: string;
    setNewName: (name: string) => void;
    app: App;
}) {
    const setDirectory = (directory: string) =>
        update({ directory } as Partial<CalendarInfo>);

    if (!calendarRootFolder) {
        return (
            <SettingRow
                name="Directory"
                description="Directory to store events"
            >
                <SuggestSelect
                    app={app}
                    value={source.directory || ""}
                    options={[...directories]
                        .sort()
                        .map((dir) => ({ value: dir, label: dir }))}
                    onChange={setDirectory}
                    placeholder="Choose a directory"
                    required
                />
            </SettingRow>
        );
    }

    const options = directories
        .map((dir) => ({
            value: dir,
            label: dir.slice(dir.lastIndexOf("/") + 1),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    return (
        <SettingRow
            name="Calendar"
            description="Choose an existing subfolder or create a new one"
            controlStyle={{ flexWrap: "wrap" }}
        >
            <SuggestSelect
                app={app}
                value={newName ? CREATE_NEW : source.directory || ""}
                options={[
                    ...options,
                    { value: CREATE_NEW, label: "+ Create new..." },
                ]}
                onChange={(value) => {
                    if (value === CREATE_NEW) {
                        // A single space marks "creating" while still being empty
                        // once trimmed, so the name field shows but stays unfilled.
                        setNewName(" ");
                        setDirectory("");
                    } else {
                        setNewName("");
                        setDirectory(value);
                    }
                }}
                placeholder="Choose a calendar"
                required={!newName}
            />
            {newName !== "" && (
                <input
                    required
                    type="text"
                    placeholder="New calendar name"
                    value={newName.trim()}
                    onChange={(e) => setNewName(e.target.value || " ")}
                    autoFocus
                />
            )}
        </SettingRow>
    );
}

/**
 * Country picker for an auto calendar, plus the icon it will wear. Picking a
 * country copies that preset's rules into the draft, so the calendar is
 * self-contained from the moment it's added.
 */
function AutoCalendarFields({
    source,
    update,
    app,
    pluginDir,
    existingCalendars,
}: FieldProps & {
    app: App;
    pluginDir: string;
    existingCalendars: { id: string; name: string }[];
}) {
    const [catalogue, setCatalogue] = useState<PresetCatalogue | null>(null);
    const [customs, setCustoms] = useState<Record<string, CustomPreset>>({});
    const [error, setError] = useState<string | null>(null);
    const [shared, setShared] = useState("");
    const [sharedError, setSharedError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadPresetCatalogue(app, pluginDir)
            .then((loaded) => !cancelled && setCatalogue(loaded))
            .catch(() =>
                setError(
                    "Holiday presets could not be read. Reinstall or rebuild the plugin."
                )
            );
        loadCustomPresets(app, pluginDir)
            .then((loaded) => !cancelled && setCustoms(loaded))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [app, pluginDir]);

    const icon = source.icon || "flag";
    const kind: "holidays" | "custom" = source.kind || "holidays";

    return (
        <>
            <SettingRow
                name="Kind"
                description="A country's public holidays, or a custom rule set"
            >
                <div className="neo-kind-toggle">
                    {(["holidays", "custom"] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            className={`neo-kind-choice${
                                option === kind ? " neo-kind-choice-active" : ""
                            }`}
                            aria-pressed={option === kind}
                            onClick={() =>
                                update({
                                    kind: option,
                                    id: "",
                                    name: "",
                                    rules: [],
                                } as Partial<CalendarInfo>)
                            }
                        >
                            {option === "holidays"
                                ? "Public holidays"
                                : "Custom"}
                        </button>
                    ))}
                </div>
            </SettingRow>

            {kind === "custom" && (
                <>
                    <SettingRow
                        name="Calendar"
                        description="Rule sets shipped with the plugin"
                    >
                        <SuggestSelect
                            app={app}
                            value={source.id || ""}
                            options={Object.entries(customs).map(
                                ([key, preset]) => ({
                                    value: key,
                                    label: preset.name,
                                })
                            )}
                            onChange={(key) => {
                                const preset = customs[key];
                                if (!preset) return;
                                update({
                                    id: key,
                                    name: preset.name,
                                    icon: preset.icon,
                                    rules: preset.rules,
                                } as Partial<CalendarInfo>);
                            }}
                            placeholder="Choose a calendar"
                            required
                        />
                    </SettingRow>

                    <SettingRow
                        name="Import"
                        description="Paste a calendar someone shared with you"
                        controlStyle={{ flexWrap: "wrap" }}
                    >
                        <textarea
                            rows={2}
                            placeholder='{"name": "…", "rules": [ … ]}'
                            value={shared}
                            onChange={(e) => {
                                setShared(e.target.value);
                                setSharedError(null);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                const result = parseSharedCalendar(shared);
                                if (!result.ok) {
                                    setSharedError(result.error);
                                    return;
                                }
                                setSharedError(null);
                                update({
                                    // Minted from the name: a shared calendar
                                    // carries no id of its own, and two imports
                                    // of different calendars must not collide.
                                    id: `shared-${result.value.name
                                        .replace(/\s+/g, "-")
                                        .slice(0, 32)}`,
                                    name: result.value.name,
                                    icon: result.value.icon || "star",
                                    rules: result.value.rules,
                                } as Partial<CalendarInfo>);
                            }}
                        >
                            Load
                        </button>
                        {sharedError && (
                            <span className="setting-item-description neo-import-error">
                                {sharedError}
                            </span>
                        )}
                    </SettingRow>

                    <SettingRow
                        name="File into"
                        description="Optional: show these events inside a calendar you already have, instead of on their own row"
                    >
                        <SuggestSelect
                            app={app}
                            value={source.target || ""}
                            options={[
                                { value: "", label: "Its own calendar" },
                                ...existingCalendars.map((cal) => ({
                                    value: cal.id,
                                    label: cal.name,
                                })),
                            ]}
                            onChange={(target) =>
                                update({
                                    target: target || undefined,
                                } as Partial<CalendarInfo>)
                            }
                            placeholder="Its own calendar"
                        />
                    </SettingRow>
                </>
            )}

            {kind === "holidays" && (
                <SettingRow
                    name="Country"
                    description="Public holidays and observances, computed offline"
                >
                    {error ? (
                        <span className="setting-item-description">
                            {error}
                        </span>
                    ) : catalogue ? (
                        <SuggestSelect
                            app={app}
                            value={source.id || ""}
                            options={presetOptions(catalogue).map(
                                ({ code, name }) => ({
                                    value: code,
                                    label: name,
                                })
                            )}
                            onChange={(code) => {
                                const preset = catalogue[code];
                                if (!preset) return;
                                update({
                                    id: code,
                                    name: preset.name,
                                    icon: source.icon || preset.icon,
                                    rules: preset.rules,
                                } as Partial<CalendarInfo>);
                            }}
                            placeholder="Choose a country"
                            required
                        />
                    ) : (
                        <span className="setting-item-description">
                            Loading…
                        </span>
                    )}
                </SettingRow>
            )}

            <SettingRow name="Icon" description="Shown next to the calendar">
                <div className="neo-icon-palette">
                    {AUTO_CALENDAR_ICONS.map((name) => (
                        <button
                            key={name}
                            type="button"
                            className={`neo-icon-choice${
                                name === icon ? " neo-icon-choice-active" : ""
                            }`}
                            aria-label={name}
                            aria-pressed={name === icon}
                            onClick={() =>
                                update({ icon: name } as Partial<CalendarInfo>)
                            }
                        >
                            <ObsidianIcon name={name} size={16} />
                        </button>
                    ))}
                </div>
            </SettingRow>
        </>
    );
}

///
// The form
///

interface AddCalendarProps {
    app: App;
    source: Partial<CalendarInfo>;
    directories: string[];
    headings: string[];
    submit: (source: CalendarInfo) => Promise<void>;
    calendarRootFolder?: string;
    createFolder?: (path: string) => Promise<TFolder | null>;
    /** Where the plugin's data files live, for reading the holiday presets. */
    pluginDir?: string;
    /** Calendars already configured, offered as a home for an auto calendar. */
    existingCalendars?: { id: string; name: string }[];
}

export const AddCalendarSource = ({
    app,
    source,
    directories,
    headings,
    submit,
    calendarRootFolder,
    createFolder,
    pluginDir,
    existingCalendars,
}: AddCalendarProps) => {
    // A CalDAV server hands back several calendars at once, each with its own
    // colour — so there's nothing to pick here, and it "imports" rather than adds.
    const isCalDAV = source.type === "caldav";

    const [draft, setDraft] = useState<Draft>(source as Draft);
    const [newName, setNewName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const update: Update = (patch) =>
        setDraft((previous) => ({ ...previous, ...patch }));

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (submitting) {
            return;
        }
        setSubmitting(true);

        let finished = draft;

        // The user asked for a folder that doesn't exist yet: make it first, and
        // only point the calendar at it if that worked.
        const wanted = newName.trim();
        if (
            draft.type === "local" &&
            !draft.directory &&
            wanted &&
            calendarRootFolder &&
            createFolder
        ) {
            const directory = `${calendarRootFolder}/${wanted}`;
            if (await createFolder(directory)) {
                finished = { ...draft, directory };
                setDraft(finished);
            }
        }

        await submit(finished as CalendarInfo);
    };

    const submitLabel = isCalDAV
        ? submitting
            ? "Importing Calendars"
            : "Import Calendars"
        : submitting
        ? "Adding Calendar"
        : "Add Calendar";

    return (
        <div className="vertical-tab-content">
            <form onSubmit={onSubmit}>
                {!isCalDAV && <ColorPicker source={draft} update={update} />}

                {source.type === "local" && (
                    <DirectoryField
                        source={draft}
                        update={update}
                        directories={directories}
                        calendarRootFolder={calendarRootFolder}
                        newName={newName}
                        setNewName={setNewName}
                        app={app}
                    />
                )}

                {source.type === "auto" && (
                    <AutoCalendarFields
                        source={draft}
                        update={update}
                        app={app}
                        pluginDir={pluginDir ?? ""}
                        existingCalendars={existingCalendars ?? []}
                    />
                )}

                {source.type === "dailynote" && (
                    <HeadingField
                        source={draft}
                        update={update}
                        headings={headings}
                        app={app}
                    />
                )}

                {(source.type === "ical" || isCalDAV) && (
                    <TextField
                        source={draft}
                        update={update}
                        field="url"
                        name="Url"
                        description="Url of the server"
                    />
                )}

                {isCalDAV && (
                    <>
                        <TextField
                            source={draft}
                            update={update}
                            field="username"
                            name="Username"
                            description="Username for the account"
                        />
                        <TextField
                            source={draft}
                            update={update}
                            field="password"
                            type="password"
                            name="Password"
                            description="Password for the account"
                        />
                    </>
                )}

                <div className="setting-item">
                    <div className="setting-item-info" />
                    <div className="setting-control">
                        <button
                            className="mod-cta"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitLabel}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};
