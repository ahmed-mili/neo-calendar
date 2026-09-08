import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { Copy } from "lucide-react";
import {
    DesktopWindowActions,
    getDesktopWindowActions,
} from "./platform/desktopWindow";
import { t } from "../../../src/ui/i18n";

const TitlebarHost = createContext<HTMLDivElement | null>(null);
export const useDesktopTitlebarHost = (): HTMLDivElement | null =>
    useContext(TitlebarHost);

/**
 * WebView2 peut faire matcher :focus-visible a un bouton clique des qu'une
 * touche clavier est pressee, y compris une touche modificatrice seule comme
 * Shift. Neo Calendar ne publie donc le focus clavier de la barre qu'apres une
 * vraie navigation de focus avec Tab/Shift+Tab.
 */
export const DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE = "data-nc-keyboard-focus";

export default function DesktopWindowShell({
    actions: injected,
    children,
}: {
    /** Left out in the app; supplied by the tests, which must not touch Tauri. */
    actions?: DesktopWindowActions;
    children?: React.ReactNode;
}): JSX.Element {
    const actions = useMemo(
        () => injected ?? getDesktopWindowActions(),
        [injected]
    );
    const [slot, setSlot] = useState<HTMLDivElement | null>(null);
    const [maximized, setMaximized] = useState(false);
    const [focused, setFocused] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [run, setRun] = useState<(action: () => Promise<void>) => void>(
        () => () => {}
    );

    useEffect(() => {
        const root = document.documentElement;
        const onKeyDown = (event: KeyboardEvent) => {
            // Shift seul ne change PAS la modalite. Shift+Tab, oui, car la
            // touche de navigation reelle reste Tab.
            if (event.key === "Tab") {
                root.setAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE, "true");
            }
        };
        const onPointerDown = () => {
            root.removeAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE);
        };

        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("pointerdown", onPointerDown, true);
            root.removeAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE);
        };
    }, []);

    useEffect(() => {
        let disposed = false;
        let revision = 0;
        const listeners: (() => void)[] = [];
        const report = (reason: unknown) => {
            if (!disposed)
                setError(
                    reason instanceof Error ? reason.message : String(reason)
                );
        };
        const refresh = async () => {
            const current = ++revision;
            try {
                const value = await actions.isMaximized();
                if (!disposed && current === revision) setMaximized(value);
            } catch (reason) {
                report(reason);
            }
        };
        setRun(() => (action: () => Promise<void>) => {
            setError(null);
            void Promise.resolve().then(action).then(refresh).catch(report);
        });
        const subscribe = async (register: () => Promise<() => void>) => {
            try {
                const unlisten = await register();
                if (disposed) unlisten();
                else listeners.push(unlisten);
            } catch (reason) {
                report(reason);
            }
        };
        void refresh();
        void subscribe(() =>
            actions.onResized(() => {
                void refresh();
            })
        );
        void subscribe(() =>
            actions.onFocusChanged((event) => {
                if (!disposed) setFocused(event.payload);
                void refresh();
            })
        );
        return () => {
            disposed = true;
            listeners.forEach((unlisten) => unlisten());
        };
    }, [actions]);

    return (
        <TitlebarHost.Provider value={slot}>
            <div className="nc-desktop-window-shell" data-focused={focused}>
                <div className="nc-desktop-titlebar">
                    <div
                        id="nc-desktop-titlebar-slot"
                        ref={setSlot}
                        onMouseDown={(event) => {
                            if (
                                event.target === event.currentTarget &&
                                event.button === 0 &&
                                event.detail === 1
                            )
                                run(actions.startDragging);
                        }}
                        onDoubleClick={(event) => {
                            if (
                                event.target === event.currentTarget &&
                                event.button === 0
                            )
                                run(actions.toggleMaximize);
                        }}
                    />
                    <div className="nc-desktop-window-controls">
                        <button
                            type="button"
                            className="nc-desktop-window-control"
                            aria-label={t("Minimize")}
                            onClick={() => run(actions.minimize)}
                        >
                            <span
                                className="nc-toolbar-icon nc-toolbar-icon--minimize"
                                aria-hidden="true"
                                data-toolbar-icon="minimize"
                            />
                        </button>
                        <button
                            type="button"
                            className="nc-desktop-window-control"
                            aria-label={t(maximized ? "Restore" : "Maximize")}
                            onClick={() => run(actions.toggleMaximize)}
                        >
                            {maximized ? (
                                <Copy
                                    aria-hidden="true"
                                    data-toolbar-icon="restore"
                                />
                            ) : (
                                <span
                                    className="nc-toolbar-icon nc-toolbar-icon--maximize"
                                    aria-hidden="true"
                                    data-toolbar-icon="maximize"
                                />
                            )}
                        </button>
                        <button
                            type="button"
                            className="nc-desktop-window-control nc-desktop-window-control--close"
                            aria-label={t("Close")}
                            onClick={() => run(actions.close)}
                        >
                            <span
                                className="nc-toolbar-icon nc-toolbar-icon--close"
                                aria-hidden="true"
                                data-toolbar-icon="close"
                            />
                        </button>
                    </div>
                </div>
                {error !== null && (
                    <div className="nc-desktop-window-error" role="alert">
                        {error}
                    </div>
                )}
                <div className="nc-desktop-window-content">{children}</div>
            </div>
        </TitlebarHost.Provider>
    );
}
