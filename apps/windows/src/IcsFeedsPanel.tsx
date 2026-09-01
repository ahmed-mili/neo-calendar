import * as React from "react";
import { createPortal } from "react-dom";
import { t } from "../../../src/ui/i18n";
import ConfirmDialog from "./ConfirmDialog";
import {
    ICS_REFRESH_MINUTES,
    MAX_ICS_FEEDS_PER_CALENDAR,
    normalizeIcsUrl,
    type IcsFeedSubscription,
    type IcsRefreshMinutes,
} from "./platform/icsFeedPreferences";
import type { IcsRuntimeStateByFeed } from "./platform/icsSyncScheduler";
import {
    AlertCircleIcon,
    LinkIcon,
    Loader2Icon,
    PlusIcon,
    RefreshCwIcon,
    Trash2Icon,
    XIcon,
} from "../../../src/ui/calendar/Icons";

/**
 * "Dernière synchro. le 30/08/2026 à 18h05" — the device-local hour, joined
 * with a literal "h" rather than the platform's own separator: `Intl` renders
 * the fr-FR hour/minute pair with a colon (or, asked for the hour alone, with
 * a trailing " h" of its own), neither of which is this wording. The date
 * itself is left to `Intl` since only the hour needs a fixed shape.
 */
export function formatLastIcsSync(iso: string, locale = "fr-FR"): string {
    const date = new Date(iso);
    const datePart = new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
    }).format(date);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${t("Last sync on")} ${datePart} ${t("at")} ${hours}h${minutes}`;
}

function frequencyLabel(minutes: IcsRefreshMinutes): string {
    return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
}

export interface IcsFeedsPanelProps {
    open: boolean;
    calendarId: string;
    calendarName: string;
    feeds: IcsFeedSubscription[];
    runtimeStates: IcsRuntimeStateByFeed;
    /** Feeds currently mid-download, separate from their last recorded state. */
    syncingFeedIds?: ReadonlySet<string>;
    defaultRefreshMinutes: IcsRefreshMinutes;
    onClose: () => void;
    onAdd: (
        name: string,
        url: string,
        refreshMinutes?: IcsRefreshMinutes
    ) => void;
    onEdit: (
        feedId: string,
        patch: {
            name?: string;
            url?: string;
            refreshMinutes?: IcsRefreshMinutes;
        }
    ) => void;
    onRemove: (feedId: string) => void;
    onRefreshNow: (feedId: string) => void;
    onApplyFrequencyToAll: (minutes: IcsRefreshMinutes) => void;
}

function FeedStatus({
    feed,
    runtimeStates,
    syncing,
}: {
    feed: IcsFeedSubscription;
    runtimeStates: IcsRuntimeStateByFeed;
    syncing: boolean;
}) {
    if (syncing) {
        return (
            <span className="nc-ics-feed-row__status nc-ics-feed-row__status--syncing">
                <Loader2Icon size={13} />
                {t("Syncing…")}
            </span>
        );
    }

    const state = runtimeStates[feed.id];
    if (!state?.lastSuccessAt && !state?.lastError) {
        return (
            <span className="nc-ics-feed-row__status">{t("Never synced")}</span>
        );
    }

    if (state.lastError) {
        return (
            <span className="nc-ics-feed-row__status nc-ics-feed-row__status--error">
                <AlertCircleIcon size={13} />
                {state.lastError}
                {state.lastSuccessAt && (
                    <span className="nc-ics-feed-row__status-secondary">
                        {formatLastIcsSync(state.lastSuccessAt)}
                    </span>
                )}
            </span>
        );
    }

    return (
        <span className="nc-ics-feed-row__status">
            {formatLastIcsSync(state.lastSuccessAt as string)}
        </span>
    );
}

/**
 * Manages the ICS feed subscriptions of one Full Note calendar: add, per-link
 * name/URL/frequency, manual refresh and removal. Removing a link never
 * offers to delete its already-created notes — that stays out of this panel's
 * reach, enforced by the sync planner instead.
 */
export default function IcsFeedsPanel({
    open,
    calendarId: _calendarId,
    calendarName,
    feeds,
    runtimeStates,
    syncingFeedIds,
    defaultRefreshMinutes,
    onClose,
    onAdd,
    onEdit,
    onRemove,
    onRefreshNow,
    onApplyFrequencyToAll,
}: IcsFeedsPanelProps) {
    const [newName, setNewName] = React.useState("");
    const [newUrl, setNewUrl] = React.useState("");
    const [addError, setAddError] = React.useState<string | null>(null);
    const [applyConfirmOpen, setApplyConfirmOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        setNewName("");
        setNewUrl("");
        setAddError(null);
        setApplyConfirmOpen(false);
    }, [open]);

    if (!open) return null;

    const atLimit = feeds.length >= MAX_ICS_FEEDS_PER_CALENDAR;
    const existingUrls = new Set(feeds.map((f) => f.url));

    const submitAdd = (event: React.FormEvent) => {
        event.preventDefault();
        if (atLimit) return;

        const name = newName.trim();
        const normalized = normalizeIcsUrl(newUrl);
        if (!name || !normalized) {
            setAddError(t("Enter a valid HTTPS or webcal address."));
            return;
        }
        if (existingUrls.has(normalized)) {
            setAddError(
                t("This link is already used by another feed on this calendar.")
            );
            return;
        }

        onAdd(name, normalized);
        setNewName("");
        setNewUrl("");
        setAddError(null);
    };

    const content = (
        <div
            className="nc-ics-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className="nc-ics-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-ics-panel-title"
            >
                <header className="nc-ics-panel__header">
                    <span className="nc-ics-panel__icon">
                        <LinkIcon size={16} />
                    </span>
                    <h2 id="nc-ics-panel-title">
                        {t("ICS links")} — {calendarName}
                    </h2>
                    <button
                        type="button"
                        className="nc-ics-panel__close"
                        onClick={onClose}
                        aria-label={t("Close")}
                    >
                        <XIcon size={16} />
                    </button>
                </header>

                {feeds.length > 1 && (
                    <p className="nc-ics-panel__summary">
                        {feeds.length} {t("ICS links").toLowerCase()}
                    </p>
                )}

                <div className="nc-ics-panel__list">
                    {feeds.length === 0 ? (
                        <p className="nc-ics-panel__empty">
                            {t("No ICS links yet.")}
                        </p>
                    ) : (
                        feeds.map((feed) => (
                            <div className="nc-ics-feed-row" key={feed.id}>
                                <span className="nc-ics-feed-row__icon">
                                    <LinkIcon size={15} />
                                </span>
                                <div className="nc-ics-feed-row__body">
                                    <input
                                        className="nc-ics-feed-row__name"
                                        aria-label={`${t("Name")} — ${
                                            feed.name
                                        }`}
                                        defaultValue={feed.name}
                                        onBlur={(event) => {
                                            const value =
                                                event.target.value.trim();
                                            if (value && value !== feed.name) {
                                                onEdit(feed.id, {
                                                    name: value,
                                                });
                                            }
                                        }}
                                    />
                                    <span className="nc-ics-feed-row__url">
                                        {feed.url}
                                    </span>
                                    <FeedStatus
                                        feed={feed}
                                        runtimeStates={runtimeStates}
                                        syncing={
                                            syncingFeedIds?.has(feed.id) ??
                                            false
                                        }
                                    />
                                </div>
                                <select
                                    className="nc-ics-feed-row__frequency"
                                    name="ics-feed-frequency"
                                    aria-label={`${t("Frequency")} — ${
                                        feed.name
                                    }`}
                                    value={String(
                                        feed.refreshMinutes ??
                                            defaultRefreshMinutes
                                    )}
                                    onChange={(event) =>
                                        onEdit(feed.id, {
                                            refreshMinutes: Number(
                                                event.target.value
                                            ) as IcsRefreshMinutes,
                                        })
                                    }
                                >
                                    {ICS_REFRESH_MINUTES.map((minutes) => (
                                        <option key={minutes} value={minutes}>
                                            {frequencyLabel(minutes)}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="nc-ics-feed-row__action"
                                    data-testid="ics-refresh-now"
                                    title={t("Refresh now")}
                                    aria-label={`${t("Refresh now")} — ${
                                        feed.name
                                    }`}
                                    onClick={() => onRefreshNow(feed.id)}
                                >
                                    <RefreshCwIcon size={15} />
                                </button>
                                <button
                                    type="button"
                                    className="nc-ics-feed-row__action nc-ics-feed-row__action--danger"
                                    data-testid="ics-remove-feed"
                                    title={t("Remove link")}
                                    aria-label={`${t("Remove link")} — ${
                                        feed.name
                                    }`}
                                    onClick={() => onRemove(feed.id)}
                                >
                                    <Trash2Icon size={15} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <form className="nc-ics-panel__add-form" onSubmit={submitAdd}>
                    <input
                        type="text"
                        name="ics-feed-name"
                        placeholder={t("Name")}
                        aria-label={t("Name")}
                        value={newName}
                        disabled={atLimit}
                        onChange={(event) => {
                            setNewName(event.target.value);
                            setAddError(null);
                        }}
                    />
                    <input
                        type="text"
                        name="ics-feed-url"
                        placeholder="https://…"
                        aria-label="URL"
                        value={newUrl}
                        disabled={atLimit}
                        onChange={(event) => {
                            setNewUrl(event.target.value);
                            setAddError(null);
                        }}
                    />
                    <button type="submit" disabled={atLimit}>
                        <PlusIcon size={15} />
                        {t("Add an ICS link")}
                    </button>
                </form>
                {addError && <p className="nc-ics-panel__error">{addError}</p>}
                {atLimit && (
                    <p className="nc-ics-panel__limit-note">
                        {t(
                            "This calendar already has the maximum of five ICS links."
                        )}
                    </p>
                )}

                {feeds.length > 0 && (
                    <footer className="nc-ics-panel__footer">
                        <button
                            type="button"
                            className="nc-ics-panel__apply-all"
                            onClick={() => setApplyConfirmOpen(true)}
                        >
                            {t("Apply to all links")}
                        </button>
                    </footer>
                )}
            </section>

            <ConfirmDialog
                open={applyConfirmOpen}
                title={t("Apply to all links")}
                message={`${t(
                    "Apply this frequency to every ICS link on every calendar?"
                )} ${t(
                    "This sets every link's frequency to this value and removes any per-link override."
                )}`}
                confirmLabel={t("Apply to all links")}
                onClose={() => setApplyConfirmOpen(false)}
                onConfirm={() => {
                    onApplyFrequencyToAll(defaultRefreshMinutes);
                }}
            />
        </div>
    );

    return typeof document === "undefined"
        ? content
        : createPortal(content, document.body);
}
