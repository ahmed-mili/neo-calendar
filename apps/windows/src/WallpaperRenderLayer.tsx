import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import {
    loadWallpaperEffects,
    WALLPAPER_EFFECTS_CHANGE_EVENT,
    WallpaperEffects,
} from "./themes/wallpaperEffects";
import { getWallpaper, WallpaperId } from "./themes/wallpapers";
import { useWallpaperReady } from "./themes/useWallpaperReady";

interface WallpaperRenderLayerProps {
    wallpaperId: WallpaperId | string;
    appearanceMode: string;
    surface: string;
}

function readThemeWallpaper(): string {
    const roots: Element[] = [
        document.documentElement,
        document.body,
        document.querySelector(".nc-desktop--calendar") as Element,
    ].filter(Boolean);

    for (const root of roots) {
        const value = window
            .getComputedStyle(root)
            .getPropertyValue("--nc-wallpaper")
            .trim();

        if (value && value.toLowerCase() !== "none") {
            return value;
        }
    }

    return "none";
}

export default function WallpaperRenderLayer({
    wallpaperId,
    appearanceMode,
    surface,
}: WallpaperRenderLayerProps) {
    const [effects, setEffects] = useState<WallpaperEffects>(() =>
        loadWallpaperEffects()
    );

    const [themeWallpaper, setThemeWallpaper] = useState("none");

    const wallpaper = getWallpaper(wallpaperId);

    // Sur Android la photo vit dans le dossier de données, pas dans l'APK :
    // tant qu'elle n'y est pas, on peint le fond du thème.
    const ready = useWallpaperReady(wallpaper.imageUrl);

    useEffect(() => {
        const onEffectsChange = (event: Event) => {
            const detail = (event as CustomEvent<WallpaperEffects>).detail;

            if (detail) {
                setEffects(detail);
            }
        };

        window.addEventListener(
            WALLPAPER_EFFECTS_CHANGE_EVENT,
            onEffectsChange
        );

        return () => {
            window.removeEventListener(
                WALLPAPER_EFFECTS_CHANGE_EVENT,
                onEffectsChange
            );
        };
    }, []);

    useLayoutEffect(() => {
        const sync = () => {
            setThemeWallpaper(readThemeWallpaper());
        };

        sync();

        const first = window.requestAnimationFrame(sync);

        const timer = window.setTimeout(sync, 250);

        return () => {
            window.cancelAnimationFrame(first);

            window.clearTimeout(timer);
        };
    }, [wallpaperId, appearanceMode, surface]);

    useEffect(() => {
        document.getElementById("nc-android-wallpaper-filter-layer")?.remove();
    }, []);

    const backgroundImage = useMemo(() => {
        if (wallpaper.previewStyle === "solid") {
            return "none";
        }

        const overlay =
            appearanceMode === "light"
                ? "linear-gradient(rgba(255,255,255,.16), rgba(255,255,255,.16))"
                : `linear-gradient(color-mix(in srgb, ${surface} 16%, transparent), color-mix(in srgb, ${surface} 24%, transparent))`;

        const image =
            wallpaper.previewStyle === "image" && wallpaper.imageUrl && ready
                ? `url("${wallpaper.imageUrl}")`
                : themeWallpaper;

        return image && image.toLowerCase() !== "none"
            ? `${overlay}, ${image}`
            : "none";
    }, [
        appearanceMode,
        ready,
        surface,
        themeWallpaper,
        wallpaper.imageUrl,
        wallpaper.previewStyle,
    ]);

    if (typeof document === "undefined" || !document.body) {
        return null;
    }

    return ReactDOM.createPortal(
        <div
            id="nc-wallpaper-render-layer"
            aria-hidden="true"
            data-brightness={effects.backgroundBrightness.toFixed(2)}
            data-blur={effects.backgroundBlur.toFixed(0)}
            style={{
                backgroundColor: surface,
                backgroundImage,
                filter:
                    `brightness(${effects.backgroundBrightness}) ` +
                    `blur(${effects.backgroundBlur}px)`,
            }}
        />,
        document.body
    );
}
