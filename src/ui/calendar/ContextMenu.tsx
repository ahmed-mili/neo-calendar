import * as React from "react";
import * as ReactDOM from "react-dom";
import { useEffect, useLayoutEffect, useRef } from "react";

export interface ContextMenuItem {
    label: string;
    shortcut?: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean;
}

interface ContextMenuProps {
    visible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
    onDismiss: () => void;
}

export default function ContextMenu({
    visible,
    x,
    y,
    items,
    onDismiss,
}: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!visible) return;

        const onPress = (e: Event) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                onDismiss();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onDismiss();
        };
        // Pointer events, not mouse events: the grid cancels its `pointerdown`,
        // which suppresses the compatibility mouse events, so a press on the
        // calendar never produces a `mousedown` to dismiss on.
        document.addEventListener("pointerdown", onPress);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPress);
            document.removeEventListener("keydown", onKey);
        };
    }, [visible, onDismiss]);

    // Placed from the menu's real size, before it is painted. A fixed guess of
    // 400 px high flipped a five-item menu (~200 px) 400 px above the cursor as
    // soon as the click was in the lower part of the window.
    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!visible || !menu) return;
        const place = () => {
            // Layout size, not getBoundingClientRect: the opening animation
            // scales the menu down for its first frames.
            const width = menu.offsetWidth;
            const height = menu.offsetHeight;
            const margin = 8;
            let left = x;
            let top = y;
            if (left + width > window.innerWidth - margin) left = x - width;
            if (top + height > window.innerHeight - margin) top = y - height;
            menu.style.left = `${Math.max(margin, left)}px`;
            menu.style.top = `${Math.max(margin, top)}px`;
        };
        place();
        // An item can drop out after the first paint (the empty-slot menu loses
        // one): placed once, the menu would then float above the cursor.
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(place);
        observer.observe(menu);
        return () => observer.disconnect();
    }, [visible, x, y, items]);

    if (!visible) return null;

    // Portaled to <body> so its position:fixed uses viewport coords (the click's
    // clientX/clientY). Rendered inline it would sit inside the calendar's
    // `contain: strict` leaf, which becomes the containing block for fixed
    // descendants — offsetting the menu away from the cursor by the leaf origin.
    return ReactDOM.createPortal(
        <div
            ref={menuRef}
            className="nc-context-menu"
            style={{ left: x, top: y }}
            role="menu"
        >
            {items.map((item, i) =>
                item.separator ? (
                    <div key={i} className="nc-context-menu-separator" />
                ) : (
                    <button
                        key={i}
                        className={`nc-context-menu-item${
                            item.danger ? " nc-danger" : ""
                        }`}
                        disabled={item.disabled}
                        onClick={() => {
                            if (!item.disabled) {
                                item.onClick();
                                onDismiss();
                            }
                        }}
                        role="menuitem"
                    >
                        {item.icon && (
                            <span className="nc-context-menu-icon">
                                {item.icon}
                            </span>
                        )}
                        <span className="nc-context-menu-label">
                            {item.label}
                        </span>
                        {item.shortcut && (
                            <span className="nc-context-menu-shortcut">
                                {item.shortcut}
                            </span>
                        )}
                    </button>
                )
            )}
        </div>,
        document.body
    );
}
