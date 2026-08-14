import React, { useEffect, useState } from "react";
import { Contrast, Droplets, Layers } from "lucide-react";
import {
    DEFAULT_WALLPAPER_EFFECTS,
    loadWallpaperEffects,
    resetWallpaperEffect,
    saveWallpaperEffects,
    WALLPAPER_EFFECTS_CHANGE_EVENT,
    WallpaperEffectKey,
    WallpaperEffects,
} from "./themes/wallpaperEffects";
import { SettingsSliderRow } from "./SettingsPrimitives";
import { t } from "../../../src/ui/i18n";

/*
 * Les trois réglages du fond, en lignes de réglage.
 *
 * Ils formaient une section à part — un en-tête, sa phrase d'explication, et
 * trois cartes bordées posées sous la fiche du thème — au milieu d'un écran qui
 * ne parle qu'en lignes. Ce sont des réglages comme les autres : ils prennent
 * la même ligne, dans le même bloc, sous le fond qu'ils ajustent.
 */

interface EffectDefinition {
    key: WallpaperEffectKey;
    label: string;
    icon: React.ReactNode;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
}

const EFFECTS: readonly EffectDefinition[] = [
    {
        key: "backgroundBrightness",
        label: t("Wallpaper brightness"),
        icon: <Contrast size={18} />,
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => value.toFixed(2),
    },
    {
        key: "backgroundBlur",
        label: t("Wallpaper blur"),
        icon: <Droplets size={18} />,
        min: 0,
        max: 20,
        step: 1,
        format: (value) => value.toFixed(0),
    },
    {
        key: "containerOpacity",
        label: t("Container opacity"),
        icon: <Layers size={18} />,
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => value.toFixed(2),
    },
];

export default function WallpaperEffectsControls() {
    const [effects, setEffects] = useState<WallpaperEffects>(() =>
        loadWallpaperEffects()
    );

    useEffect(() => {
        const onChange = (event: Event) => {
            const detail = (event as CustomEvent<WallpaperEffects>).detail;
            if (detail) setEffects(detail);
        };

        window.addEventListener(WALLPAPER_EFFECTS_CHANGE_EVENT, onChange);

        return () => {
            window.removeEventListener(
                WALLPAPER_EFFECTS_CHANGE_EVENT,
                onChange
            );
        };
    }, []);

    const update = (key: WallpaperEffectKey, value: number) => {
        setEffects(saveWallpaperEffects({ ...effects, [key]: value }));
    };

    return (
        <>
            {EFFECTS.map((effect) => (
                <SettingsSliderRow
                    key={effect.key}
                    label={effect.label}
                    icon={effect.icon}
                    value={effects[effect.key]}
                    defaultValue={DEFAULT_WALLPAPER_EFFECTS[effect.key]}
                    min={effect.min}
                    max={effect.max}
                    step={effect.step}
                    format={effect.format}
                    onChange={(value) => update(effect.key, value)}
                    onReset={() =>
                        setEffects(resetWallpaperEffect(effects, effect.key))
                    }
                />
            ))}
        </>
    );
}
