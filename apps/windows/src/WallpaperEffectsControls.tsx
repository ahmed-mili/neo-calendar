import React, {
    useEffect,
    useState,
} from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
    DEFAULT_WALLPAPER_EFFECTS,
    loadWallpaperEffects,
    resetWallpaperEffect,
    saveWallpaperEffects,
    WALLPAPER_EFFECTS_CHANGE_EVENT,
    WallpaperEffectKey,
    WallpaperEffects,
} from "./themes/wallpaperEffects";

interface EffectDefinition {
    key: WallpaperEffectKey;
    label: string;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
}

const EFFECTS: readonly EffectDefinition[] = [
    {
        key: "backgroundBrightness",
        label: "Luminosité du fond",
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => value.toFixed(2),
    },
    {
        key: "backgroundBlur",
        label: "Flou du fond",
        min: 0,
        max: 20,
        step: 1,
        format: (value) => value.toFixed(0),
    },
    {
        key: "containerOpacity",
        label: "Opacité des conteneurs",
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => value.toFixed(2),
    },
];

export default function WallpaperEffectsControls() {
    const [effects, setEffects] =
        useState<WallpaperEffects>(
            () => loadWallpaperEffects()
        );

    useEffect(() => {
        const onChange = (event: Event) => {
            const detail = (
                event as CustomEvent<WallpaperEffects>
            ).detail;

            if (detail) {
                setEffects(detail);
            }
        };

        window.addEventListener(
            WALLPAPER_EFFECTS_CHANGE_EVENT,
            onChange
        );

        return () => {
            window.removeEventListener(
                WALLPAPER_EFFECTS_CHANGE_EVENT,
                onChange
            );
        };
    }, []);

    const update = (
        key: WallpaperEffectKey,
        value: number
    ) => {
        const next = saveWallpaperEffects({
            ...effects,
            [key]: value,
        });

        setEffects(next);
    };

    const reset = (key: WallpaperEffectKey) => {
        const next = resetWallpaperEffect(
            effects,
            key
        );

        setEffects(next);
    };

    return (
        <section className="nc-wallpaper-effects">
            <header className="nc-wallpaper-effects__header">
                <SlidersHorizontal size={17} />
                <span>
                    <strong>Ajustements du fond</strong>
                    <small>
                        L’aperçu et l’application se mettent à jour instantanément.
                    </small>
                </span>
            </header>

            <div className="nc-wallpaper-effects__rows">
                {EFFECTS.map((effect) => {
                    const value = effects[effect.key];
                    const defaultValue =
                        DEFAULT_WALLPAPER_EFFECTS[effect.key];
                    const isDefault =
                        Math.abs(value - defaultValue) < 0.0001;

                    return (
                        <label
                            className="nc-wallpaper-effect-row"
                            key={effect.key}
                        >
                            <span className="nc-wallpaper-effect-row__label">
                                <strong>{effect.label}</strong>
                                <small>
                                    Par défaut :{" "}
                                    {effect.format(defaultValue)}
                                </small>
                            </span>

                            <output>
                                {effect.format(value)}
                            </output>

                            <input
                                type="range"
                                min={effect.min}
                                max={effect.max}
                                step={effect.step}
                                value={value}
                                onChange={(event) =>
                                    update(
                                        effect.key,
                                        Number(event.target.value)
                                    )
                                }
                                aria-label={effect.label}
                            />

                            <button
                                type="button"
                                className="nc-wallpaper-effect-row__reset"
                                aria-label={`Réinitialiser ${effect.label}`}
                                title={`Réinitialiser ${effect.label}`}
                                disabled={isDefault}
                                onClick={(event) => {
                                    event.preventDefault();
                                    reset(effect.key);
                                }}
                            >
                                <RotateCcw size={17} />
                            </button>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}