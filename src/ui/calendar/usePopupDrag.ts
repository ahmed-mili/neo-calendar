import { useState, useCallback } from "react";

interface Position {
    left: number;
    top: number;
}

export function usePopupDrag(position: Position) {
    const [dragOffset, setDragOffset] = useState<{
        x: number;
        y: number;
    } | null>(null);

    const handleHeaderMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const origLeft = dragOffset ? dragOffset.x : position.left;
            const origTop = dragOffset ? dragOffset.y : position.top;

            const onMove = (ev: MouseEvent) => {
                setDragOffset({
                    x: origLeft + ev.clientX - startX,
                    y: origTop + ev.clientY - startY,
                });
            };
            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [position, dragOffset]
    );

    return { dragOffset, setDragOffset, handleHeaderMouseDown };
}
