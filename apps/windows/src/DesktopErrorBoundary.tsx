import React from "react";
import { t } from "../../../src/ui/i18n";

interface DesktopErrorBoundaryProps {
    children?: React.ReactNode;
}

interface DesktopErrorBoundaryState {
    error: Error | null;
}

/** Keeps a popup/render failure from leaving the Tauri window permanently blank. */
export default class DesktopErrorBoundary extends React.Component<
    DesktopErrorBoundaryProps,
    DesktopErrorBoundaryState
> {
    state: DesktopErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): DesktopErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error("[neo-calendar desktop] UI failure", error, info);
    }

    render(): React.ReactNode {
        if (!this.state.error) return this.props.children;
        return (
            <div className="nc-desktop-fatal" role="alert">
                <div className="nc-desktop-fatal__card">
                    <strong>
                        {t("Neo Calendar encountered an interface error.")}
                    </strong>
                    <p>{this.state.error.message}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                    >
                        {t("Reload interface")}
                    </button>
                </div>
            </div>
        );
    }
}
