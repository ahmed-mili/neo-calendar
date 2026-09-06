import * as React from "react";
import { CalendarSource, DisplayEvent, ViewType } from "../types";
import MiniCalendar from "./MiniCalendar";
// L'horloge du panneau d'evenement plutot qu'une nouvelle : c'est la meme
// chose qu'elle dit, une heure de la journee.
import { ClockIcon } from "./EventPanelIcons";
import DesktopTasksPanel from "./DesktopTasksPanel";
import TasksPanel from "./TasksPanel";
import { TaskItem } from "../tasks/taskList";
import {
    PanelLeftIcon,
    SearchIcon,
    SettingsIcon,
    PlusIcon,
    RssIcon,
    EyeIcon,
    EyeOffIcon,
    MoreHorizontalIcon,
    PencilIcon,
    ListXIcon,
    ChevronDownIcon,
    FolderIcon,
    LinkIcon,
    CircleHelpIcon,
} from "./Icons";
import CalendarItemMenu, { CalendarMenuItem } from "./CalendarItemMenu";
import ColorPicker from "./ColorPicker";
import ShortcutsPanel from "./ShortcutsPanel";
import { ObsidianIcon } from "../components/ObsidianIcon";
import { useSidebarReorder } from "./useSidebarReorder";
import { isAndroidRuntime } from "./CalendarUtils";
import { installPendingUpdate, appVersion } from "./appUpdates";
import { useUpdateAvailable } from "./useUpdateAvailable";
import { UpdateBadge } from "./UpdateBadge";
import { t } from "../i18n";

const ONLINE_TYPES = ["ical", "caldav", "icloud"];

interface CalendarSidebarProps {
    sidebarVisible: boolean;
    currentDate: Date;
    viewType: ViewType;
    onViewTypeChange: (view: ViewType) => void;
    dayCount: number;
    onSetDayCount: (count: number) => void;
    calendarSources: CalendarSource[];
    firstDay: number;
    showWeekNumbers?: boolean;
    onDateSelect: (date: Date) => void;
    hiddenCalendars: Set<string>;
    onToggleCalendar: (calendarId: string) => void;
    defaultCalendarId: string;
    soloCalendarId: string | null;
    onSetDefaultCalendar: (calendarId: string) => void;
    onShowOnly: (calendarId: string) => void;
    tasks: TaskItem[];
    today: string;
    onEventClick: (eventId: string) => void;
    onAddTask: () => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    onAddCalendar: () => void;
    onRenameCalendar: (calendarId: string, newName: string) => Promise<void>;
    onEditCalendarLink: (calendarId: string) => void;
    /** Omitted on surfaces without an ICS preferences store (the Obsidian
     *  plugin path) — the sidebar simply leaves the menu item out rather than
     *  showing something that would do nothing when pressed. */
    onManageIcsFeeds?: (calendarId: string) => void;
    /** Ouvre le choix de la mosquee dont ce calendrier suit les horaires. */
    onManagePrayerTimes?: (calendarId: string) => void;
    onDeleteCalendar: (calendarId: string) => void;
    onColorChange: (calendarId: string, color: string) => void;
    onReorderCalendars: (orderedIds: string[]) => void;
    onOpenCalendarFolder: (calendarId: string) => void;
    onOpenRootFolder: () => void;
    onCalendarClick: (calendarId: string) => void;
    selectedCalendarId: string | null;
    onToggleSidebar: () => void;
    onOpenSearch: () => void;
    onOpenSettings: () => void;
}

export default function CalendarSidebar(props: CalendarSidebarProps) {
    const {
        sidebarVisible,
        currentDate,
        viewType,
        onViewTypeChange,
        dayCount,
        onSetDayCount,
        calendarSources,
        firstDay,
        showWeekNumbers,
        onDateSelect,
        hiddenCalendars,
        onToggleCalendar,
        defaultCalendarId,
        soloCalendarId,
        onSetDefaultCalendar,
        onShowOnly,
        tasks,
        today,
        onEventClick,
        onAddTask,
        onToggleTask,
        onAddCalendar,
        onRenameCalendar,
        onEditCalendarLink,
        onManageIcsFeeds,
        onManagePrayerTimes,
        onDeleteCalendar,
        onColorChange,
        onReorderCalendars,
        onOpenCalendarFolder,
        onOpenRootFolder,
        onCalendarClick,
        selectedCalendarId,
        onToggleSidebar,
        onOpenSearch,
        onOpenSettings,
    } = props;

    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState("");
    const [renaming, setRenaming] = React.useState(false);
    const [menuId, setMenuId] = React.useState<string | null>(null);
    const [menuAnchor, setMenuAnchor] = React.useState<DOMRect | null>(null);
    // Anchor for the section-header "..." menu (Open root folder).
    const [headerMenuAnchor, setHeaderMenuAnchor] =
        React.useState<DOMRect | null>(null);
    /* Le numéro, à gauche de l'engrenage. Un libellé, et rien de plus.
       C'était un bouton : on le pressait pour demander une recherche, et il
       répondait « À jour », « Hors ligne », « Échec ». Il ne reste rien à lui
       demander — les deux coques cherchent au lancement, au retour sur
       l'application et à intervalle — et un contrôle dont la seule réponse
       possible est « rien n'a changé » se lit à chaque fois pour apprendre
       qu'il ne s'est rien passé. */
    const version = appVersion();
    // Collapse toggle for the calendar list (chevron next to the "Calendars"
    // header), mirroring Notion's collapsible section.
    const [calendarsCollapsed, setCalendarsCollapsed] = React.useState(false);
    // Same collapse affordance for the task list below it.
    const [tasksCollapsed, setTasksCollapsed] = React.useState(false);
    // Custom themed colour picker (replaces the OS-native <input type=color">):
    // which calendar it's editing + where to anchor it (the clicked swatch).
    const [colorPicker, setColorPicker] = React.useState<{
        id: string;
        color: string;
        rect: DOMRect;
    } | null>(null);
    const [shortcutsAnchor, setShortcutsAnchor] =
        React.useState<DOMRect | null>(null);
    const [moreDaysOpen, setMoreDaysOpen] = React.useState(false);
    const [customDayCount, setCustomDayCount] = React.useState(10);
    const isAndroid = isAndroidRuntime();

    const setAndroidDaySpan = (count: number) => {
        const normalized = Math.max(1, Math.min(60, Math.round(count)));
        onViewTypeChange("days");
        onSetDayCount(normalized);
        onToggleSidebar();
    };
    // Swatch button per calendar id, so the picker can anchor to it whether it
    // was opened by double-click or from the "Color" menu item.
    const swatchRefs = React.useRef<Record<string, HTMLButtonElement | null>>(
        {}
    );
    const openColorPicker = (id: string, color: string) => {
        const rect = swatchRefs.current[id]?.getBoundingClientRect();
        if (rect) setColorPicker({ id, color, rect });
    };

    // Drag-to-reorder the calendar list. On drop we translate the moved index
    // into the new full order of ids and hand it up to persist.
    const reorder = useSidebarReorder(calendarSources.length, (from, to) => {
        const ids = calendarSources.map((s) => s.id);
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        onReorderCalendars(ids);
    });

    const startRename = (source: CalendarSource) => {
        setEditingId(source.id);
        setEditName(source.name);
    };

    const commitRename = async () => {
        if (!editingId || !editName.trim()) {
            setEditingId(null);
            return;
        }
        const source = calendarSources.find((s) => s.id === editingId);
        if (source && editName.trim() !== source.name) {
            setRenaming(true);
            try {
                await onRenameCalendar(editingId, editName.trim());
            } finally {
                setRenaming(false);
            }
        }
        setEditingId(null);
    };

    const cancelRename = () => {
        setEditingId(null);
        setEditName("");
    };

    const openMenu = (e: React.MouseEvent, sourceId: string) => {
        setMenuAnchor(e.currentTarget.getBoundingClientRect());
        setMenuId(sourceId);
    };

    const buildMenuItems = (source: CalendarSource): CalendarMenuItem[] => {
        const items: CalendarMenuItem[] = [];
        items.push({
            key: "color",
            label: t("Color"),
            swatchColor: source.color,
            onClick: () => openColorPicker(source.id, source.color),
        });
        // Editable (local) calendars rename the folder; ical feeds rename just
        // sets a friendly display label â€” both go through the inline editor.
        if (source.editable || source.type === "ical") {
            items.push({
                key: "rename",
                label: t("Rename"),
                icon: <PencilIcon />,
                onClick: () => startRename(source),
            });
        }
        // Remote ical feeds can have their subscription URL changed in place.
        if (source.type === "ical") {
            items.push({
                key: "edit-link",
                label: t("Edit link"),
                icon: <LinkIcon />,
                onClick: () => onEditCalendarLink(source.id),
            });
        }
        if (source.type === "local") {
            items.push({
                key: "open-folder",
                label: "Open folder",
                icon: <FolderIcon />,
                onClick: () => onOpenCalendarFolder(source.id),
            });
            // Full Note calendars manage their ICS subscriptions here — the
            // legacy `ical` type keeps its own "Edit link" item above until
            // it is retired. Left out entirely where there is nothing to
            // open (no ICS preferences store on this surface) rather than
            // shown as a click that silently does nothing.
            if (onManageIcsFeeds) {
                items.push({
                    key: "ics-feeds",
                    label: t("ICS links"),
                    icon: <LinkIcon />,
                    onClick: () => onManageIcsFeeds(source.id),
                });
            }
            // Les horaires de priere d'une mosquee, montres par un trait dans
            // la grille plutot que par des evenements. Absent la ou rien ne
            // peut les enregistrer, comme l'entree au-dessus.
            if (onManagePrayerTimes) {
                items.push({
                    key: "prayer-times",
                    label: t("Prayer times"),
                    icon: <ClockIcon />,
                    onClick: () => onManagePrayerTimes(source.id),
                });
            }
        }
        items.push({
            key: "solo",
            label:
                soloCalendarId === source.id
                    ? t("Show previously visible calendars")
                    : t("Show only this calendar"),
            icon: soloCalendarId === source.id ? <EyeIcon /> : <EyeOffIcon />,
            onClick: () => onShowOnly(source.id),
        });
        items.push({
            key: "remove",
            label: t("Remove from list"),
            icon: <ListXIcon />,
            danger: true,
            onClick: () => onDeleteCalendar(source.id),
        });
        return items;
    };

    const menuSource = menuId
        ? calendarSources.find((s) => s.id === menuId)
        : undefined;

    return (
        <div
            className={`nc-sidebar ${
                sidebarVisible ? "" : "nc-sidebar-collapsed"
            }`}
        >
            <div className="nc-sidebar-top-bar">
                {/* Android closes the drawer by dragging it back or tapping
                    the calendar beside it, so the button is dead weight. */}
                {!isAndroid && (
                    <button
                        className="nc-sidebar-top-btn"
                        onClick={onToggleSidebar}
                        data-nc-tooltip={t("Toggle sidebar")}
                        aria-label={t("Toggle sidebar")}
                    >
                        <PanelLeftIcon />
                    </button>
                )}
                <div className="nc-sidebar-top-right">
                    {/* Android keeps search in the app bar and creation on the
                        floating button, so the drawer only carries settings —
                        which the app bar in turn no longer does. */}
                    {!isAndroid && (
                        <button
                            className="nc-sidebar-top-btn nc-sidebar-search-btn"
                            onClick={onOpenSearch}
                            aria-label={t("Open command menu")}
                            data-nc-tooltip={t("Open command menu")}
                        >
                            <SearchIcon />
                        </button>
                    )}
                    {/* Elsewhere the toolbar already carries settings, and an
                        event is made on the grid where it belongs — a second
                        pair of buttons up here was only ever a duplicate. */}
                    {/* Le numéro, juste à gauche de l'engrenage. Ce qu'il y a
                        à dire sur les mises à jour est dit par la pastille
                        bleue, quand il y a quelque chose à dire. */}
                    {version && (
                        <span className="nc-sidebar-version">v{version}</span>
                    )}
                    {/* Ce qui descend et ce qui attend d'être posé : le même
                        contrôle des deux côtés, parce que c'est la même chose
                        qui se passe. Il n'est là que lorsqu'il a quelque chose
                        à dire. */}
                    <UpdateBadge onInstall={() => installPendingUpdate()} />
                    {isAndroid && (
                        <button
                            className="nc-sidebar-top-btn nc-sidebar-settings-btn"
                            onClick={onOpenSettings}
                            data-nc-tooltip={t("Settings")}
                            aria-label={t("Settings")}
                        >
                            <SettingsIcon size={17} />
                        </button>
                    )}
                </div>
            </div>

            {/* ONE scroller for everything under the top bar.
                Each section used to be its own: on Android both carried
                `flex: 1 1 auto; overflow-y: auto`, so the calendars and the
                tasks split the leftover height between them and each got a
                stub of a window — the calendar list ended mid-row, the task
                list ended on a heading, and neither could be scrolled to the
                end without first scrolling the other. The sections are plain
                content again; the height and the scrolling live here. */}
            <div className="nc-sidebar-scroll">
                {sidebarVisible && (
                    <>
                        {isAndroid && (
                            <section
                                className="nc-android-day-switcher"
                                aria-label={t("Days displayed")}
                            >
                                <div className="nc-android-day-switcher-primary">
                                    {[1, 2, 3].map((count) => {
                                        const active =
                                            viewType === "days" &&
                                            dayCount === count;
                                        return (
                                            <button
                                                type="button"
                                                key={count}
                                                className={`nc-android-day-option${
                                                    active ? " nc-active" : ""
                                                }`}
                                                aria-pressed={active}
                                                onClick={() =>
                                                    setAndroidDaySpan(count)
                                                }
                                            >
                                                <span
                                                    className="nc-android-day-option-icon"
                                                    aria-hidden="true"
                                                >
                                                    {Array.from(
                                                        { length: count },
                                                        (_, index) => (
                                                            <i key={index} />
                                                        )
                                                    )}
                                                </span>
                                                <span>
                                                    {count === 1
                                                        ? "1 day"
                                                        : `${count} days`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    type="button"
                                    className="nc-android-more-days-toggle"
                                    aria-expanded={moreDaysOpen}
                                    onClick={() =>
                                        setMoreDaysOpen((value) => !value)
                                    }
                                >
                                    <span>{t("More day spans")}</span>
                                    <ChevronDownIcon size={14} />
                                </button>

                                {moreDaysOpen && (
                                    <div className="nc-android-more-days">
                                        <div className="nc-android-more-days-grid">
                                            {[4, 5, 6, 7, 8, 9].map((count) => (
                                                <button
                                                    type="button"
                                                    key={count}
                                                    className={
                                                        viewType === "days" &&
                                                        dayCount === count
                                                            ? "nc-active"
                                                            : ""
                                                    }
                                                    onClick={() =>
                                                        setAndroidDaySpan(count)
                                                    }
                                                >
                                                    {count}
                                                </button>
                                            ))}
                                        </div>
                                        <form
                                            className="nc-android-custom-days"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                setAndroidDaySpan(
                                                    customDayCount
                                                );
                                            }}
                                        >
                                            <input
                                                type="number"
                                                min={1}
                                                max={60}
                                                value={customDayCount}
                                                aria-label={t(
                                                    "Custom number of days"
                                                )}
                                                onChange={(event) =>
                                                    setCustomDayCount(
                                                        Number(
                                                            event.currentTarget
                                                                .value
                                                        ) || 1
                                                    )
                                                }
                                            />
                                            <button type="submit">
                                                {t("Apply")}
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </section>
                        )}

                        <MiniCalendar
                            currentDate={currentDate}
                            firstDay={firstDay}
                            showWeekNumbers={showWeekNumbers}
                            onDateSelect={onDateSelect}
                        />

                        <div className="nc-sidebar-section">
                            {/* The whole header row is the collapse target: click
                            anywhere toggles the list. The "+" stops propagation
                            so it only adds a calendar. */}
                            <div
                                className="nc-sidebar-title-row"
                                role="button"
                                tabIndex={0}
                                onClick={() => setCalendarsCollapsed((v) => !v)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setCalendarsCollapsed((v) => !v);
                                    }
                                }}
                                aria-label={
                                    calendarsCollapsed
                                        ? "Expand calendars"
                                        : "Collapse calendars"
                                }
                                data-nc-tooltip={
                                    calendarsCollapsed
                                        ? "Expand calendars"
                                        : "Collapse calendars"
                                }
                            >
                                <span className="nc-sidebar-title-label">
                                    <span className="nc-sidebar-title">
                                        {t("Calendars")}
                                    </span>
                                    <span
                                        className={`nc-sidebar-title-chevron${
                                            calendarsCollapsed
                                                ? " nc-collapsed"
                                                : ""
                                        }`}
                                    >
                                        <ChevronDownIcon size={14} />
                                    </span>
                                </span>
                                <span className="nc-sidebar-title-actions">
                                    <button
                                        className="nc-sidebar-add-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setHeaderMenuAnchor(
                                                e.currentTarget.getBoundingClientRect()
                                            );
                                        }}
                                        aria-label={t("More options")}
                                        data-nc-tooltip={t("More options")}
                                    >
                                        <MoreHorizontalIcon />
                                    </button>
                                    <button
                                        className="nc-sidebar-add-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAddCalendar();
                                        }}
                                        aria-label={t("Add calendar")}
                                        data-nc-tooltip={t("Add calendar")}
                                    >
                                        <PlusIcon size={14} />
                                    </button>
                                </span>
                            </div>
                            {!calendarsCollapsed && (
                                <div
                                    className={`nc-calendar-list${
                                        reorder.dragging ? " nc-reordering" : ""
                                    }`}
                                >
                                    {calendarSources.map((source, index) => {
                                        const hidden = hiddenCalendars.has(
                                            source.id
                                        );
                                        const online = ONLINE_TYPES.includes(
                                            source.type
                                        );
                                        // Auto calendars wear their own icon in
                                        // place of the solid swatch, same treatment
                                        // as the feed mark: coloured glyph, no fill.
                                        const isAuto = source.type === "auto";
                                        const glyph = online || isAuto;
                                        const isDefault =
                                            source.id === defaultCalendarId;
                                        const isSelected =
                                            source.id === selectedCalendarId;
                                        const dragProps =
                                            reorder.getItemProps(index);
                                        return (
                                            <div
                                                key={source.id}
                                                ref={dragProps.ref}
                                                className={`nc-calendar-item${
                                                    hidden
                                                        ? " nc-calendar-hidden"
                                                        : ""
                                                }${
                                                    isDefault
                                                        ? " nc-calendar-default"
                                                        : ""
                                                }${
                                                    isSelected
                                                        ? " nc-calendar-selected"
                                                        : ""
                                                }${
                                                    dragProps.className
                                                        ? " " +
                                                          dragProps.className
                                                        : ""
                                                }`}
                                                style={
                                                    {
                                                        "--nc-cal-color":
                                                            source.color,
                                                        ...dragProps.style,
                                                    } as React.CSSProperties
                                                }
                                                onPointerDown={
                                                    dragProps.onPointerDown
                                                }
                                                // The whole row opens this calendar's
                                                // event list â€” except the swatch and
                                                // the action buttons, which stop
                                                // propagation. Skipped while renaming,
                                                // and after a drag (which ends here as
                                                // a click) so reordering doesn't also
                                                // open the panel.
                                                onClick={() => {
                                                    if (editingId === source.id)
                                                        return;
                                                    if (reorder.wasDragged())
                                                        return;
                                                    onCalendarClick(source.id);
                                                }}
                                            >
                                                {/* Left control: colored swatch (with
                                            an RSS mark for remote calendars).
                                            Clicking sets this calendar as the
                                            default â€” but only local editable
                                            ones; remote calendars can't be the
                                            default. Visibility is toggled via
                                            the eye icon, not here. */}
                                                <button
                                                    type="button"
                                                    ref={(el) => {
                                                        swatchRefs.current[
                                                            source.id
                                                        ] = el;
                                                    }}
                                                    className={`nc-calendar-visibility${
                                                        source.editable
                                                            ? ""
                                                            : " nc-calendar-visibility-static"
                                                    }`}
                                                    onClick={(e) => {
                                                        // Never open the event list
                                                        // from the swatch.
                                                        e.stopPropagation();
                                                        // Shift-click is the direct
                                                        // shortcut to change the
                                                        // colour. Kept separate from a
                                                        // plain click so changing the
                                                        // colour never also flips the
                                                        // default calendar â€” a
                                                        // double-click used to fire
                                                        // the plain onClick first and
                                                        // reset the default every time.
                                                        // The swatch is now the ONE
                                                        // way to set the default,
                                                        // on every platform: one
                                                        // control, one meaning. The
                                                        // colour keeps its own
                                                        // route through the row's
                                                        // "..." menu, which is
                                                        // where a phone reaches it
                                                        // — the row itself is for
                                                        // opening the calendar's
                                                        // events.
                                                        if (e.shiftKey) {
                                                            openColorPicker(
                                                                source.id,
                                                                source.color
                                                            );
                                                            return;
                                                        }
                                                        if (source.editable)
                                                            onSetDefaultCalendar(
                                                                source.id
                                                            );
                                                    }}
                                                    aria-label={
                                                        source.editable
                                                            ? t(
                                                                  "Set as default"
                                                              )
                                                            : t(
                                                                  "Shift-click to change colour"
                                                              )
                                                    }
                                                    data-nc-tooltip={
                                                        source.editable
                                                            ? t(
                                                                  "Set as default"
                                                              )
                                                            : t(
                                                                  "Shift-click to change colour"
                                                              )
                                                    }
                                                >
                                                    <span
                                                        className={`nc-calendar-checkbox${
                                                            glyph
                                                                ? " nc-calendar-feed"
                                                                : ""
                                                        }`}
                                                        style={
                                                            glyph
                                                                ? {
                                                                      color: source.color,
                                                                  }
                                                                : {
                                                                      backgroundColor:
                                                                          source.color,
                                                                      borderColor:
                                                                          source.color,
                                                                  }
                                                        }
                                                    >
                                                        {online && (
                                                            <RssIcon
                                                                size={15}
                                                                maskId={
                                                                    source.id
                                                                }
                                                            />
                                                        )}
                                                        {isAuto && (
                                                            <ObsidianIcon
                                                                name={
                                                                    source.icon ||
                                                                    "flag"
                                                                }
                                                                size={15}
                                                            />
                                                        )}
                                                    </span>
                                                </button>

                                                {editingId === source.id ? (
                                                    <div className="nc-calendar-edit">
                                                        <input
                                                            type="text"
                                                            className="nc-calendar-edit-input"
                                                            value={editName}
                                                            onChange={(e) =>
                                                                setEditName(
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (
                                                                    e.key ===
                                                                    "Enter"
                                                                )
                                                                    commitRename();
                                                                if (
                                                                    e.key ===
                                                                    "Escape"
                                                                )
                                                                    cancelRename();
                                                            }}
                                                            disabled={renaming}
                                                            autoFocus
                                                        />
                                                        <button
                                                            className="nc-calendar-edit-btn nc-edit-ok"
                                                            onClick={
                                                                commitRename
                                                            }
                                                            disabled={renaming}
                                                            data-nc-tooltip={t("Save")}
                                                        >
                                                            {renaming
                                                                ? "..."
                                                                : "OK"}
                                                        </button>
                                                        <button
                                                            className="nc-calendar-edit-btn nc-edit-cancel"
                                                            onClick={
                                                                cancelRename
                                                            }
                                                            disabled={renaming}
                                                            data-nc-tooltip={t("Cancel")}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span
                                                            className="nc-calendar-name"
                                                            data-nc-tooltip={source.name}
                                                        >
                                                            {source.name}
                                                        </span>
                                                        {isDefault && (
                                                            <span className="nc-calendar-default-label">
                                                                {t("Default")}
                                                            </span>
                                                        )}
                                                        <div className="nc-calendar-actions">
                                                            <button
                                                                type="button"
                                                                className="nc-calendar-action-btn"
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    openMenu(
                                                                        e,
                                                                        source.id
                                                                    );
                                                                }}
                                                                data-nc-tooltip={t(
                                                                    "More options"
                                                                )}
                                                            >
                                                                <MoreHorizontalIcon />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="nc-calendar-action-btn"
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    onToggleCalendar(
                                                                        source.id
                                                                    );
                                                                }}
                                                                aria-label={
                                                                    hidden
                                                                        ? t(
                                                                              "Show"
                                                                          )
                                                                        : t(
                                                                              "Hide"
                                                                          )
                                                                }
                                                                data-nc-tooltip={
                                                                    hidden
                                                                        ? t(
                                                                              "Show"
                                                                          )
                                                                        : t(
                                                                              "Hide"
                                                                          )
                                                                }
                                                            >
                                                                {hidden ? (
                                                                    <EyeOffIcon />
                                                                ) : (
                                                                    <EyeIcon />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Tasks live below the calendars: the grid answers where
                        you have to be, this answers what you have to get done —
                        including the tasks whose date has already slipped by,
                        which the grid buries in a month nobody scrolls to. */}
                        {isAndroid ? (
                            <div className="nc-sidebar-section">
                                <div
                                    className="nc-sidebar-title-row"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setTasksCollapsed((v) => !v)}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.preventDefault();
                                            setTasksCollapsed((v) => !v);
                                        }
                                    }}
                                    aria-label={
                                        tasksCollapsed
                                            ? "Expand tasks"
                                            : "Collapse tasks"
                                    }
                                    data-nc-tooltip={
                                        tasksCollapsed
                                            ? "Expand tasks"
                                            : "Collapse tasks"
                                    }
                                >
                                    <span className="nc-sidebar-title-label">
                                        <span className="nc-sidebar-title">
                                            {t("Tasks")}
                                        </span>
                                        <span
                                            className={`nc-sidebar-title-chevron${
                                                tasksCollapsed
                                                    ? " nc-collapsed"
                                                    : ""
                                            }`}
                                        >
                                            <ChevronDownIcon size={14} />
                                        </span>
                                    </span>
                                </div>
                                {!tasksCollapsed && (
                                    <TasksPanel
                                        tasks={tasks}
                                        today={today}
                                        onTaskClick={onEventClick}
                                        onAddTask={onAddTask}
                                        onToggleTask={onToggleTask}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="nc-sidebar-section">
                                <div className="nc-sidebar-title-row nc-sidebar-title-row-static">
                                    <span className="nc-sidebar-title">
                                        {t("Tasks")}
                                    </span>
                                </div>
                                <DesktopTasksPanel
                                    tasks={tasks}
                                    today={today}
                                    onTaskClick={onEventClick}
                                    onToggleTask={onToggleTask}
                                />
                            </div>
                        )}
                    </>
                )}

                {/* La liste des raccourcis clavier n'est offerte que là où il
                    y a un clavier. Sur un téléphone elle donnait une fiche de
                    touches — T, D, W, M — qu'aucun doigt ne peut presser, et
                    un champ de recherche qui faisait monter le clavier tactile
                    par-dessus la fiche qu'on venait d'ouvrir. */}
                {!isAndroid && (
                    <div className="nc-sidebar-footer">
                        <button
                            type="button"
                            className="nc-sidebar-help-btn"
                            data-nc-tooltip={t("Keyboard shortcuts")}
                            aria-label={t("Keyboard shortcuts")}
                            onClick={(event) =>
                                setShortcutsAnchor(
                                    shortcutsAnchor
                                        ? null
                                        : event.currentTarget.getBoundingClientRect()
                                )
                            }
                        >
                            <CircleHelpIcon size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Portaled to <body> (see CalendarItemMenu), so they are siblings
                of the scroller rather than children of it — a menu inside an
                overflow container would be clipped by it, and would scroll away
                from the row it belongs to. */}
            {menuSource && menuAnchor && (
                <CalendarItemMenu
                    items={buildMenuItems(menuSource)}
                    anchorRect={menuAnchor}
                    onClose={() => setMenuId(null)}
                />
            )}

            {headerMenuAnchor && (
                <CalendarItemMenu
                    items={[
                        {
                            key: "open-root",
                            label: "Open root folder",
                            icon: <FolderIcon />,
                            onClick: onOpenRootFolder,
                        },
                    ]}
                    anchorRect={headerMenuAnchor}
                    onClose={() => setHeaderMenuAnchor(null)}
                />
            )}

            {shortcutsAnchor && (
                <ShortcutsPanel
                    anchorRect={shortcutsAnchor}
                    onClose={() => setShortcutsAnchor(null)}
                />
            )}

            {colorPicker && (
                <ColorPicker
                    color={colorPicker.color}
                    anchorRect={colorPicker.rect}
                    onChange={(hex) => onColorChange(colorPicker.id, hex)}
                    onClose={() => setColorPicker(null)}
                />
            )}
        </div>
    );
}
