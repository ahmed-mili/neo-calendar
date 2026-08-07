export type PreferenceMutation<T> = (current: T) => T;

export interface WorkspacePreferenceWriter<T> {
    /** True once the stored preferences have been read at least once. */
    isLoaded(): boolean;
    /** Latest known value, optimistic changes included. */
    current(): T;
    /** Applies a change, writing it only when the stored value is known. */
    mutate(mutation: PreferenceMutation<T>): Promise<T>;
    /** Adopts the value just read from disk and replays pending changes. */
    adopt(loaded: T): Promise<T>;
    /** Forgets the loaded value, e.g. when the data folder changed. */
    reset(): void;
}

/**
 * Guards the workspace preference file against being overwritten with the
 * in-memory defaults. The UI is interactive while the folder is still being
 * read, so a toggle pressed during startup used to persist the defaults and
 * wipe calendar colors, ordering and hidden calendars.
 *
 * Changes made before the first successful read stay in memory, then get
 * replayed on top of the stored value once it is known.
 */
export function createWorkspacePreferenceWriter<T>(
    fallback: T,
    write: (value: T) => Promise<void>
): WorkspacePreferenceWriter<T> {
    let loaded = false;
    let value = fallback;
    let pending: PreferenceMutation<T>[] = [];

    return {
        isLoaded: () => loaded,
        current: () => value,

        async mutate(mutation) {
            value = mutation(value);
            if (!loaded) {
                pending.push(mutation);
                return value;
            }
            await write(value);
            return value;
        },

        async adopt(stored) {
            const replayed = pending;
            pending = [];
            loaded = true;
            value = replayed.reduce(
                (current, mutation) => mutation(current),
                stored
            );
            if (replayed.length > 0) await write(value);
            return value;
        },

        reset() {
            loaded = false;
            pending = [];
            value = fallback;
        },
    };
}
