import * as React from "react";
import * as ReactDOM from "react-dom";
import { listZones, richZoneLabel } from "./TimezonePicker";
import { t } from "../i18n";

/*
 * Choosing a time zone, and naming one.
 *
 * These were Obsidian modals — FuzzySuggestModal and Modal/Setting. The desktop
 * and the phone both run against a shim where those are declared and empty:
 *
 *     export class FuzzySuggestModal<T = unknown> {}
 *     export class Modal {}
 *
 * so `new TimezoneSuggestModal(app)` succeeded and `modal.setPlaceholder(...)`
 * threw a TypeError into the console. Tapping "Change time zone" on the phone
 * did nothing at all, and had done for as long as there had been a phone.
 *
 * They are the app's own surfaces now, in the app's own styles, on every
 * platform. Mounted imperatively because the callers are plain handlers rather
 * than components; each one owns a container it removes when it closes.
 */

/** Put a component on screen over everything, and hand it back its own exit. */
function mount(render: (close: () => void) => React.ReactElement): void {
    if (typeof document === "undefined") return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const close = () => {
        ReactDOM.unmountComponentAtNode(host);
        host.remove();
    };
    ReactDOM.render(render(close), host);
}

function Overlay({
    children,
    onClose,
}: {
    children: React.ReactNode;
    onClose: () => void;
}) {
    React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div
            className="nc-tz-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="nc-tz-overlay-sheet">{children}</div>
        </div>
    );
}

/** Searchable list of every zone the runtime knows, recents first. */
export function openTimezonePicker(
    referenceDate: Date,
    recents: string[],
    onPick: (tz: string) => void
): void {
    mount((close) => (
        <TimezoneChooser {...{ referenceDate, recents, onPick, close }} />
    ));
}

function TimezoneChooser({
    referenceDate,
    recents,
    onPick,
    close,
}: {
    referenceDate: Date;
    recents: string[];
    onPick: (tz: string) => void;
    close: () => void;
}) {
    const [query, setQuery] = React.useState("");
    const options = React.useMemo(() => {
        const all = listZones();
        const recent = recents.filter((zone) => all.includes(zone));
        const seen = new Set(recent);
        return [...recent, ...all.filter((zone) => !seen.has(zone))].map(
            (zone) => ({
                value: zone,
                label: richZoneLabel(zone, referenceDate),
                recent: seen.has(zone),
            })
        );
    }, [recents, referenceDate]);
    const shown = React.useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        const matches = needle
            ? options.filter(
                  (option) =>
                      option.label.toLocaleLowerCase().includes(needle) ||
                      option.value.toLocaleLowerCase().includes(needle)
              )
            : options;
        // The runtime lists several hundred zones; past the first page nobody is
        // reading, they are typing.
        return matches.slice(0, 80);
    }, [options, query]);

    return (
        <Overlay onClose={close}>
            <input
                className="nc-tz-picker-input"
                type="search"
                autoFocus
                spellCheck={false}
                value={query}
                placeholder={t("Time zone…")}
                onChange={(event) => setQuery(event.target.value)}
            />
            <div className="nc-tz-picker-list" role="listbox">
                {shown.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected="false"
                        className="nc-tz-picker-option"
                        onClick={() => {
                            onPick(option.value);
                            close();
                        }}
                    >
                        <span>{option.label}</span>
                        {option.recent && (
                            <span className="nc-tz-picker-recent">
                                {t("Recent")}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </Overlay>
    );
}

/** A custom label for a zone. Submitting nothing clears it. */
export function openTimezoneRename(
    current: string,
    onSubmit: (label: string) => void
): void {
    mount((close) => (
        <TimezoneRename current={current} onSubmit={onSubmit} close={close} />
    ));
}

function TimezoneRename({
    current,
    onSubmit,
    close,
}: {
    current: string;
    onSubmit: (label: string) => void;
    close: () => void;
}) {
    const [value, setValue] = React.useState(current);
    const commit = () => {
        onSubmit(value.trim());
        close();
    };
    return (
        <Overlay onClose={close}>
            <div className="nc-tz-overlay-title">{t("Rename time zone")}</div>
            <input
                className="nc-tz-picker-input"
                autoFocus
                value={value}
                placeholder={t("Label")}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") commit();
                }}
            />
            <div className="nc-tz-overlay-actions">
                <button
                    type="button"
                    className="nc-tz-overlay-cancel"
                    onClick={close}
                >
                    {t("Cancel")}
                </button>
                <button
                    type="button"
                    className="nc-tz-overlay-save"
                    onClick={commit}
                >
                    {t("Save")}
                </button>
            </div>
        </Overlay>
    );
}
