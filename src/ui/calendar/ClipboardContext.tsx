import * as React from "react";
import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { NeoEvent } from "../../types";

interface ClipboardState {
    event: NeoEvent | null;
    mode: "copy" | "cut" | null;
    sourceEventId: string | null;
    sourceCalendarId: string | null;
}

const initialClipboard: ClipboardState = {
    event: null,
    mode: null,
    sourceEventId: null,
    sourceCalendarId: null,
};

interface ClipboardContextValue extends ClipboardState {
    setClipboard: (state: ClipboardState) => void;
    clearClipboard: () => void;
    hasClipboard: boolean;
}

const ClipboardContext = createContext<ClipboardContextValue>({
    ...initialClipboard,
    setClipboard: () => {},
    clearClipboard: () => {},
    hasClipboard: false,
});

export function ClipboardProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ClipboardState>(initialClipboard);

    const value = useMemo<ClipboardContextValue>(
        () => ({
            ...state,
            setClipboard: setState,
            clearClipboard: () => setState(initialClipboard),
            hasClipboard: state.event !== null,
        }),
        [state]
    );

    return (
        <ClipboardContext.Provider value={value}>
            {children}
        </ClipboardContext.Provider>
    );
}

export function useClipboard() {
    return useContext(ClipboardContext);
}
