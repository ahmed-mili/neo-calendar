import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Image as ImageIcon, ImageOff } from "lucide-react";
import {
    getWallpaper,
    WALLPAPERS,
    WallpaperDefinition,
    WallpaperId,
} from "./themes/wallpapers";

interface ThemeWallpaperPickerProps {
    value: WallpaperId;
    accent: string;
    surface: string;
    onChange: (value: WallpaperId) => void;
}

const MENU_WIDTH = 390;
const MENU_HEIGHT = 310;

function WallpaperPreview({
    wallpaper,
    accent,
    surface,
}: {
    wallpaper: WallpaperDefinition;
    accent: string;
    surface: string;
}) {
    const style: React.CSSProperties =
        wallpaper.previewStyle === "image" && wallpaper.imageUrl
            ? {
                  backgroundImage: `linear-gradient(rgba(8, 10, 22, .18), rgba(8, 10, 22, .42)), url("${wallpaper.imageUrl}")`,
              }
            : wallpaper.previewStyle === "theme"
              ? {
                    backgroundImage: `radial-gradient(circle at 72% 22%, ${accent}88, transparent 38%), linear-gradient(145deg, ${surface}, color-mix(in srgb, ${surface} 72%, ${accent}))`,
                }
              : { backgroundColor: surface };

    return (
        <span
            className={`nc-wallpaper-preview nc-wallpaper-preview--${wallpaper.previewStyle}`}
            style={style}
            aria-hidden="true"
        >
            {wallpaper.previewStyle === "solid" ? (
                <ImageOff size={18} />
            ) : (
                <ImageIcon size={18} />
            )}
        </span>
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
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const current = getWallpaper(value);

    const updatePosition = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const padding = 12;
        let top = rect.bottom + 8;
        if (top + MENU_HEIGHT > window.innerHeight - padding) {
            top = Math.max(padding, rect.top - MENU_HEIGHT - 8);
        }
        const left = Math.max(
            padding,
            Math.min(
                rect.right - MENU_WIDTH,
                window.innerWidth - MENU_WIDTH - padding
            )
        );
        setPosition({ top, left });
    }, []);

    useLayoutEffect(() => {
        if (!open) return;
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [open, updatePosition]);

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
                    <small>{current.description}</small>
                </span>
                <ChevronDown size={16} />
            </button>
            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        className="nc-wallpaper-picker__menu"
                        style={{ top: position.top, left: position.left }}
                        role="listbox"
                        aria-label="Choisir l’image de fond"
                    >
                        <header>
                            <strong>Image de fond</strong>
                            <small>
                                Les nouvelles images ajoutées à Neo Calendar
                                apparaîtront automatiquement ici.
                            </small>
                        </header>
                        <div className="nc-wallpaper-picker__options">
                            {WALLPAPERS.map((wallpaper) => {
                                const selected = wallpaper.id === value;
                                return (
                                    <button
                                        key={wallpaper.id}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => {
                                            onChange(wallpaper.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <WallpaperPreview
                                            wallpaper={wallpaper}
                                            accent={accent}
                                            surface={surface}
                                        />
                                        <span>
                                            <strong>{wallpaper.label}</strong>
                                            <small>
                                                {wallpaper.description}
                                            </small>
                                        </span>
                                        {selected && <Check size={17} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
