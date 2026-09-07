import React, { createContext, useContext, useEffect, useState } from "react";
import { DesktopWindowActions } from "./platform/desktopWindow";

const TitlebarHost = createContext<HTMLDivElement | null>(null);
export const useDesktopTitlebarHost = (): HTMLDivElement | null =>
    useContext(TitlebarHost);

export default function DesktopWindowShell({
    actions,
    children,
}: {
    actions: DesktopWindowActions;
    children?: React.ReactNode;
}): JSX.Element {
    const [slot, setSlot] = useState<HTMLDivElement | null>(null);
    const [maximized, setMaximized] = useState(false);
    const [focused, setFocused] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [run, setRun] = useState<(action: () => Promise<void>) => void>(
        () => () => {}
    );

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
                    <button
                        type="button"
                        aria-label="Réduire"
                        onClick={() => run(actions.minimize)}
                    >
                        Réduire
                    </button>
                    <button
                        type="button"
                        aria-label={maximized ? "Restaurer" : "Agrandir"}
                        onClick={() => run(actions.toggleMaximize)}
                    >
                        {maximized ? "Restaurer" : "Agrandir"}
                    </button>
                    <button
                        type="button"
                        aria-label="Fermer"
                        onClick={() => run(actions.close)}
                    >
                        Fermer
                    </button>
                </div>
                {error !== null && <div role="alert">{error}</div>}
                {children}
            </div>
        </TitlebarHost.Provider>
    );
}
