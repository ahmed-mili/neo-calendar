import * as React from "react";
import { ArrowLeft, Globe2, Pencil, Trash2 } from "lucide-react";
import { DateTime } from "luxon";
import { HOUR_HEIGHT } from "./CalendarUtils";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import { t } from "../i18n";

/** Actions for the timezone context menu, provided by CalendarApp via context. */
export interface TimezoneMenuActions {
    labels: Record<string, string>;
    primaryTimezone?: string;
    recentTimezones: string[];
    onRemoveRecent: (tz: string) => void;
    onChange: (tz: string) => void;
    onRename: (tz: string) => void;
    onMakePrimary: (tz: string) => void;
    onRemove: (tz: string) => void;
    onChangeHome: () => void;
}

export const TimezoneMenuContext =
    React.createContext<TimezoneMenuActions | null>(null);

interface TimezoneColumnHeaderProps {
    timezone: string;
    referenceDate: Date;
}

/** Offset label and platform-neutral React menu for a secondary timezone. */
export function TimezoneColumnHeader({
    timezone,
    referenceDate,
}: TimezoneColumnHeaderProps) {
    const menu = React.useContext(TimezoneMenuContext);
    const [menuPosition, setMenuPosition] = React.useState<{
        x: number;
        y: number;
    } | null>(null);
    const label =
        menu?.labels?.[timezone] ||
        DateTime.fromJSDate(referenceDate).setZone(timezone).toFormat("ZZZZ");
    const items: ContextMenuItem[] = menu
        ? [
              {
                  label: t("Change time zone"),
                  icon: <Globe2 size={15} />,
                  onClick: () => menu.onChange(timezone),
              },
              {
                  label: t("Rename"),
                  icon: <Pencil size={15} />,
                  onClick: () => menu.onRename(timezone),
              },
              {
                  label: "Make time zone primary",
                  icon: <ArrowLeft size={15} />,
                  onClick: () => menu.onMakePrimary(timezone),
              },
              { separator: true, label: "", onClick: () => {} },
              {
                  label: "Remove time zone from list",
                  icon: <Trash2 size={15} />,
                  danger: true,
                  onClick: () => menu.onRemove(timezone),
              },
          ]
        : [];

    return (
        <div
            className="nc-tz-corner-cell nc-tz-corner-btn"
            title={timezone}
            role="button"
            tabIndex={0}
            onClick={(event) => {
                if (!menu) return;
                event.stopPropagation();
                setMenuPosition({ x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
                if (!menu || (event.key !== "Enter" && event.key !== " ")) {
                    return;
                }
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setMenuPosition({ x: rect.left, y: rect.bottom });
            }}
        >
            <span className="nc-tz-corner-label">{label}</span>
            <ContextMenu
                visible={menuPosition !== null}
                x={menuPosition?.x ?? 0}
                y={menuPosition?.y ?? 0}
                items={items}
                onDismiss={() => setMenuPosition(null)}
            />
        </div>
    );
}

interface TimezoneColumnProps {
    timezone: string;
    timeFormat24h: boolean;
    referenceDate: Date;
    showNow?: boolean;
    nowTop?: number;
    now?: Date;
}

/** Hours-only column for a secondary timezone. */
export default function TimezoneColumn({
    timezone,
    timeFormat24h,
    referenceDate,
    showNow,
    nowTop,
    now,
}: TimezoneColumnProps) {
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const nowLabel =
        showNow && now
            ? (() => {
                  const date = DateTime.fromJSDate(now).setZone(timezone);
                  return timeFormat24h
                      ? date.toFormat("HH:mm")
                      : `${date.hour % 12 || 12}:${String(date.minute).padStart(
                            2,
                            "0"
                        )} ${date.hour < 12 ? "AM" : "PM"}`;
              })()
            : null;

    return (
        <div className="nc-tz-column">
            {hours.map((hour) => {
                if (hour === 0) return null;
                const zoneTime = DateTime.fromJSDate(referenceDate)
                    .set({ hour, minute: 0, second: 0, millisecond: 0 })
                    .setZone(timezone);
                const label = timeFormat24h
                    ? zoneTime.toFormat("HH:mm")
                    : zoneTime.toFormat("h a");
                return (
                    <div
                        key={hour}
                        className="nc-tz-label"
                        style={{ top: hour * HOUR_HEIGHT }}
                    >
                        {label}
                    </div>
                );
            })}
            {nowLabel !== null && nowTop !== undefined && (
                <div className="nc-now-label" style={{ top: nowTop }}>
                    {nowLabel}
                </div>
            )}
        </div>
    );
}
