import * as React from "react";
import * as ReactDOM from "react-dom";
import { useContext, useMemo, useRef, useState } from "react";
import { Globe2, Pencil } from "lucide-react";
import { DateTime } from "luxon";
import { PlusIcon } from "./Icons";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import { TimezoneMenuContext } from "./TimezoneColumn";
import { t } from "../i18n";

interface TimezonePickerProps {
    referenceDate: Date | undefined;
    onAddTimezone?: (tz: string) => void;
}

interface TimezoneOption {
    value: string;
    label: string;
    recent?: boolean;
}

export function offsetLabel(zone: string, ref: Date): string {
    const date = DateTime.fromJSDate(ref).setZone(zone);
    if (!date.isValid) return zone;
    const sign = date.offset >= 0 ? "+" : "−";
    const absoluteMinutes = Math.abs(date.offset);
    const hours = Math.floor(absoluteMinutes / 60);
    const minutes = absoluteMinutes % 60;
    return `GMT${sign}${hours}${
        minutes ? ":" + String(minutes).padStart(2, "0") : ""
    }`;
}

export function richZoneLabel(zone: string, ref: Date): string {
    const date = DateTime.fromJSDate(ref).setZone(zone);
    if (!date.isValid) return zone;
    const city = zone.split("/").pop()!.replace(/_/g, " ");
    return `GMT${date.toFormat("ZZ")} ${date.toFormat("ZZZZZ")} – ${city}`;
}

const LOCAL_ZONE =
    DateTime.local().zoneName ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

export function listZones(): string[] {
    const supported = (
        Intl as unknown as {
            supportedValuesOf?: (key: string) => string[];
        }
    ).supportedValuesOf;
    if (typeof supported === "function") {
        try {
            return supported("timeZone");
        } catch {
            // Use the small compatibility list below.
        }
    }
    return [
        "UTC",
        "Europe/Paris",
        "Europe/London",
        "America/New_York",
        "America/Los_Angeles",
        "Asia/Tokyo",
        "Asia/Dubai",
        "Australia/Sydney",
    ];
}

export function TimezonePicker({
    referenceDate,
    onAddTimezone,
}: TimezonePickerProps) {
    const [adding, setAdding] = useState(false);
    const [query, setQuery] = useState("");
    const [localMenuPosition, setLocalMenuPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const buttonRef = useRef<HTMLDivElement>(null);
    const [popupPosition, setPopupPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const reference = referenceDate ?? new Date();
    const timezoneMenu = useContext(TimezoneMenuContext);
    const homeZone = timezoneMenu?.primaryTimezone ?? LOCAL_ZONE;
    const displayLabel =
        timezoneMenu?.labels?.[LOCAL_ZONE] || offsetLabel(homeZone, reference);

    const options: TimezoneOption[] = useMemo(() => {
        const zones = listZones();
        const recentZones = (timezoneMenu?.recentTimezones ?? []).filter(
            (zone) => zones.includes(zone)
        );
        const recentSet = new Set(recentZones);
        return [
            ...recentZones.map((zone) => ({
                value: zone,
                label: richZoneLabel(zone, reference),
                recent: true,
            })),
            ...zones
                .filter((zone) => !recentSet.has(zone))
                .map((zone) => ({
                    value: zone,
                    label: richZoneLabel(zone, reference),
                })),
        ];
    }, [reference, timezoneMenu?.recentTimezones]);
    const filteredOptions = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        const matches = needle
            ? options.filter(
                  (option) =>
                      option.label.toLocaleLowerCase().includes(needle) ||
                      option.value.toLocaleLowerCase().includes(needle)
              )
            : options;
        return matches.slice(0, 80);
    }, [options, query]);
    const localMenuItems: ContextMenuItem[] = timezoneMenu
        ? [
              {
                  label: t("Change time zone"),
                  icon: <Globe2 size={15} />,
                  onClick: timezoneMenu.onChangeHome,
              },
              {
                  label: t("Rename"),
                  icon: <Pencil size={15} />,
                  onClick: () => timezoneMenu.onRename(LOCAL_ZONE),
              },
          ]
        : [];

    const togglePicker = () => {
        if (adding) {
            setAdding(false);
            setQuery("");
            return;
        }
        const bounds = buttonRef.current?.getBoundingClientRect();
        if (bounds) {
            setPopupPosition({ top: bounds.bottom + 4, left: bounds.left });
        }
        setAdding(true);
    };

    return (
        <div className="nc-tz-corner">
            <div
                ref={buttonRef}
                className="nc-tz-add"
                role="button"
                tabIndex={0}
                title={t("Add timezone")}
                onClick={togglePicker}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePicker();
                    }
                }}
            >
                <PlusIcon size={12} />
            </div>
            <span
                className="nc-tz-primary"
                role="button"
                tabIndex={0}
                title={LOCAL_ZONE}
                onClick={(event) => {
                    if (!timezoneMenu) return;
                    event.stopPropagation();
                    setLocalMenuPosition({
                        x: event.clientX,
                        y: event.clientY,
                    });
                }}
                onKeyDown={(event) => {
                    if (
                        !timezoneMenu ||
                        (event.key !== "Enter" && event.key !== " ")
                    ) {
                        return;
                    }
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setLocalMenuPosition({
                        x: bounds.left,
                        y: bounds.bottom,
                    });
                }}
            >
                {displayLabel}
            </span>
            <ContextMenu
                visible={localMenuPosition !== null}
                x={localMenuPosition?.x ?? 0}
                y={localMenuPosition?.y ?? 0}
                items={localMenuItems}
                onDismiss={() => setLocalMenuPosition(null)}
            />
            {adding &&
                onAddTimezone &&
                popupPosition &&
                ReactDOM.createPortal(
                    <div
                        className="nc-tz-picker-popup"
                        style={{
                            top: popupPosition.top,
                            left: popupPosition.left,
                        }}
                    >
                        <input
                            className="nc-tz-picker-input"
                            type="search"
                            value={query}
                            autoFocus
                            spellCheck={false}
                            placeholder="Time zone…"
                            onChange={(event) => setQuery(event.target.value)}
                            onBlur={() => setAdding(false)}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setAdding(false);
                            }}
                        />
                        <div className="nc-tz-picker-list" role="listbox">
                            {filteredOptions.map((option) => (
                                <button
                                    key={option.value}
                                    className="nc-tz-picker-option"
                                    type="button"
                                    role="option"
                                    aria-selected="false"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() => {
                                        onAddTimezone(option.value);
                                        setQuery("");
                                        setAdding(false);
                                    }}
                                >
                                    <span>{option.label}</span>
                                    {option.recent && (
                                        <span className="nc-tz-picker-recent">
                                            Recent
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
