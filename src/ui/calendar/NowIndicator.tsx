import { useEffect, useState } from "react";
import { HOUR_HEIGHT } from "./CalendarUtils";

export interface NowPosition {
    top: number;
    label: string;
    now: Date;
}

export function useNowPosition(timeFormat24h: boolean): NowPosition {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const top = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
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
