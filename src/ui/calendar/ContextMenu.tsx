import * as React from "react";
import * as ReactDOM from "react-dom";
import { useEffect, useRef } from "react";

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

    if (!visible) return null;

    const MENU_WIDTH = 200;
    const MENU_MAX_HEIGHT = 400;
    let left = x;
    let top = y;
    if (x + MENU_WIDTH > window.innerWidth - 8) left = x - MENU_WIDTH;
    if (y + MENU_MAX_HEIGHT > window.innerHeight - 8) top = y - MENU_MAX_HEIGHT;

    // Portaled to <body> so its position:fixed uses viewport coords (the click's
    // clientX/clientY). Rendered inline it would sit inside the calendar's
    // `contain: strict` leaf, which becomes the containing block for fixed
    // descendants — offsetting the menu away from the cursor by the leaf origin.
    return ReactDOM.createPortal(
        <div
            ref={menuRef}
            className="nc-context-menu"
            style={{ left, top }}
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
