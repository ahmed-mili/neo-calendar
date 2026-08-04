import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

interface ThemeColorPickerProps {
    label: string;
    value: string;
    emphasized?: boolean;
    onChange: (value: string) => void;
}

interface HsvColor {
    h: number;
    s: number;
    v: number;
}

const PRESET_COLORS = [
    "#F15550",
    "#FF8A4C",
    "#E6B450",
    "#70BF56",
    "#449DAB",
    "#3264FF",
    "#7AA2F7",
    "#9D7CD8",
    "#EA9A97",
    "#D4D4D4",
    "#565F89",
    "#1E1E1E",
] as const;

const PICKER_WIDTH = 272;
const PICKER_HEIGHT = 346;

function clamp(value: number, minimum = 0, maximum = 1): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function isHex(value: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
    const safe = isHex(value) ? value.slice(1) : "000000";
    return {
        r: Number.parseInt(safe.slice(0, 2), 16),
        g: Number.parseInt(safe.slice(2, 4), 16),
        b: Number.parseInt(safe.slice(4, 6), 16),
    };
}

function rgbToHex(r: number, g: number, b: number): string {
    const part = (value: number) =>
        Math.round(clamp(value, 0, 255))
            .toString(16)
            .padStart(2, "0");
    return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): HsvColor {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const maximum = Math.max(rr, gg, bb);
    const minimum = Math.min(rr, gg, bb);
    const delta = maximum - minimum;
    let hue = 0;

    if (delta !== 0) {
        if (maximum === rr) hue = 60 * (((gg - bb) / delta) % 6);
        else if (maximum === gg) hue = 60 * ((bb - rr) / delta + 2);
        else hue = 60 * ((rr - gg) / delta + 4);
    }

    if (hue < 0) hue += 360;
    return {
        h: hue,
        s: maximum === 0 ? 0 : delta / maximum,
        v: maximum,
    };
}

function hsvToRgb({ h, s, v }: HsvColor): {
    r: number;
    g: number;
    b: number;
} {
    const chroma = v * s;
    const section = h / 60;
    const x = chroma * (1 - Math.abs((section % 2) - 1));
    const match = v - chroma;
    let rgb: [number, number, number];

    if (section < 1) rgb = [chroma, x, 0];
    else if (section < 2) rgb = [x, chroma, 0];
    else if (section < 3) rgb = [0, chroma, x];
    else if (section < 4) rgb = [0, x, chroma];
    else if (section < 5) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];

    return {
        r: (rgb[0] + match) * 255,
        g: (rgb[1] + match) * 255,
        b: (rgb[2] + match) * 255,
    };
}

function hexToHsv(value: string): HsvColor {
    const rgb = hexToRgb(value);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

export default function ThemeColorPicker({
    label,
    value,
    emphasized = false,
    onChange,
}: ThemeColorPickerProps) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const saturationRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);
    const saturationDragging = useRef(false);
    const hueDragging = useRef(false);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const safeColor = isHex(value) ? value.toUpperCase() : "#000000";
    const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(safeColor));

    useEffect(() => {
        if (isHex(value)) setHsv(hexToHsv(value));
    }, [value]);

    const updatePosition = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const viewportPadding = 12;
        let top = rect.bottom + 8;
        if (top + PICKER_HEIGHT > window.innerHeight - viewportPadding) {
            top = Math.max(viewportPadding, rect.top - PICKER_HEIGHT - 8);
        }
        const left = Math.max(
            viewportPadding,
            Math.min(
                rect.right - PICKER_WIDTH,
                window.innerWidth - PICKER_WIDTH - viewportPadding
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
                !popoverRef.current?.contains(target) &&
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

    const emitHsv = useCallback(
        (next: HsvColor) => {
            setHsv(next);
            const rgb = hsvToRgb(next);
            onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
        },
        [onChange]
    );

    const updateSaturation = (clientX: number, clientY: number) => {
        const rect = saturationRef.current?.getBoundingClientRect();
        if (!rect) return;
        emitHsv({
            ...hsv,
            s: clamp((clientX - rect.left) / rect.width),
            v: clamp(1 - (clientY - rect.top) / rect.height),
        });
    };

    const updateHue = (clientX: number) => {
        const rect = hueRef.current?.getBoundingClientRect();
        if (!rect) return;
        emitHsv({
            ...hsv,
            h: clamp((clientX - rect.left) / rect.width) * 359.999,
        });
    };

    const popover = open
        ? createPortal(
              <div
                  ref={popoverRef}
                  className="nc-theme-color-popover"
                  style={{ top: position.top, left: position.left }}
                  role="dialog"
                  aria-label={`Sélecteur de couleur — ${label}`}
                  onPointerDown={(event) => event.stopPropagation()}
              >
                  <header className="nc-theme-color-popover__header">
                      <span>Choisir une couleur</span>
                      <i style={{ backgroundColor: safeColor }} />
                  </header>
                  <div
                      ref={saturationRef}
                      className="nc-theme-color-popover__saturation"
                      style={{
                          backgroundColor: `hsl(${hsv.h} 100% 50%)`,
                      }}
                      onPointerDown={(event) => {
                          saturationDragging.current = true;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          updateSaturation(event.clientX, event.clientY);
                      }}
                      onPointerMove={(event) => {
                          if (saturationDragging.current) {
                              updateSaturation(event.clientX, event.clientY);
                          }
                      }}
                      onPointerUp={(event) => {
                          saturationDragging.current = false;
                          event.currentTarget.releasePointerCapture(
                              event.pointerId
                          );
                      }}
                  >
                      <span
                          className="nc-theme-color-popover__saturation-thumb"
                          style={{
                              left: `${hsv.s * 100}%`,
                              top: `${(1 - hsv.v) * 100}%`,
                          }}
                      />
                  </div>
                  <div
                      ref={hueRef}
                      className="nc-theme-color-popover__hue"
                      onPointerDown={(event) => {
                          hueDragging.current = true;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          updateHue(event.clientX);
                      }}
                      onPointerMove={(event) => {
                          if (hueDragging.current) updateHue(event.clientX);
                      }}
                      onPointerUp={(event) => {
                          hueDragging.current = false;
                          event.currentTarget.releasePointerCapture(
                              event.pointerId
                          );
                      }}
                  >
                      <span
                          style={{ left: `${(hsv.h / 360) * 100}%` }}
                      />
                  </div>
                  <div className="nc-theme-color-popover__field">
                      <i style={{ backgroundColor: safeColor }} />
                      <input
                          value={value.toUpperCase()}
                          maxLength={7}
                          spellCheck={false}
                          aria-invalid={!isHex(value)}
                          onChange={(event) => {
                              const next = event.target.value;
                              onChange(next);
                              if (isHex(next)) setHsv(hexToHsv(next));
                          }}
                          onKeyDown={(event) => {
                              if (event.key === "Enter" && isHex(value)) {
                                  setOpen(false);
                              }
                          }}
                      />
                  </div>
                  <div className="nc-theme-color-popover__presets">
                      {PRESET_COLORS.map((preset) => {
                          const selected =
                              preset.toLowerCase() === safeColor.toLowerCase();
                          return (
                              <button
                                  key={preset}
                                  type="button"
                                  aria-label={`Utiliser ${preset}`}
                                  aria-pressed={selected}
                                  style={{ backgroundColor: preset }}
                                  onClick={() => {
                                      onChange(preset);
                                      setHsv(hexToHsv(preset));
                                  }}
                              >
                                  {selected && <Check size={13} />}
                              </button>
                          );
                      })}
                  </div>
                  <button
                      className="nc-theme-color-popover__done"
                      type="button"
                      onClick={() => setOpen(false)}
                  >
                      Terminé
                  </button>
              </div>,
              document.body
          )
        : null;

    return (
        <div className="nc-theme-studio__row nc-theme-color-row">
            <span>{label}</span>
            <span
                className={
                    emphasized
                        ? "nc-theme-color-editor nc-theme-color-editor--accent"
                        : "nc-theme-color-editor"
                }
                style={
                    emphasized && isHex(value)
                        ? { backgroundColor: value }
                        : undefined
                }
            >
                <button
                    ref={triggerRef}
                    className="nc-theme-color-editor__trigger"
                    type="button"
                    aria-label={`Choisir ${label.toLowerCase()}`}
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                >
                    <i style={{ backgroundColor: safeColor }} />
                </button>
                <input
                    className="nc-theme-color-editor__text"
                    type="text"
                    value={value.toUpperCase()}
                    maxLength={7}
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck={false}
                    aria-invalid={!isHex(value)}
                />
            </span>
            {popover}
        </div>
    );
}
