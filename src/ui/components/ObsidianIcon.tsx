import * as React from "react";
import {
    Cake,
    Circle,
    Copy,
    Flag,
    Gift,
    GraduationCap,
    Heart,
    Landmark,
    LucideIcon,
    MoonStar,
    PartyPopper,
    Star,
    Sun,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
    cake: Cake,
    copy: Copy,
    flag: Flag,
    gift: Gift,
    "graduation-cap": GraduationCap,
    heart: Heart,
    landmark: Landmark,
    "moon-star": MoonStar,
    "party-popper": PartyPopper,
    star: Star,
    sun: Sun,
};

/** Renders the supported Lucide icons by name in both Obsidian and Tauri. */
export function ObsidianIcon({
    name,
    size,
    className,
}: {
    name: string;
    size?: number;
    className?: string;
}) {
    const Icon = ICONS[name] ?? Circle;
    return (
        <span className={className} aria-hidden="true">
            <Icon size={size} />
        </span>
    );
}

/**
 * The icons offered for an auto calendar. Kept short on purpose: a picker of
 * 1500 Lucide names would be a worse experience than ten obvious ones.
 */
export const AUTO_CALENDAR_ICONS = [
    "flag",
    "party-popper",
    "cake",
    "gift",
    "sun",
    "moon-star",
    "star",
    "heart",
    "graduation-cap",
    "landmark",
];
