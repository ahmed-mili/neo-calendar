import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import {
    currentWallpaperRuntime,
    getWallpaper,
    getWallpapersForRuntime,
    WallpaperDefinition,
    WallpaperId,
} from "./themes/wallpapers";
import { placeFlyout } from "../../../src/ui/calendar/flyoutPlacement";
import { t } from "../../../src/ui/i18n";

interface ThemeWallpaperPickerProps {
    value: WallpaperId;
    accent: string;
    surface: string;
    /** Applied the moment it is picked — there is nothing to confirm. */
    onChange: (value: WallpaperId) => void;
}

interface MenuPosition {
    top: number | null;
    bottom: number | null;
    left: number;
    width: number;
    maxHeight: number;
}

/** Espace entre le champ et le menu de bureau. */
const MENU_GAP = 6;
/** Marge minimale conservée contre le bord de l'écran. */
const MENU_MARGIN = 12;
/** En dessous de cette hauteur, le menu bascule au-dessus du champ. */
const MENU_MIN_HEIGHT = 200;
/** Un menu plus étroit que ça écraserait la vignette et son libellé. */
const MENU_MIN_WIDTH = 280;

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
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const current = getWallpaper(value);

    // Only what this screen can actually show. A landscape photo cropped to a
    // phone is a strip of its middle; a portrait one on a desktop is two bars.
    const runtime = currentWallpaperRuntime();
    const wallpapers = getWallpapersForRuntime(runtime);

    // La feuille modale plein écran est un geste de téléphone : sur PC le choix
    // se fait dans un menu ancré sous le champ, comme le sélecteur de thème et
    // celui de couleur du même panneau.
    const anchored = runtime === "pc";

    const updatePosition = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const placement = placeFlyout(rect, window.innerHeight, {
            gap: MENU_GAP,
            margin: MENU_MARGIN,
            minHeight: MENU_MIN_HEIGHT,
        });
        const width = Math.max(rect.width, MENU_MIN_WIDTH);

        setPosition({
            top: placement.top,
            bottom: placement.bottom,
            left: Math.max(
                MENU_MARGIN,
                Math.min(rect.left, window.innerWidth - width - MENU_MARGIN)
            ),
            width,
            maxHeight: placement.maxHeight,
        });
    }, []);

    // Le panneau de réglages défile : sans réancrage le menu resterait où le
    // champ était.
    useLayoutEffect(() => {
        if (!open || !anchored) return;
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [open, anchored, updatePosition]);

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

    const options = wallpapers.map((wallpaper) => (
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
                <Check size={18} className="nc-wallpaper-option__check" />
            )}
        </button>
    ));

    return (
        <div className="nc-theme-studio__row nc-theme-wallpaper-row">
            <span>Image de fond</span>
            <button
                ref={triggerRef}
                className="nc-wallpaper-picker__trigger"
                type="button"
                aria-haspopup="listbox"
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
                <ChevronDown
                    size={16}
                    className={open ? "nc-open" : undefined}
                />
            </button>

            {open &&
                anchored &&
                position &&
                createPortal(
                    <div
                        ref={menuRef}
                        className="nc-wallpaper-menu"
                        style={{
                            top: position.top ?? undefined,
                            bottom: position.bottom ?? undefined,
                            left: position.left,
                            width: position.width,
                            maxHeight: position.maxHeight,
                        }}
                        role="listbox"
                        aria-label={t("Wallpapers")}
                    >
                        {options}
                    </div>,
                    document.body
                )}

            {open &&
                !anchored &&
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
                            {options}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
