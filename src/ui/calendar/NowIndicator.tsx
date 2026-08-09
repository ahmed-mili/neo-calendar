import { useEffect, useState } from "react";
import { scaledPx } from "./CalendarUtils";

export interface NowPosition {
    /** A CSS length in hours, so the line follows a pinch without re-rendering. */
    top: string;
    label: string;
    now: Date;
}

export function useNowPosition(timeFormat24h: boolean): NowPosition {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const top = scaledPx(now.getHours() + now.getMinutes() / 60);
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const label = timeFormat24h
        ? `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}`
        : `${hours % 12 || 12}:${minutes.toString().padStart(2, "0")} ${
              hours < 12 ? "AM" : "PM"
          }`;

    return { top, label, now };
}
