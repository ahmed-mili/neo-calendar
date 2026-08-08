import * as React from "react";
import { useRef, useEffect } from "react";
import { App } from "obsidian";
import { OptionSuggest, SuggestOption } from "../suggest/OptionSuggest";
import { getPluginApp } from "../suggest/pluginApp";

interface SuggestSelectProps {
    /** Optional — falls back to the plugin-app singleton when omitted. */
    app?: App;
    value: string;
    options: SuggestOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    onBlur?: () => void;
}

/**
 * React wrapper around {@link OptionSuggest}: renders a field that looks like the
 * folder picker (native suggestion popup) and behaves like a `<select>`.
 */
export function SuggestSelect({
    app,
    value,
    options,
    onChange,
    placeholder,
    required,
    disabled,
    autoFocus,
    onBlur,
}: SuggestSelectProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestRef = useRef<OptionSuggest | null>(null);
    // Keep the latest callbacks/options without re-creating the suggester.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const currentLabel = options.find((o) => o.value === value)?.label ?? "";

    // Create the suggester once, on mount.
    useEffect(() => {
        if (!inputRef.current) return;
        const resolvedApp = app ?? getPluginApp();
        const suggest = new OptionSuggest(
            resolvedApp,
            inputRef.current,
            options,
            (val) => onChangeRef.current(val)
        );
        suggestRef.current = suggest;
        return () => suggest.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [app]);

    // Refresh the option list in place when it changes.
    useEffect(() => {
        if (suggestRef.current) suggestRef.current.options = options;
    }, [options]);

    // Keep the visible label in sync with the external value.
    useEffect(() => {
        if (inputRef.current && inputRef.current.value !== currentLabel) {
            inputRef.current.value = currentLabel;
        }
    }, [currentLabel]);

    return (
        <div className="search-input-container neo-suggest-field">
            <input
                ref={inputRef}
                type="search"
                spellCheck={false}
                defaultValue={currentLabel}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                autoFocus={autoFocus}
                onBlur={onBlur}
            />
        </div>
    );
}
