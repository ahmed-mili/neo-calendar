import { useEffect, useCallback, useRef } from "react";
import { App, Scope } from "obsidian";
import { ViewType } from "../types";
import { isEditableTarget } from "./keyboardGuard";

interface KeyboardShortcutsProps {
    /** Obsidian app — used to push a keymap Scope for Ctrl/Cmd+D (see below). */
    app: App;
    /**
     * Returns true when the calendar view is the active leaf, so global
     * shortcuts only fire (and only swallow keys) while the calendar is in
     * focus — never hijacking Ctrl+C / Ctrl+V in the rest of Obsidian.
     */
    isActive: () => boolean;
    /** Ancre la grille sur aujourd'hui, premiere colonne a gauche (touche T). */
    onAlignToday: () => void;
    onGoToday: () => void;
    onGoPrev: () => void;
    onGoNext: () => void;
    onViewChange: (view: ViewType) => void;
    onCreateEvent: () => void;
    onToggleSidebar: () => void;
    onOpenCommandPalette: () => void;
    onCopyEvent?: () => void;
    onCutEvent?: () => void;
    onPasteEvent?: () => void;
    onDuplicateEvent?: () => void;
    onDeleteEvent?: () => void;
    onUndo?: () => void;
}

export default function useKeyboardShortcuts({
    app,
    isActive,
    onAlignToday,
    onGoToday,
    onGoPrev,
    onGoNext,
    onViewChange,
    onCreateEvent,
    onToggleSidebar,
    onOpenCommandPalette,
    onCopyEvent,
    onCutEvent,
    onPasteEvent,
    onDuplicateEvent,
    onDeleteEvent,
    onUndo,
}: KeyboardShortcutsProps) {
    // Refs let the long-lived Scope effect (below) read the latest values
    // without re-registering on every panel selection change.
    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;
    const onDuplicateRef = useRef(onDuplicateEvent);
    onDuplicateRef.current = onDuplicateEvent;
    const onUndoRef = useRef(onUndo);
    onUndoRef.current = onUndo;

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            // Only act when the calendar view is focused.
            if (!isActive()) return;

            // Don't trigger when typing in inputs.
            if (isEditableTarget(e.target as HTMLElement | null)) {
                return;
            }

            // Mark a key as ours: prevent the default and stop it from reaching
            // Obsidian's global hotkey manager (which otherwise eats Ctrl+C/X/V
            // before our document listener ever sees them — hence the capture
            // phase on window above).
            const claim = () => {
                e.preventDefault();
                e.stopImmediatePropagation();
            };

            // Ctrl/Cmd shortcuts — only claimed when we actually have a target
            // event to act on, otherwise Obsidian/browser handles them.
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case "c":
                        if (onCopyEvent) {
                            claim();
                            onCopyEvent();
                        }
                        return;
                    case "x":
                        if (onCutEvent) {
                            claim();
                            onCutEvent();
                        }
                        return;
                    case "v":
                        if (onPasteEvent) {
                            claim();
                            onPasteEvent();
                        }
                        return;
                    // Ctrl/Cmd+D is handled via an Obsidian keymap Scope below,
                    // not here: Obsidian's hotkey manager runs before this
                    // window listener, so preventDefault here is too late to
                    // stop a global Mod+D binding (e.g. "Show in system
                    // explorer"). A Scope intercepts it before global hotkeys.
                }
                return;
            }

            if (e.altKey) return;

            if (e.key === "Delete" || e.key === "Backspace") {
                if (onDeleteEvent) {
                    claim();
                    onDeleteEvent();
                }
                return;
            }

            switch (e.key.toLowerCase()) {
                case "t":
                    claim();
                    // T seul ancre la grille sur aujourd'hui, Shift+T ramene au
                    // calendrier classique cale sur la periode.
                    if (e.shiftKey) {
                        onGoToday();
                    } else {
                        onAlignToday();
                    }
                    break;
                case "j":
                case "]":
                    claim();
                    onGoNext();
                    break;
                case "k":
                case "[":
                    claim();
                    onGoPrev();
                    break;
                case "d":
                    claim();
                    onViewChange("day");
                    break;
                case "w":
                    claim();
                    onViewChange("week");
                    break;
                case "m":
                    claim();
                    onViewChange("month");
                    break;
                case "l":
                    claim();
                    onViewChange("list");
                    break;
                case "3":
                    claim();
                    onViewChange("3days");
                    break;
                case "c":
                    claim();
                    onCreateEvent();
                    break;
                case "b":
                case ".":
                    claim();
                    onToggleSidebar();
                    break;
                case "/":
                    claim();
                    onOpenCommandPalette();
                    break;
            }
        },
        [
            isActive,
            onAlignToday,
            onGoToday,
            onGoPrev,
            onGoNext,
            onViewChange,
            onCreateEvent,
            onToggleSidebar,
            onOpenCommandPalette,
            onCopyEvent,
            onCutEvent,
            onPasteEvent,
            onDuplicateEvent,
            onDeleteEvent,
        ]
    );

    useEffect(() => {
        // Capture phase on window: runs before Obsidian's own keymap handler so
        // we can intercept Ctrl-combos that it would otherwise swallow.
        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [handleKeyDown]);

    // Ctrl/Cmd+D and Ctrl/Cmd+Z via an Obsidian keymap Scope. The window listener
    // above can't reliably claim them: Obsidian's hotkey manager listens on window
    // in the capture phase and is registered before this plugin, so it fires the
    // bound command (e.g. a user's "Show in system explorer", or the editor's undo)
    // before our preventDefault runs. A Scope is checked *before* global hotkeys, so
    // returning false from it both preventDefaults and stops the global binding. We
    // push the scope only while a calendar leaf is the active leaf (and pop it
    // otherwise) so we never hijack these keys elsewhere in Obsidian — in
    // particular Mod+Z must keep undoing text in notes.
    useEffect(() => {
        // Parented on the root scope on purpose. Obsidian resolves a key by
        // walking up from the current scope through `parent`, and the hotkey
        // manager's catch-all handler lives on the root scope. A parentless
        // scope therefore ends the walk at itself and silently disables EVERY
        // command hotkey (Ctrl+P, Ctrl+O, the user's own) for as long as a
        // calendar leaf is active. Registering below still wins: a child scope
        // is consulted before its parent, so Mod+D and Mod+Z keep their
        // priority over any global binding.
        const scope = new Scope(app.scope);
        scope.register(["Mod"], "d", () => {
            // Always claim Mod+D while the calendar is focused so it can never
            // reach a global hotkey. Duplicate only when an event is selected.
            onDuplicateRef.current?.();
            return false;
        });
        scope.register(["Mod"], "z", (e) => {
            // Typing in the event panel: let the field's own text undo run.
            if (isEditableTarget(e.target as HTMLElement | null)) {
                return true;
            }
            onUndoRef.current?.();
            return false;
        });

        let pushed = false;
        const sync = () => {
            const active = isActiveRef.current();
            if (active && !pushed) {
                app.keymap.pushScope(scope);
                pushed = true;
            } else if (!active && pushed) {
                app.keymap.popScope(scope);
                pushed = false;
            }
        };
        sync();
        const ref = app.workspace.on("active-leaf-change", sync);
        return () => {
            app.workspace.offref(ref);
            if (pushed) app.keymap.popScope(scope);
        };
    }, [app]);
}
