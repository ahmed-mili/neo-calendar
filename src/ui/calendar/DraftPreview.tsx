import * as React from "react";
import { isAndroidRuntime } from "./CalendarUtils";

// Committing replaces the preview with a real event, so there must be no ghost
// over that event. Dismissing an unnamed draft can finish its fade instead.
export const DraftPreviewImmediateContext = React.createContext(false);
const FADE_MS = 180;

export default function DraftPreview({
    children,
    immediate = false,
}: {
    children: React.ReactElement | null | false | undefined;
    immediate?: boolean;
}) {
    const committing = React.useContext(DraftPreviewImmediateContext);
    const [retained, setRetained] = React.useState<React.ReactElement | null>(
        null
    );
    const animate =
        isAndroidRuntime() &&
        !immediate &&
        !committing &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    React.useLayoutEffect(() => {
        if (children) {
            setRetained(children);
            return;
        }
        if (!animate) {
            setRetained(null);
            return;
        }
        const timer = window.setTimeout(() => setRetained(null), FADE_MS);
        return () => window.clearTimeout(timer);
    }, [children, animate]);

    // The Android presence class also matches a legacy bordered preview rule.
    // Desktop keeps the original selection element, including its exact styles.
    if (!isAndroidRuntime()) return children || null;
    const content = children || (animate ? retained : null);
    if (!content) return null;
    return React.cloneElement(content, {
        className: `${content.props.className ?? ""} nc-draft-preview`,
        "data-draft-state": children ? "visible" : "exiting",
        "data-draft-preview": children ? "true" : undefined,
        "aria-hidden": children ? undefined : true,
        style: { ...content.props.style, "--nc-draft-fade-ms": `${FADE_MS}ms` },
    });
}
