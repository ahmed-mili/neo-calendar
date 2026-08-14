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
    ChevronRight,
    Download,
    Loader2,
    RotateCcw,
} from "lucide-react";
import {
    currentWallpaperRuntime,
    getWallpaper,
    getWallpapersForRuntime,
    WallpaperDefinition,
    WallpaperId,
} from "./themes/wallpapers";
import {
    ensureWallpaper,
    fileNameOf,
    installedFiles,
    needsDownloading,
    thumbUrlOf,
} from "./themes/wallpaperDownload";
import { SettingsDialog } from "./SettingsPrimitives";
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
    // La vignette, jamais la pleine résolution : à 23 Ko pièce, parcourir la
    // liste coûte quelques centaines de kilo-octets au lieu de dix mégaoctets,
    // et surtout la vignette est là même quand l'original ne l'est pas encore.
    const style: React.CSSProperties =
        wallpaper.previewStyle === "image" && wallpaper.imageUrl
            ? { backgroundImage: `url("${thumbUrlOf(wallpaper.imageUrl)}")` }
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

    // Sur Android les pleines résolutions ne sont plus dans l'APK : elles vivent
    // dans le dossier de données, et n'y arrivent que quand on les choisit.
    const remote = needsDownloading();
    const [installed, setInstalled] = useState<Set<string>>(installedFiles);
    const [busy, setBusy] = useState<WallpaperId | null>(null);
    const [failed, setFailed] = useState<WallpaperId | null>(null);

    // Le dossier appartient à l'utilisateur et survit à l'application : le
    // relire à chaque ouverture plutôt que de croire une liste d'une autre fois.
    useEffect(() => {
        if (open) setInstalled(installedFiles());
    }, [open]);

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
            // Fermer pendant un téléchargement laisserait l'utilisateur sans
            // rien à regarder alors que quelque chose se passe.
            if (busy) return;
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
            if (event.key !== "Escape" || busy) return;
            // Le panneau des réglages écoute Échap lui aussi : sans cela, une
            // seule pression fermait ce sélecteur ET reculait d'une page.
            event.stopPropagation();
            setOpen(false);
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, busy]);

    /** Ce fond est-il à aller chercher avant de pouvoir être appliqué ? */
    const missing = useCallback(
        (wallpaper: WallpaperDefinition) =>
            remote &&
            !!wallpaper.imageUrl &&
            !installed.has(fileNameOf(wallpaper.imageUrl)),
        [remote, installed]
    );

    /**
     * Choisir un fond, en le téléchargeant d'abord s'il n'est pas là.
     *
     * L'appliquer avant qu'il soit arrivé donnerait un fond vide le temps du
     * transfert, puis l'image d'un coup : on attend, et on le dit.
     */
    const pick = useCallback(
        async (wallpaper: WallpaperDefinition) => {
            if (busy) return;
            if (!wallpaper.imageUrl || !missing(wallpaper)) {
                onChange(wallpaper.id);
                setOpen(false);
                return;
            }

            setFailed(null);
            setBusy(wallpaper.id);
            try {
                await ensureWallpaper(wallpaper.imageUrl);
                setInstalled(installedFiles());
                onChange(wallpaper.id);
                setOpen(false);
            } catch {
                // Un nouvel appui relance : l'échec est presque toujours le
                // réseau, et redemander est la seule chose à faire.
                setFailed(wallpaper.id);
            } finally {
                setBusy(null);
            }
        },
        [busy, missing, onChange]
    );

    const options = wallpapers.map((wallpaper) => {
        const downloading = busy === wallpaper.id;
        const retry = failed === wallpaper.id;
        const selected = wallpaper.id === value;

        return (
            <button
                key={wallpaper.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-busy={downloading || undefined}
                disabled={!!busy && !downloading}
                className="nc-wallpaper-option"
                onClick={() => void pick(wallpaper)}
            >
                <WallpaperPreview
                    wallpaper={wallpaper}
                    accent={accent}
                    surface={surface}
                    className="nc-wallpaper-option__image"
                />
                <span className="nc-wallpaper-option__text">
                    <span className="nc-wallpaper-option__label">
                        {wallpaper.label}
                    </span>
                    {downloading && (
                        <span className="nc-wallpaper-option__note">
                            Téléchargement…
                        </span>
                    )}
                    {retry && !downloading && (
                        <span className="nc-wallpaper-option__note nc-wallpaper-option__note--failed">
                            Téléchargement impossible — appuyez pour réessayer
                        </span>
                    )}
                    {!downloading && !retry && missing(wallpaper) && (
                        <span className="nc-wallpaper-option__note">
                            À télécharger
                        </span>
                    )}
                </span>
                {downloading ? (
                    <Loader2 size={18} className="nc-wallpaper-option__spin" />
                ) : retry ? (
                    <RotateCcw
                        size={18}
                        className="nc-wallpaper-option__failed"
                    />
                ) : selected ? (
                    <Check size={18} className="nc-wallpaper-option__check" />
                ) : missing(wallpaper) ? (
                    <Download size={16} className="nc-wallpaper-option__get" />
                ) : null}
            </button>
        );
    });

    return (
        <>
            {/* Une ligne de réglage comme les autres : la vignette du fond
                choisi tient la place de l'icône, et son nom celle de la
                valeur. */}
            <button
                ref={triggerRef}
                className="nc-set-row nc-set-row--action"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((currentOpen) => !currentOpen)}
            >
                <span className="nc-set-row__icon nc-set-row__icon--thumb">
                    <WallpaperPreview
                        wallpaper={current}
                        accent={accent}
                        surface={surface}
                        className="nc-set-row__thumb"
                    />
                </span>
                <span className="nc-set-row__label">{t("Wallpaper")}</span>
                <span className="nc-set-row__value">{current.label}</span>
                <span className="nc-set-row__trailing">
                    <ChevronRight size={18} />
                </span>
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

            {/* Sur téléphone, le même panneau que tous les autres sous-menus.
                C'était une feuille à part : pas de titre, pas de flou derrière,
                des lignes deux fois plus hautes — un troisième dessin dans un
                écran qui n'en veut qu'un. */}
            {open && !anchored && (
                <SettingsDialog
                    title={t("Wallpapers")}
                    onClose={() => {
                        if (!busy) setOpen(false);
                    }}
                >
                    <div
                        ref={menuRef}
                        className="nc-wallpaper-options"
                        role="listbox"
                        aria-label={t("Wallpapers")}
                    >
                        {options}
                    </div>
                </SettingsDialog>
            )}
        </>
    );
}
