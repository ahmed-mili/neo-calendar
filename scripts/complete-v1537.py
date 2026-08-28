from pathlib import Path

path = Path("apps/windows/src/DesktopCalendar.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
    'import { mergeRemoteEvents } from "./platform/mergeRemoteEvents";\n',
    'import {\n'
    '    hasIcalDirectory,\n'
    '    planIcalDirectoryAssignments,\n'
    '    planIcalNoteSync,\n'
    '} from "./platform/icalNoteSync";\n',
    "iCalendar sync import",
)

replace_once(
    'function anchorForEvent(eventId: string): DOMRect | null {\n',
    'function hasPhysicalEventNote(record: DesktopStoredEvent): boolean {\n'
    '    return (\n'
    '        !record.relativePath.startsWith("@external/") &&\n'
    '        /\\.md$/i.test(record.relativePath)\n'
    '    );\n'
    '}\n\n'
    'function anchorForEvent(eventId: string): DOMRect | null {\n',
    "physical note helper",
)

old_refresh = '''    /**
     * Rapatrier les abonnements distants, après que le calendrier est à l'écran.
     *
     * Chacun remplace ses propres événements et ne touche à rien d'autre : ce
     * que l'on vient de créer entre-temps reste, et un abonnement qui échoue ne
     * fait pas disparaître les autres. C'est aussi pourquoi la fusion se fait
     * sur l'état courant plutôt que sur une liste capturée au départ.
     */
    const refreshRemoteCalendars = useCallback(
        async (sources: DesktopExternalCalendarSource[]) => {
            const remote = sources.filter(
                (
                    source
                ): source is Extract<
                    DesktopExternalCalendarSource,
                    { type: "ical" }
                > => source.type === "ical"
            );
            if (remote.length === 0) return;

            const errors: string[] = [];
            const groups = await Promise.all(
                remote.map(async (source) => {
                    try {
                        const text = await fetchDesktopIcs(source.url);
                        return parseIcalCalendarEvents(text).map(
                            (event, index) =>
                                externalEventRecord(source, event, index)
                        );
                    } catch (reason) {
                        errors.push(`${source.name}: ${errorMessage(reason)}`);
                        return [];
                    }
                })
            );

            const arrived = groups.flat();
            setStoredEvents((current) =>
                mergeRemoteEvents(
                    current,
                    remote.map(externalCalendarId),
                    arrived
                )
            );

            if (errors.length) {
                setStorageError(
                    `Some remote calendars could not be refreshed: ${errors.join(
                        " | "
                    )}`
                );
            }
        },
        []
    );
'''
new_refresh = '''    /**
     * Refresh subscriptions into durable Markdown notes.
     *
     * A feed is only the latest window the provider chooses to expose; it is
     * not our history database. New and changed VEVENTs are therefore written
     * into the subscription's folder, while notes missing from a later fetch
     * are deliberately left alone. This also makes the same history available
     * on Windows and Android through the synced data folder.
     */
    const refreshRemoteCalendars = useCallback(
        async (sources: DesktopExternalCalendarSource[]) => {
            const remote = sources.filter(
                (
                    source
                ): source is Extract<
                    DesktopExternalCalendarSource,
                    { type: "ical" }
                > => source.type === "ical"
            );
            if (remote.length === 0) return;

            const errors: string[] = [];
            const groups = await Promise.all(
                remote.map(async (source) => {
                    try {
                        if (!hasIcalDirectory(source)) {
                            throw new Error(
                                "The subscription has no note folder yet."
                            );
                        }
                        const feed = await fetchDesktopIcs(source.url);
                        const writes = planIcalNoteSync(
                            source,
                            parseIcalCalendarEvents(feed),
                            recordsRef.current
                        );
                        const records: DesktopStoredEvent[] = [];
                        for (const write of writes) {
                            const relativePath = await writeDesktopEventFile({
                                dataFolder,
                                calendarPath: write.calendarPath,
                                previousRelativePath: write.previousRelativePath,
                                fileName: write.fileName,
                                contents: write.contents,
                            });
                            records.push({
                                id: write.event.id as string,
                                calendarId: write.calendarId,
                                calendarPath: write.calendarPath,
                                relativePath,
                                fileName: fileNameFromRelativePath(relativePath),
                                contents: write.contents,
                                event: write.event,
                                readOnly: true,
                            });
                        }
                        return records;
                    } catch (reason) {
                        errors.push(`${source.name}: ${errorMessage(reason)}`);
                        return [];
                    }
                })
            );

            const arrived = groups.flat();
            if (arrived.length > 0) {
                setStoredEvents((current) => {
                    const byId = new Map(
                        current.map((record) => [record.id, record])
                    );
                    for (const record of arrived) byId.set(record.id, record);
                    const next = [...byId.values()];
                    recordsRef.current = next;
                    return next;
                });
            }

            if (errors.length) {
                setStorageError(
                    `Some remote calendars could not be refreshed: ${errors.join(
                        " | "
                    )}`
                );
            }
        },
        [dataFolder]
    );
'''
replace_once(old_refresh, new_refresh, "remote refresh")

replace_once(
    "            const storedPreferences = await preferenceWriter.adopt(\n",
    "            let storedPreferences = await preferenceWriter.adopt(\n",
    "mutable stored preferences",
)

marker = "            const nextPreferences = withDeviceWorkspacePreferences(\n"
insert = '''            const directoryPlan = planIcalDirectoryAssignments(
                storedPreferences.externalCalendars,
                snapshot.calendars.map((calendar) => calendar.relativePath)
            );
            for (const directory of directoryPlan.directoriesToCreate) {
                try {
                    await createDesktopCalendarFolder(dataFolder, directory);
                } catch (reason) {
                    // A sync tool or another instance may have created the
                    // assigned folder after the snapshot was read.
                    if (!/already exists/i.test(errorMessage(reason))) {
                        throw reason;
                    }
                }
            }
            if (directoryPlan.changed) {
                storedPreferences = await preferenceWriter.mutate((current) => ({
                    ...current,
                    externalCalendars: directoryPlan.sources,
                }));
            }

'''
if text.count(marker) != 1:
    raise RuntimeError(f"directory migration marker: {text.count(marker)}")
text = text.replace(marker, insert + marker, 1)

old_local = '''            const localCalendars = snapshot.calendars.map(
                (calendar, index): DesktopCalendarModel => ({
                    id: calendarIdFromPath(calendar.relativePath),
                    relativePath: calendar.relativePath,
                    name: calendar.name,
                    color:
                        nextPreferences.colors[calendar.relativePath] ??
                        stableColor(calendar.relativePath, index),
                    editable: true,
                    type: "local",
                })
            );
'''
new_local = '''            const icalSourcesWithDirectories =
                nextPreferences.externalCalendars.filter(
                    (
                        source
                    ): source is Extract<
                        DesktopExternalCalendarSource,
                        { type: "ical" }
                    > & { directory: string } =>
                        source.type === "ical" && hasIcalDirectory(source)
                );
            const icalSourceByDirectory = new Map(
                icalSourcesWithDirectories.map((source) => [
                    source.directory.toLocaleLowerCase(),
                    source,
                ])
            );
            const localCalendars = snapshot.calendars
                .filter(
                    (calendar) =>
                        !icalSourceByDirectory.has(
                            calendar.relativePath.toLocaleLowerCase()
                        )
                )
                .map(
                    (calendar, index): DesktopCalendarModel => ({
                        id: calendarIdFromPath(calendar.relativePath),
                        relativePath: calendar.relativePath,
                        name: calendar.name,
                        color:
                            nextPreferences.colors[calendar.relativePath] ??
                            stableColor(calendar.relativePath, index),
                        editable: true,
                        type: "local",
                    })
                );
'''
replace_once(old_local, new_local, "local calendars")

old_records = '''            const knownLocalIds = new Set<string>(
                localCalendars.map((calendar) => calendar.id)
            );
            const previousByPath = new Map(
                recordsRef.current
                    .filter((record) => !record.readOnly)
                    .map((record) => [record.relativePath, record.id])
            );
            const localEvents = snapshot.eventFiles
                .map((file) => parseStoredEvent(file, knownLocalIds))
                .filter((event): event is DesktopStoredEvent => event !== null)
                .map((record) => ({
                    ...record,
                    id: previousByPath.get(record.relativePath) ?? record.id,
                    readOnly: false,
                }));
'''
new_records = '''            // The parser still validates a materialised feed note as a file in
            // its physical folder. Once parsed, route it back to the logical
            // read-only subscription id so the calendar identity stays stable.
            const knownPhysicalIds = new Set<string>([
                ...localCalendars.map((calendar) => calendar.id),
                ...icalSourcesWithDirectories.map((source) =>
                    calendarIdFromPath(source.directory)
                ),
            ]);
            const previousByPath = new Map(
                recordsRef.current
                    .filter(hasPhysicalEventNote)
                    .map((record) => [record.relativePath, record.id])
            );
            const localEvents = snapshot.eventFiles
                .map((file) => parseStoredEvent(file, knownPhysicalIds))
                .filter((event): event is DesktopStoredEvent => event !== null)
                .map((record) => {
                    const source = icalSourceByDirectory.get(
                        record.calendarPath.toLocaleLowerCase()
                    );
                    return {
                        ...record,
                        id: previousByPath.get(record.relativePath) ?? record.id,
                        calendarId: source
                            ? externalCalendarId(source)
                            : record.calendarId,
                        readOnly: Boolean(source),
                    };
                });
'''
replace_once(old_records, new_records, "physical event parsing")

old_readonly_context = '''        if (record.readOnly) {
            return [
                {
                    label: t("Copy"),
                    shortcut: "Ctrl C",
                    icon: <CopyIcon />,
                    onClick: () => copyEvent(contextMenu.eventId),
                },
                {
                    label: t("Duplicate to default calendar"),
                    shortcut: "Ctrl D",
                    icon: <DuplicateIcon />,
                    onClick: () => void duplicateEvent(contextMenu.eventId),
                },
            ];
        }
'''
new_readonly_context = '''        if (record.readOnly) {
            return [
                {
                    label: t("Copy"),
                    shortcut: "Ctrl C",
                    icon: <CopyIcon />,
                    onClick: () => copyEvent(contextMenu.eventId),
                },
                {
                    label: t("Duplicate to default calendar"),
                    shortcut: "Ctrl D",
                    icon: <DuplicateIcon />,
                    onClick: () => void duplicateEvent(contextMenu.eventId),
                },
                ...(hasPhysicalEventNote(record)
                    ? [
                          {
                              label: t("Go to note"),
                              icon: <FileTextIcon />,
                              onClick: () =>
                                  void openDesktopPath(
                                      dataFolder,
                                      record.relativePath
                                  ),
                          },
                      ]
                    : []),
            ];
        }
'''
replace_once(old_readonly_context, new_readonly_context, "read-only context note")

old_remove_else = '''            } else {
                await persistPreferences((stored) => {
                    const nextColors = { ...stored.colors };
                    delete nextColors[calendar.relativePath];
                    return {
                        ...stored,
                        colors: nextColors,
                        order: stored.order.filter(
                            (key) => key !== calendar.relativePath
                        ),
                        hiddenCalendarPaths: stored.hiddenCalendarPaths.filter(
                            (key) => key !== calendar.relativePath
                        ),
                        externalCalendars: stored.externalCalendars.filter(
                            (source) =>
                                externalCalendarId(source) !== calendar.id
                        ),
                    };
                });
            }
'''
new_remove_else = '''            } else {
                await persistPreferences((stored) => {
                    const source = stored.externalCalendars.find(
                        (candidate) =>
                            externalCalendarId(candidate) === calendar.id
                    );
                    const archivePath =
                        source?.type === "ical" && hasIcalDirectory(source)
                            ? source.directory
                            : null;
                    const nextColors = { ...stored.colors };
                    const previousColor =
                        nextColors[calendar.relativePath] ?? calendar.color;
                    delete nextColors[calendar.relativePath];
                    if (archivePath) nextColors[archivePath] = previousColor;

                    const remap = (values: string[]) => [
                        ...new Set(
                            values.flatMap((key) =>
                                key === calendar.relativePath
                                    ? archivePath
                                        ? [archivePath]
                                        : []
                                    : [key]
                            )
                        ),
                    ];
                    return {
                        ...stored,
                        colors: nextColors,
                        order: remap(stored.order),
                        hiddenCalendarPaths: remap(
                            stored.hiddenCalendarPaths
                        ),
                        externalCalendars: stored.externalCalendars.filter(
                            (candidate) =>
                                externalCalendarId(candidate) !== calendar.id
                        ),
                    };
                });
            }
'''
replace_once(old_remove_else, new_remove_else, "subscription removal archive")

old_open_folder = '''                onOpenCalendarFolder={(calendarId: string) => {
                    const calendar = calendarById.get(calendarId);
                    if (calendar?.editable && calendar.type === "local") {
                        void openDesktopPath(dataFolder, calendar.relativePath);
                    }
                }}
'''
new_open_folder = '''                onOpenCalendarFolder={(calendarId: string) => {
                    const calendar = calendarById.get(calendarId);
                    if (calendar?.editable && calendar.type === "local") {
                        void openDesktopPath(dataFolder, calendar.relativePath);
                        return;
                    }
                    const source = preferences.externalCalendars.find(
                        (candidate) =>
                            externalCalendarId(candidate) === calendarId
                    );
                    if (source?.type === "ical" && hasIcalDirectory(source)) {
                        void openDesktopPath(dataFolder, source.directory);
                    }
                }}
'''
replace_once(old_open_folder, new_open_folder, "open subscription folder")

old_open_file = '''                onOpenFile={(eventId: string) => {
                    const record = findStoredEvent(recordsRef.current, eventId);
                    if (record && !record.readOnly) {
                        void openDesktopPath(dataFolder, record.relativePath);
                    }
                }}
'''
new_open_file = '''                onOpenFile={(eventId: string) => {
                    const record = findStoredEvent(recordsRef.current, eventId);
                    if (record && hasPhysicalEventNote(record)) {
                        void openDesktopPath(dataFolder, record.relativePath);
                    }
                }}
'''
replace_once(old_open_file, new_open_file, "panel open note")

old_copy_path = '''                    if (!record || record.readOnly) {
                        throw new Error("The event note is unavailable.");
                    }
'''
new_copy_path = '''                    if (!record || !hasPhysicalEventNote(record)) {
                        throw new Error("The event note is unavailable.");
                    }
'''
replace_once(old_copy_path, new_copy_path, "copy physical note path")

path.write_text(text, encoding="utf-8")
