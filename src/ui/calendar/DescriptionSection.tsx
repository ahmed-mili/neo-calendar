import * as React from "react";
import * as ReactDOM from "react-dom";
import { Paperclip } from "lucide-react";
import { BrandIcon } from "./BrandIcons";
import { CopyIcon, PencilIcon, SearchIcon, XIcon } from "./Icons";
import { LinesIcon } from "./EventPanelIcons";
import { DescriptionRow, LinksAttachmentsRow } from "./EventPanelRows";
import {
    DescriptionMention,
    descriptionMentionAt,
    labelFor,
    sameTarget,
    urlMarkdown,
    withoutDescriptionMention,
} from "./linkInput";
import {
    readChecklist,
    replaceLine,
    taskPrefixLength,
} from "./descriptionChecklist";
import { t } from "../i18n";

export interface DescriptionVaultOption {
    path: string;
    name: string;
}

export interface DescriptionSearchTarget {
    id: string;
    vaultPath: string;
    vaultName: string;
    title: string;
    relativePath: string;
    detail: string;
    markdown: string;
}

export interface DescriptionLinkedItem {
    id: string;
    label: string;
    target: string;
    kind: "note" | "attachment" | "web";
}

interface DescriptionSectionProps {
    description: string;
    editable: boolean;
    setDescription: (value: string) => void;
    onCommit: () => void;
    eventId: string | null;
    vaults: DescriptionVaultOption[];
    items: DescriptionLinkedItem[];
    onSearch?: (
        query: string,
        vaultPath?: string
    ) => Promise<DescriptionSearchTarget[]>;
    onAddLink?: (eventId: string, markdown: string) => Promise<void>;
    onRemoveLink?: (eventId: string, target: string) => Promise<void>;
    onRenameLink?: (
        eventId: string,
        target: string,
        label: string,
        nextTarget?: string
    ) => Promise<void>;
    onOpenLink?: (item: DescriptionLinkedItem) => Promise<void> | void;
    onCopyLink?: (target: string) => Promise<void>;
    onPickAttachment?: (eventId: string) => Promise<void>;
    onReadAttachment?: (
        eventId: string,
        target: string
    ) => Promise<string | null>;
}

interface FieldSnapshot {
    text: string;
    start: number;
    end: number;
}

interface PickerPosition {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

function portalTarget(): HTMLElement {
    const android =
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body.classList.contains("nc-platform-android") ||
        document.documentElement.dataset.neoCalendarPlatform === "android";
    return android
        ? document.getElementById("nc-android-overlay-root") ?? document.body
        : document.body;
}

function markdownTarget(markdown: string): string | null {
    return /\]\((.*)\)\s*$/.exec(markdown.trim())?.[1]?.trim() || null;
}

function visibleLinkLabel(item: DescriptionLinkedItem): string {
    if (item.kind !== "web") return item.label || item.target;
    const automatic = labelFor(item.target);
    return !item.label || item.label === automatic ? item.target : item.label;
}

export function editableDescriptionLinkLabel(
    item: DescriptionLinkedItem
): string {
    if (item.kind !== "web") return item.label || "";
    const current = item.label.trim();
    if (
        !current ||
        current === item.target ||
        current === labelFor(item.target)
    ) {
        return "";
    }
    return current;
}

function splitSearchPath(relativePath: string): {
    fileName: string;
    parentPath: string;
} {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts.pop() || normalized || "Untitled";
    const parents = parts.length > 3 ? ["…", ...parts.slice(-3)] : parts;
    return { fileName, parentPath: parents.join("/") };
}

function checklistSnapshot(
    field: HTMLTextAreaElement,
    description: string
): FieldSnapshot | null {
    const checklist = field.closest(".nc-panel-checklist");
    if (!(checklist instanceof HTMLElement)) return null;
    const lineElement = field.closest(".nc-panel-checklist-line") ?? field;
    const index = Array.from(checklist.children).indexOf(lineElement);
    if (index < 0) return null;

    const lines = description.split("\n");
    const raw = lines[index] ?? "";
    const prefix = taskPrefixLength(raw) ?? 0;
    const text = replaceLine(
        description,
        index,
        raw.slice(0, prefix) + field.value
    );
    const lineStart = lines
        .slice(0, index)
        .reduce((total, line) => total + line.length + 1, 0);
    return {
        text,
        start: lineStart + prefix + field.selectionStart,
        end: lineStart + prefix + field.selectionEnd,
    };
}

function snapshotForField(
    field: HTMLTextAreaElement,
    description: string
): FieldSnapshot | null {
    if (field.dataset.descriptionInput === "true") {
        return {
            text: field.value,
            start: field.selectionStart,
            end: field.selectionEnd,
        };
    }
    if (field.classList.contains("nc-panel-checklist-edit")) {
        return checklistSnapshot(field, description);
    }
    return null;
}

function replaceSelection(snapshot: FieldSnapshot, inserted: string): string {
    return (
        snapshot.text.slice(0, snapshot.start) +
        inserted +
        snapshot.text.slice(snapshot.end)
    );
}

function DescriptionLinkRow({
    item,
    eventId,
    editable,
    onRenameLink,
    onRemoveLink,
    onOpenLink,
    onCopyLink,
}: {
    item: DescriptionLinkedItem;
    eventId: string | null;
    editable: boolean;
    onRenameLink?: DescriptionSectionProps["onRenameLink"];
    onRemoveLink?: DescriptionSectionProps["onRemoveLink"];
    onOpenLink?: DescriptionSectionProps["onOpenLink"];
    onCopyLink?: DescriptionSectionProps["onCopyLink"];
}) {
    const rowRef = React.useRef<HTMLDivElement>(null);
    const dialogRef = React.useRef<HTMLDivElement>(null);
    const [selected, setSelected] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    const [label, setLabel] = React.useState("");
    const [target, setTarget] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [dialogPosition, setDialogPosition] = React.useState<{
        top: number;
        left: number;
    } | null>(null);
    const display = visibleLinkLabel(item);

    React.useEffect(() => {
        if (!selected && !editing) return;
        const close = (event: PointerEvent) => {
            const node = event.target as Node;
            if (rowRef.current?.contains(node)) return;
            if (dialogRef.current?.contains(node)) return;
            setSelected(false);
            setEditing(false);
            setError(null);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [editing, selected]);

    React.useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 1400);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const beginEdit = () => {
        if (!editable || !eventId || !onRenameLink) return;
        const rect = rowRef.current?.getBoundingClientRect();
        if (rect) {
            const width = Math.min(312, window.innerWidth - 16);
            const left = Math.max(
                8,
                Math.min(rect.left, window.innerWidth - width - 8)
            );
            const wantedTop = rect.bottom + 6;
            const top =
                wantedTop + 218 <= window.innerHeight - 8
                    ? wantedTop
                    : Math.max(8, rect.top - 224);
            setDialogPosition({ top, left });
        }
        setLabel(editableDescriptionLinkLabel(item));
        setTarget(item.target);
        setError(null);
        setEditing(true);
        setSelected(false);
    };

    const copy = async () => {
        try {
            if (onCopyLink) await onCopyLink(item.target);
            else await navigator.clipboard.writeText(item.target);
            setCopied(true);
            setSelected(false);
        } catch {
            setError(t("Could not copy link"));
        }
    };

    const confirm = async () => {
        if (!eventId || !onRenameLink || saving) return;
        const markdown = urlMarkdown(target);
        const nextTarget = markdown && markdownTarget(markdown);
        if (!nextTarget) {
            setError(t("That does not look like a link"));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onRenameLink(eventId, item.target, label.trim(), nextTarget);
            setEditing(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!eventId || !onRemoveLink || saving) return;
        setSaving(true);
        setError(null);
        try {
            await onRemoveLink(eventId, item.target);
            setEditing(false);
            setSelected(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="nc-description-link-wrap" ref={rowRef}>
            <button
                type="button"
                className="nc-description-link"
                title={item.target}
                aria-expanded={selected}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelected((current) => !current);
                }}
                onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void onOpenLink?.(item);
                }}
                onKeyDown={(event) => {
                    if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter"
                    ) {
                        event.preventDefault();
                        void onOpenLink?.(item);
                    }
                }}
            >
                {display}
            </button>
            <div
                className="nc-description-link-actions"
                hidden={!selected}
                aria-hidden={!selected}
            >
                <button
                    type="button"
                    aria-label={t("Edit link")}
                    title={t("Edit link")}
                    disabled={!editable || !eventId || !onRenameLink}
                    onClick={beginEdit}
                >
                    <PencilIcon size={16} />
                </button>
                <button
                    type="button"
                    aria-label={t("Copy link")}
                    title={t("Copy link")}
                    onClick={() => void copy()}
                >
                    <CopyIcon size={16} />
                </button>
            </div>
            {copied && (
                <span className="nc-description-link-status" role="status">
                    {t("Link copied")}
                </span>
            )}
            {error && !editing && (
                <span className="nc-description-link-error" role="alert">
                    {error}
                </span>
            )}
            {editing &&
                dialogPosition &&
                ReactDOM.createPortal(
                    <div
                        className="nc-description-link-dialog"
                        role="dialog"
                        aria-modal="false"
                        aria-label={t("Edit link")}
                        data-nc-popup-portal="true"
                        ref={dialogRef}
                        style={dialogPosition}
                    >
                        <div className="nc-description-link-dialog-head">
                            <strong>{t("Edit link")}</strong>
                            <button
                                type="button"
                                className="nc-description-link-dialog-close"
                                aria-label={t("Close")}
                                onClick={() => setEditing(false)}
                            >
                                <XIcon size={15} />
                            </button>
                        </div>
                        <input
                            autoFocus
                            value={label}
                            aria-label={t("Link text")}
                            placeholder={t("Link text")}
                            onChange={(event) => setLabel(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void confirm();
                                } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setEditing(false);
                                }
                            }}
                        />
                        <input
                            value={target}
                            aria-label={t("Link address")}
                            placeholder={t("Link address")}
                            onChange={(event) => setTarget(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void confirm();
                                } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setEditing(false);
                                }
                            }}
                        />
                        {error && (
                            <div
                                className="nc-description-link-dialog-error"
                                role="alert"
                            >
                                {error}
                            </div>
                        )}
                        <div className="nc-description-link-dialog-actions">
                            <button
                                type="button"
                                className="nc-description-link-confirm"
                                disabled={saving || !target.trim()}
                                onClick={() => void confirm()}
                            >
                                {t("Confirm")}
                            </button>
                            <button
                                type="button"
                                className="nc-description-link-remove"
                                disabled={saving || !onRemoveLink}
                                onClick={() => void remove()}
                            >
                                {t("Remove link")}
                            </button>
                        </div>
                    </div>,
                    portalTarget()
                )}
        </div>
    );
}

export function DescriptionSection({
    description,
    editable,
    setDescription,
    onCommit,
    eventId,
    vaults,
    items,
    onSearch,
    onAddLink,
    onRemoveLink,
    onRenameLink,
    onOpenLink,
    onCopyLink,
    onPickAttachment,
    onReadAttachment,
}: DescriptionSectionProps) {
    const fieldRef = React.useRef<HTMLTextAreaElement>(null);
    const activeFieldRef = React.useRef<HTMLTextAreaElement | null>(null);
    const descriptionRef = React.useRef(description);
    descriptionRef.current = description;
    const [mention, setMention] = React.useState<DescriptionMention | null>(
        null
    );
    const [results, setResults] = React.useState<DescriptionSearchTarget[]>([]);
    const [highlighted, setHighlighted] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [pickerPosition, setPickerPosition] =
        React.useState<PickerPosition | null>(null);
    const [attaching, setAttaching] = React.useState(false);
    const [attachmentError, setAttachmentError] = React.useState<string | null>(
        null
    );
    const links = items.filter((item) => item.kind !== "attachment");
    const attachments = items.filter((item) => item.kind === "attachment");
    const checklist = readChecklist(description).some(
        (line) => line.kind === "task"
    );

    const resizeField = React.useCallback(() => {
        const field = fieldRef.current;
        if (!field) return;
        field.style.height = "auto";
        field.style.height = `${field.scrollHeight}px`;
    }, []);

    React.useEffect(resizeField, [description, resizeField]);

    const closeMention = React.useCallback(() => {
        setMention(null);
        setResults([]);
        setHighlighted(0);
        setLoading(false);
        setError(null);
        setPickerPosition(null);
    }, []);

    const updateMention = React.useCallback(
        (field: HTMLTextAreaElement) => {
            const snapshot = snapshotForField(field, descriptionRef.current);
            if (!snapshot || !editable || !eventId || !onSearch || !onAddLink) {
                closeMention();
                return;
            }
            activeFieldRef.current = field;
            const next = descriptionMentionAt(snapshot.text, snapshot.start);
            if (!next) {
                closeMention();
                return;
            }
            descriptionRef.current = snapshot.text;
            setMention(next);
        },
        [closeMention, editable, eventId, onAddLink, onSearch]
    );

    React.useEffect(() => {
        if (!mention || !onSearch) return;
        let active = true;
        const timer = window.setTimeout(
            () => {
                setLoading(true);
                setError(null);
                void onSearch(mention.query.trim())
                    .then((next) => {
                        if (!active) return;
                        setResults(next);
                        setHighlighted(0);
                    })
                    .catch((reason) => {
                        if (!active) return;
                        setResults([]);
                        setError(
                            reason instanceof Error
                                ? reason.message
                                : String(reason)
                        );
                    })
                    .finally(() => {
                        if (active) setLoading(false);
                    });
            },
            mention.query.trim() ? 120 : 0
        );
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [mention, onSearch]);

    React.useEffect(() => {
        if (!mention) return;
        const field = activeFieldRef.current;
        if (!field) return;
        const rect = field.getBoundingClientRect();
        const gap = 8;
        const width = Math.min(
            Math.max(rect.width, 500),
            window.innerWidth - gap * 2
        );
        const left = Math.max(
            gap,
            Math.min(rect.left, window.innerWidth - width - gap)
        );
        const roomBelow = window.innerHeight - rect.bottom - gap;
        const roomAbove = rect.top - gap;
        const maxHeight = Math.max(
            150,
            Math.min(300, Math.max(roomBelow, roomAbove))
        );
        const top =
            roomBelow < 180 && roomAbove > roomBelow
                ? Math.max(gap, rect.top - maxHeight - 4)
                : rect.bottom + 4;
        setPickerPosition({ top, left, width, maxHeight });
    }, [mention]);

    const addStoredLink = React.useCallback(
        async (markdown: string): Promise<"added" | "duplicate" | "failed"> => {
            if (!eventId || !onAddLink || saving) return "failed";
            const target = markdownTarget(markdown);
            if (
                target &&
                items.some((item) => sameTarget(item.target, target))
            ) {
                setError(t("This link is already here"));
                return "duplicate";
            }
            setSaving(true);
            setError(null);
            try {
                await onAddLink(eventId, markdown.trim());
                return "added";
            } catch (reason) {
                setError(
                    reason instanceof Error ? reason.message : String(reason)
                );
                return "failed";
            } finally {
                setSaving(false);
            }
        },
        [eventId, items, onAddLink, saving]
    );

    const pickResult = React.useCallback(
        async (result: DescriptionSearchTarget) => {
            if (!mention) return;
            const outcome = await addStoredLink(result.markdown);
            if (outcome === "failed") return;
            const next = withoutDescriptionMention(
                descriptionRef.current,
                mention
            );
            descriptionRef.current = next.value;
            setDescription(next.value);
            closeMention();
            onCommit();
            window.requestAnimationFrame(() => {
                const field = activeFieldRef.current;
                if (!field) return;
                field.focus();
                if (field.dataset.descriptionInput === "true") {
                    field.setSelectionRange(next.caret, next.caret);
                }
            });
        },
        [addStoredLink, closeMention, mention, onCommit, setDescription]
    );

    const handlePaste = (
        event: React.ClipboardEvent<HTMLDivElement | HTMLTextAreaElement>
    ) => {
        const field = event.target as HTMLTextAreaElement;
        if (!(field instanceof HTMLTextAreaElement)) return;
        const pasted = event.clipboardData.getData("text/plain");
        const markdown = urlMarkdown(pasted);
        if (!markdown || !eventId || !onAddLink || !editable) return;
        const snapshot = snapshotForField(field, descriptionRef.current);
        if (!snapshot) return;
        event.preventDefault();
        activeFieldRef.current = field;
        void addStoredLink(markdown).then((outcome) => {
            if (outcome !== "failed") return;
            const next = replaceSelection(snapshot, pasted);
            descriptionRef.current = next;
            setDescription(next);
            onCommit();
        });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!mention) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            setHighlighted((current) =>
                Math.min(current + 1, Math.max(0, results.length - 1))
            );
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            setHighlighted((current) => Math.max(0, current - 1));
        } else if (event.key === "Enter" && results.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            void pickResult(results[highlighted] ?? results[0]);
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMention();
        }
    };

    const attach = async () => {
        if (!eventId || !onPickAttachment || attaching) return;
        setAttaching(true);
        setAttachmentError(null);
        try {
            await onPickAttachment(eventId);
        } catch (reason) {
            setAttachmentError(
                reason instanceof Error ? reason.message : String(reason)
            );
        } finally {
            setAttaching(false);
        }
    };

    return (
        <div
            className="nc-description-section"
            onInputCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLTextAreaElement) updateMention(field);
            }}
            onSelectCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLTextAreaElement) updateMention(field);
            }}
            onPasteCapture={handlePaste}
            onKeyDownCapture={handleKeyDown}
        >
            {attachments.length > 0 && (
                <div className="nc-description-attachments">
                    <LinksAttachmentsRow
                        eventId={eventId}
                        disabled={!editable || !eventId}
                        vaults={[]}
                        items={attachments}
                        onOpenNote={() => {}}
                        onRemoveLink={editable ? onRemoveLink : undefined}
                        onRenameLink={editable ? onRenameLink : undefined}
                        onOpenLink={onOpenLink}
                        onCopyLink={onCopyLink}
                        onReadAttachment={onReadAttachment}
                    />
                </div>
            )}

            {editable && (
                <button
                    type="button"
                    className="nc-panel-row nc-panel-row-attachment"
                    disabled={!eventId || !onPickAttachment || attaching}
                    aria-label={
                        eventId
                            ? t("Attachment")
                            : t("Available once the event is created")
                    }
                    onClick={() => void attach()}
                >
                    <span className="nc-panel-row-icon" aria-hidden="true">
                        <Paperclip size={16} strokeWidth={2} />
                    </span>
                    <span className="nc-panel-row-label">
                        {t("Attachment")}
                    </span>
                </button>
            )}
            {attachmentError && (
                <div className="nc-description-link-error" role="alert">
                    {attachmentError}
                </div>
            )}
            {error && !mention && (
                <div className="nc-description-link-error" role="alert">
                    {error}
                </div>
            )}

            {checklist ? (
                <>
                    <DescriptionRow
                        description={description}
                        editable={editable}
                        setDescription={setDescription}
                        onCommit={onCommit}
                    />
                    {links.length > 0 && (
                        <div className="nc-description-links nc-description-links-checklist">
                            {links.map((item) => (
                                <DescriptionLinkRow
                                    key={item.id}
                                    item={item}
                                    eventId={eventId}
                                    editable={editable}
                                    onRenameLink={onRenameLink}
                                    onRemoveLink={onRemoveLink}
                                    onOpenLink={onOpenLink}
                                    onCopyLink={onCopyLink}
                                />
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div className="nc-panel-row nc-panel-row-desc nc-description-composer">
                    <span className="nc-panel-row-icon">
                        <LinesIcon />
                    </span>
                    <div className="nc-panel-row-content">
                        {links.length > 0 && (
                            <div className="nc-description-links">
                                {links.map((item) => (
                                    <DescriptionLinkRow
                                        key={item.id}
                                        item={item}
                                        eventId={eventId}
                                        editable={editable}
                                        onRenameLink={onRenameLink}
                                        onRemoveLink={onRemoveLink}
                                        onOpenLink={onOpenLink}
                                        onCopyLink={onCopyLink}
                                    />
                                ))}
                            </div>
                        )}
                        <textarea
                            ref={fieldRef}
                            rows={1}
                            className="nc-panel-textarea"
                            data-description-input="true"
                            value={description}
                            placeholder={t("Add a description")}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            onBlur={onCommit}
                            readOnly={!editable}
                        />
                    </div>
                </div>
            )}

            {mention &&
                pickerPosition &&
                ReactDOM.createPortal(
                    <div
                        className="nc-link-results-popover nc-description-mention-popover"
                        data-nc-popup-portal="true"
                        role="listbox"
                        style={pickerPosition}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                    >
                        <div className="nc-link-search-shell nc-description-mention-query">
                            <span
                                className="nc-link-search-icon"
                                aria-hidden="true"
                            >
                                <SearchIcon />
                            </span>
                            <input
                                className="nc-link-search-input"
                                value={mention.query}
                                readOnly
                                tabIndex={-1}
                                aria-label={t(
                                    "Search a document or paste a link"
                                )}
                                placeholder={t(
                                    "Search a document or paste a link"
                                )}
                            />
                        </div>
                        {vaults.length === 0 ? (
                            <div className="nc-link-empty">
                                {t(
                                    "Add Obsidian vaults in Settings to search notes."
                                )}
                            </div>
                        ) : results.length > 0 ? (
                            results.map((result, index) => {
                                const { fileName, parentPath } =
                                    splitSearchPath(result.relativePath);
                                return (
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={index === highlighted}
                                        className={`nc-link-result${
                                            index === highlighted
                                                ? " is-highlighted"
                                                : ""
                                        }`}
                                        key={result.id}
                                        onMouseEnter={() =>
                                            setHighlighted(index)
                                        }
                                        onClick={() => void pickResult(result)}
                                    >
                                        <span className="nc-link-result-content">
                                            <span className="nc-link-result-name">
                                                {fileName}
                                            </span>
                                            {parentPath && (
                                                <span className="nc-link-result-parent">
                                                    {parentPath}
                                                </span>
                                            )}
                                        </span>
                                        {vaults.length > 1 && (
                                            <span className="nc-link-result-vault">
                                                <span className="nc-link-result-vault-icon">
                                                    <BrandIcon brand="obsidian" />
                                                </span>
                                                <span className="nc-link-result-vault-name">
                                                    {result.vaultName}
                                                </span>
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        ) : loading ? null : (
                            <div className="nc-link-empty">
                                {t("No matching notes")}
                            </div>
                        )}
                        {error && (
                            <div className="nc-link-picker-error" role="alert">
                                {error}
                            </div>
                        )}
                    </div>,
                    portalTarget()
                )}
        </div>
    );
}
