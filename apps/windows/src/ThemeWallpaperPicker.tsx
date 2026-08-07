import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    Check,
    ChevronDown,
    Image as ImageIcon,
    ImageOff,
    Monitor,
    Smartphone,
    Sparkles,
    X,
} from "lucide-react";
import {
    getWallpaper,
    getWallpapersForTarget,
    isAndroidRuntime,
    WallpaperDefinition,
    WallpaperId,
    WallpaperTarget,
} from "./themes/wallpapers";

interface ThemeWallpaperPickerProps {
    value: WallpaperId;
    accent: string;
    surface: string;
    onChange: (value: WallpaperId) => void;
}

const MENU_WIDTH = 620;
const MENU_HEIGHT = 690;

function targetLabel(target: WallpaperTarget): string {
    if (target === "android") return "ANDROID";
    if (target === "pc") return "PC";
    return "TOUS ÉCRANS";
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
            ? {
                  backgroundImage: `linear-gradient(rgba(8, 10, 22, .12), rgba(8, 10, 22, .38)), url("${wallpaper.imageUrl}")`,
              }
            : wallpaper.previewStyle === "theme"
              ? {
                    backgroundImage: `radial-gradient(circle at 72% 22%, ${accent}88, transparent 38%), linear-gradient(145deg, ${surface}, color-mix(in srgb, ${surface} 72%, ${accent}))`,
                }
              : { backgroundColor: surface };

    return (
        <span
            className={[
                "nc-wallpaper-preview",
                `nc-wallpaper-preview--${wallpaper.previewStyle}`,
                `nc-wallpaper-preview--${wallpaper.aspect}`,
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            style={style}
            aria-hidden="true"
        >
            {wallpaper.previewStyle === "solid" ? (
                <ImageOff size={18} />
            ) : wallpaper.previewStyle === "theme" ? (
                <Sparkles size={18} />
            ) : (
                <ImageIcon size={18} />
            )}
        </span>
    );
}

function WallpaperCard({
    wallpaper,
    selected,
    accent,
    surface,
    onSelect,
}: {
    wallpaper: WallpaperDefinition;
    selected: boolean;
    accent: string;
    surface: string;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
            className={`nc-wallpaper-card nc-wallpaper-card--${wallpaper.target}`}
            onClick={onSelect}
        >
            <WallpaperPreview
                wallpaper={wallpaper}
                accent={accent}
                surface={surface}
                className="nc-wallpaper-card__image"
            />
            <span
                className={`nc-wallpaper-card__badge nc-wallpaper-card__badge--${wallpaper.target}`}
            >
                {targetLabel(wallpaper.target)}
            </span>
            {selected && (
                <span className="nc-wallpaper-card__selected">
                    <Check size={18} />
                </span>
            )}
            <span className="nc-wallpaper-card__copy">
                <strong>{wallpaper.label}</strong>
                <small>{wallpaper.description}</small>
            </span>
        </button>
    );
}

function WallpaperSection({
    title,
    description,
    target,
    wallpapers,
    selectedId,
    accent,
    surface,
    onSelect,
}: {
    title: string;
    description: string;
    target: WallpaperTarget;
    wallpapers: readonly WallpaperDefinition[];
    selectedId: WallpaperId;
    accent: string;
    surface: string;
    onSelect: (wallpaper: WallpaperDefinition) => void;
}) {
    const Icon =
        target === "android"
            ? Smartphone
            : target === "pc"
              ? Monitor
              : Sparkles;

    return (
        <section
            className={`nc-wallpaper-library__section nc-wallpaper-library__section--${target}`}
        >
            <header className="nc-wallpaper-library__section-header">
                <Icon size={20} />
                <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                </span>
            </header>
            <div
                className={`nc-wallpaper-library__grid nc-wallpaper-library__grid--${target}`}
                role="listbox"
                aria-label={title}
            >
                {wallpapers.map((wallpaper) => (
                    <WallpaperCard
                        key={wallpaper.id}
                        wallpaper={wallpaper}
                        selected={wallpaper.id === selectedId}
                        accent={accent}
                        surface={surface}
                        onSelect={() => onSelect(wallpaper)}
                    />
                ))}
            </div>
        </section>
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
    const [mobileLayout, setMobileLayout] = useState(
        () =>
            isAndroidRuntime() ||
            (typeof window !== "undefined" &&
                window.innerWidth <= 760)
    );
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const current = getWallpaper(value);

    const androidWallpapers = getWallpapersForTarget("android");
    const pcWallpapers = getWallpapersForTarget("pc");
    const universalWallpapers = getWallpapersForTarget("universal");

    const updatePosition = useCallback(() => {
        const nextMobile =
            isAndroidRuntime() || window.innerWidth <= 760;

        setMobileLayout(nextMobile);

        if (nextMobile) {
            setPosition({ top: 0, left: 0 });
            return;
        }

        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const padding = 12;
        let top = rect.bottom + 8;

        if (top + MENU_HEIGHT > window.innerHeight - padding) {
            top = Math.max(
                padding,
                window.innerHeight - MENU_HEIGHT - padding
            );
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

        document.addEventListener(
            "pointerdown",
            onPointerDown,
            true
        );
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener(
                "pointerdown",
                onPointerDown,
                true
            );
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const selectWallpaper = (wallpaper: WallpaperDefinition) => {
        onChange(wallpaper.id);
        setOpen(false);
    };

    const heroStyle: React.CSSProperties =
        current.previewStyle === "image" && current.imageUrl
            ? {
                  backgroundImage: `linear-gradient(rgba(5, 8, 24, .18), rgba(5, 8, 24, .58)), url("${current.imageUrl}")`,
              }
            : current.previewStyle === "theme"
              ? {
                    backgroundImage: `radial-gradient(circle at 72% 25%, ${accent}99, transparent 42%), linear-gradient(145deg, ${surface}, color-mix(in srgb, ${surface} 68%, ${accent}))`,
                }
              : {
                    background: surface,
                };

    return (
        <div className="nc-theme-studio__row nc-theme-wallpaper-row">
            <span>Image de fond</span>
            <button
                ref={triggerRef}
                className="nc-wallpaper-picker__trigger"
                type="button"
                aria-expanded={open}
                onClick={() =>
                    setOpen((currentOpen) => !currentOpen)
                }
            >
                <WallpaperPreview
                    wallpaper={current}
                    accent={accent}
                    surface={surface}
                />
                <span>
                    <strong>{current.label}</strong>
                    <small>
                        {targetLabel(current.target)} ·{" "}
                        {current.description}
                    </small>
                </span>
                <ChevronDown size={16} />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        className={[
                            "nc-wallpaper-picker__menu",
                            mobileLayout
                                ? "nc-wallpaper-picker__menu--mobile"
                                : "nc-wallpaper-picker__menu--desktop",
                        ].join(" ")}
                        style={{
                            top: position.top,
                            left: position.left,
                        }}
                        role="dialog"
                        aria-modal={mobileLayout}
                        aria-label="Bibliothèque de fonds d'écran"
                    >
                        <header className="nc-wallpaper-library__topbar">
                            <span>
                                <strong>Fonds d'écran</strong>
                                <small>
                                    Choisis un fond pour Neo Calendar.
                                </small>
                            </span>
                            <button
                                type="button"
                                aria-label="Fermer"
                                onClick={() => setOpen(false)}
                            >
                                <X size={20} />
                            </button>
                        </header>

                        <div className="nc-wallpaper-library__scroll">
                            <div
                                className="nc-wallpaper-library__hero"
                                style={heroStyle}
                            >
                                <span className="nc-wallpaper-library__hero-badge">
                                    APERÇU
                                </span>
                                <div className="nc-wallpaper-library__hero-calendar">
                                    <span>
                                        <small>Neo Calendar</small>
                                        <strong>21</strong>
                                        <em>Mercredi</em>
                                    </span>
                                    <div>
                                        <small>10:00</small>
                                        <strong>Réunion d'équipe</strong>
                                        <small>14:00 · Revue produit</small>
                                    </div>
                                </div>
                            </div>

                            <WallpaperSection
                                title="Fonds Android"
                                description="Optimisés pour les écrans verticaux mobiles"
                                target="android"
                                wallpapers={androidWallpapers}
                                selectedId={value}
                                accent={accent}
                                surface={surface}
                                onSelect={selectWallpaper}
                            />

                            <WallpaperSection
                                title="Fonds PC"
                                description="Optimisés pour les écrans larges et le bureau"
                                target="pc"
                                wallpapers={pcWallpapers}
                                selectedId={value}
                                accent={accent}
                                surface={surface}
                                onSelect={selectWallpaper}
                            />

                            <WallpaperSection
                                title="Options générales"
                                description="Réglages compatibles avec tous les appareils"
                                target="universal"
                                wallpapers={universalWallpapers}
                                selectedId={value}
                                accent={accent}
                                surface={surface}
                                onSelect={selectWallpaper}
                            />
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}