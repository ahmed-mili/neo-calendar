import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    parseColor,
    rgbToHex as rgbToHexObj,
    FALLBACK_COLOR,
} from "../../utils/color";
import { swallowNextClick } from "./swallowNextClick";

// ── Colour maths (hex ↔ rgb ↔ hsv) ─────────────────────────────

// Le parsing vit dans utils/color : la version locale ne lisait que le hex et
// retombait sur son violet de secours des que la couleur arrivait en `rgb(...)`
// — la forme que prend la couleur d'accent du theme.
function hexToRgb(css: string): { r: number; g: number; b: number } {
    return parseColor(css) ?? parseColor(FALLBACK_COLOR)!;
}

function rgbToHex(r: number, g: number, b: number): string {
    return rgbToHexObj({ r, g, b });
}

function rgbToHsv(
    r: number,
    g: number,
    b: number
): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
}

function hsvToRgb(
    h: number,
    s: number,
    v: number
): { r: number; g: number; b: number } {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0,
        g = 0,
        b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// Preset palette: Notion Calendar's own colours (sampled from the app) plus a
// few complementary hues. Two rows of six, so the grid never overflows the
// picker the way the old 14-swatch / 7-column layout did.
const PRESETS = [
    // Row 1 — warm-to-cool spectrum
    "#ed201d", // red    (Notion)
    "#fd7941", // orange (Notion)
    "#f4be40", // yellow (Notion)
    "#5ecc89", // green  (Notion)
    "#33b5b5", // teal
    "#4ca8df", // blue   (Notion)
    // Row 2 — spectrum end + neutrals
    "#6c6fe8", // indigo
    "#985df6", // purple (Notion)
    "#f45d9e", // pink
    "#b07d53", // brown
    "#b8b8b8", // grey   (Notion)
    "#6b7684", // slate
];

const PICKER_W = 232;
const PICKER_H = 300;

interface ColorPickerProps {
    color: string;
    anchorRect: DOMRect;
    onChange: (hex: string) => void;
    onClose: () => void;
}

export default function ColorPicker({
    color,
    anchorRect,
    onChange,
    onClose,
}: ColorPickerProps) {
    const rootRef = React.useRef<HTMLDivElement>(null);
    const svRef = React.useRef<HTMLDivElement>(null);
    const hueRef = React.useRef<HTMLDivElement>(null);

    const initial = React.useMemo(() => {
        const { r, g, b } = hexToRgb(color);
        return rgbToHsv(r, g, b);
    }, [color]);

    const [h, setH] = React.useState(initial.h);
    const [s, setS] = React.useState(initial.s);
    const [v, setV] = React.useState(initial.v);
    const [hexText, setHexText] = React.useState(color);

    // Emit the current colour upward (live preview on the calendar).
    const emit = React.useCallback(
        (hh: number, ss: number, vv: number) => {
            const { r, g, b } = hsvToRgb(hh, ss, vv);
            const hex = rgbToHex(r, g, b);
            setHexText(hex);
            onChange(hex);
        },
        [onChange]
    );

    // ── Position (portaled, clamped to viewport) ────────────────
    const pos = React.useMemo(() => {
        let top = anchorRect.bottom + 6;
        if (top + PICKER_H > window.innerHeight - 8)
            top = Math.max(8, anchorRect.top - PICKER_H - 6);
        let left = anchorRect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - 8 - PICKER_W));
        return { top, left };
    }, [anchorRect]);

    // ── Dismiss on outside click / Escape ───────────────────────
    React.useEffect(() => {
        const onDown = (e: Event) => {
            if (rootRef.current?.contains(e.target as Node)) return;
            onClose();
            /*
             * The tap that dismisses the picker must not also press what was
             * behind it. Closing happens on the press, and the same tap then
             * delivers a click to whatever the picker was covering — the
             * calendar row, whose tap sets the default calendar. So changing a
             * colour and tapping away silently moved the default, which is
             * exactly what the swatch is arranged not to do.
             *
             * The guard outlives this effect on purpose: closing unmounts the
             * picker, so a guard torn down with it would be gone before the
             * click it exists to eat. It disarms itself.
             */
            swallowNextClick();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        // Pointer events, not mouse events: the grid cancels its `pointerdown`,
        // which suppresses the compatibility mouse events, so a press on the
        // calendar never produces a `mousedown` to dismiss on.
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    // ── Drag handling for the SV box and hue slider ─────────────
    const dragSV = (e: React.PointerEvent) => {
        const box = svRef.current;
        if (!box) return;
        const move = (clientX: number, clientY: number) => {
            const r = box.getBoundingClientRect();
            const ns = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
            const nv = Math.max(
                0,
                Math.min(1, 1 - (clientY - r.top) / r.height)
            );
            setS(ns);
            setV(nv);
            emit(h, ns, nv);
        };
        move(e.clientX, e.clientY);
        // Pointeur et non souris : une tape produit encore un evenement souris
        // de compatibilite, mais un glissement du doigt n'en produit aucun. Un
        // seul chemin couvre alors la souris, le doigt et le stylet.
        const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    };

    const dragHue = (e: React.PointerEvent) => {
        const bar = hueRef.current;
        if (!bar) return;
        const move = (clientX: number) => {
            const r = bar.getBoundingClientRect();
            const nh = Math.max(
                0,
                Math.min(360, ((clientX - r.left) / r.width) * 360)
            );
            setH(nh);
            emit(nh, s, v);
        };
        move(e.clientX);
        const onMove = (ev: PointerEvent) => move(ev.clientX);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    };

    const applyHex = (hex: string) => {
        const clean = hex.startsWith("#") ? hex : `#${hex}`;
        if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) return;
        const { r, g, b } = hexToRgb(clean);
        const hsv = rgbToHsv(r, g, b);
        setH(hsv.h);
        setS(hsv.s);
        setV(hsv.v);
        onChange(rgbToHex(r, g, b));
    };

    const pickPreset = (hex: string) => {
        setHexText(hex);
        applyHex(hex);
    };

    const hueColor = `hsl(${h}, 100%, 50%)`;

    return ReactDOM.createPortal(
        <div
            ref={rootRef}
            className="nc-color-picker"
            style={{ top: pos.top, left: pos.left, width: PICKER_W }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Saturation / value box */}
            <div
                ref={svRef}
                className="nc-cp-sv"
                onPointerDown={dragSV}
                style={{
                    background: `linear-gradient(to bottom, rgba(0,0,0,0), #000), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${hueColor}`,
                }}
            >
                <span
                    className="nc-cp-sv-thumb"
                    style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
                />
            </div>

            {/* Hue slider */}
            <div ref={hueRef} className="nc-cp-hue" onPointerDown={dragHue}>
                <span
                    className="nc-cp-hue-thumb"
                    style={{ left: `${(h / 360) * 100}%` }}
                />
            </div>

            {/* Hex input + current swatch */}
            <div className="nc-cp-row">
                <span
                    className="nc-cp-current"
                    style={{ background: hexText }}
                />
                <input
                    className="nc-cp-hex"
                    value={hexText}
                    spellCheck={false}
                    onChange={(e) => {
                        setHexText(e.target.value);
                        applyHex(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") onClose();
                    }}
                />
            </div>

            {/* Presets */}
            <div className="nc-cp-presets">
                {PRESETS.map((p) => (
                    <button
                        key={p}
                        type="button"
                        className="nc-cp-preset"
                        style={{ background: p }}
                        aria-label={p}
                        data-nc-tooltip={p}
                        onClick={() => pickPreset(p)}
                    />
                ))}
            </div>
        </div>,
        document.body
    );
}
