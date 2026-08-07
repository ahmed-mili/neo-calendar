import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import {
    currentWallpaperRuntime,
    getWallpaper,
    getWallpapersForRuntime,
    WallpaperDefinition,
    WallpaperId,
} from "./themes/wallpapers";
import { t } from "../../../src/ui/i18n";

interface ThemeWallpaperPickerProps {
    value: WallpaperId;
    accent: string;
    surface: string;
    /** Applied the moment it is picked — there is nothing to confirm. */
    onChange: (value: WallpaperId) => void;
}

function WallpaperPreview({
    wallpaper,
    accent,
    surface,
    className = "",
}: {
    wallpaper: WallpaperDefinition;
    accent: string;
    surface: string;
    className?: string;
}) {
    const style: React.CSSProperties =
        wallpaper.previewStyle === "image" && wallpaper.imageUrl
            ? { backgroundImage: `url("${wallpaper.imageUrl}")` }
            : wallpaper.previewStyle === "theme"
            ? {
                  backgroundImage: `radial-gradient(circle at 72% 25%, ${accent}99, transparent 42%), linear-gradient(145deg, ${surface}, color-mix(in srgb, ${surface} 68%, ${accent}))`,
              }
            : { background: surface };

    return (
        <span
            className={[
                "nc-wallpaper-preview",
                `nc-wallpaper-preview--${wallpaper.previewStyle}`,
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            style={style}
            aria-hidden="true"
        />
    );
}

export default function ThemeWallpaperPicker({
    value,
    accent,
    surface,
    onChange,
}: ThemeWallpaperPickerProps) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const current = getWallpaper(value);

    // Only what this screen can actually show. A landscape photo cropped to a
    // phone is a strip of its middle; a portrait one on a desktop is two bars.
    const wallpapers = getWallpapersForRuntime(currentWallpaperRuntime());

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (
                !menuRef.current?.contains(target) &&
                !triggerRef.current?.contains(target)
            ) {
                setOpen(false);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <div className="nc-theme-studio__row nc-theme-wallpaper-row">
            <span>Image de fond</span>
            <button
                ref={triggerRef}
                className="nc-wallpaper-picker__trigger"
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((currentOpen) => !currentOpen)}
            >
                <WallpaperPreview
                    wallpaper={current}
                    accent={accent}
                    surface={surface}
                />
                <span>
                    <strong>{current.label}</strong>
                </span>
                <ChevronDown size={16} />
            </button>

            {open &&
                createPortal(
                    <div
                        className="nc-wallpaper-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("Wallpapers")}
                    >
                        <button
                            type="button"
                            className="nc-wallpaper-sheet__scrim"
                            aria-label={t("Close")}
                            onClick={() => setOpen(false)}
                        />
                        <div
                            ref={menuRef}
                            className="nc-wallpaper-sheet__panel"
                            role="listbox"
                            aria-label={t("Wallpapers")}
                        >
                            {wallpapers.map((wallpaper) => (
                                <button
                                    key={wallpaper.id}
                                    type="button"
                                    role="option"
                                    aria-selected={wallpaper.id === value}
                                    className="nc-wallpaper-option"
                                    onClick={() => {
                                        onChange(wallpaper.id);
                                        setOpen(false);
                                    }}
                                >
                                    <WallpaperPreview
                                        wallpaper={wallpaper}
                                        accent={accent}
                                        surface={surface}
                                        className="nc-wallpaper-option__image"
                                    />
                                    <span className="nc-wallpaper-option__label">
                                        {wallpaper.label}
                                    </span>
                                    {wallpaper.id === value && (
                                        <Check
                                            size={18}
                                            className="nc-wallpaper-option__check"
                                        />
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
