import * as React from "react";
import * as ReactDOM from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";

export interface CalendarMenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    /** Render a color swatch instead of an icon (for the "Color" item). */
    swatchColor?: string;
    danger?: boolean;
    onClick: () => void;
}

interface CalendarItemMenuProps {
    items: CalendarMenuItem[];
    anchorRect: DOMRect;
    onClose: () => void;
}

/**
 * Notion-style overflow menu for a calendar row. Positioned `fixed` under the
 * trigger so the sidebar's `overflow` never clips it. The menu's own width is
 * measured after mount and the position is clamped into the viewport, so the
 * text is never cut off on a narrow sidebar.
 */
export default function CalendarItemMenu({
    items,
    anchorRect,
    onClose,
}: CalendarItemMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number }>(() => ({
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
    }));

    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const margin = 8;
        const w = el.offsetWidth;
        const h = el.offsetHeight;

        // Align the menu's right edge with the trigger's right edge…
        let left = anchorRect.right - w;
        // …then keep it fully inside the viewport.
        left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));

        let top = anchorRect.bottom + 4;
        if (top + h > window.innerHeight - margin) {
            top = anchorRect.top - h - 4;
        }
        top = Math.max(margin, top);

        setPos({ top, left });
    }, [anchorRect]);

    // Portaled to <body> so its position:fixed is relative to the VIEWPORT.
    // The calendar's .workspace-leaf ancestor has `contain: strict`, which makes
    // it the containing block for fixed descendants — rendered inline, the menu
    // lands offset by the leaf's origin (and that offset shifts with the window
    // size/position, so the menu appears in a "random" spot). Body-level fixes it.
    return ReactDOM.createPortal(
        <>
            <div className="nc-cal-menu-overlay" onClick={onClose} />
            <div
                ref={menuRef}
                className="nc-cal-menu"
                style={{ top: pos.top, left: pos.left }}
                role="menu"
            >
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        className={`nc-cal-menu-item${
                            item.danger ? " nc-cal-menu-danger" : ""
                        }`}
                        onClick={() => {
                            item.onClick();
                            onClose();
                        }}
                    >
                        <span className="nc-cal-menu-icon">
                            {item.swatchColor !== undefined ? (
                                <span
                                    className="nc-cal-menu-swatch"
                                    style={{
                                        backgroundColor: item.swatchColor,
                                    }}
                                />
                            ) : (
                                item.icon
                            )}
                        </span>
                        <span className="nc-cal-menu-label">{item.label}</span>
                    </button>
                ))}
            </div>
        </>,
        document.body
    );
}
