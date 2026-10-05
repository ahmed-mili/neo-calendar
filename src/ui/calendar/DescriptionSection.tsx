import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    ListTodo,
    Paperclip,
    RemoveFormatting,
    Underline,
} from "lucide-react";
import { CopyIcon, PencilIcon, XIcon } from "./Icons";
import { LinesIcon } from "./EventPanelIcons";
import { LinksAttachmentsRow } from "./EventPanelRows";
import {
    InlineLink,
    inlineLinkMarkdown,
    readInlineLinks,
} from "./descriptionInlineLinks";
import { labelFor, urlMarkdown } from "./linkInput";
import {
    DescriptionEditor,
    DescriptionEditorHandle,
} from "./description/DescriptionEditor";
import { DescriptionFormatCommand } from "./descriptionFormatting";
import { DescriptionAddLinkDialog } from "./DescriptionAddLinkDialog";
import { t } from "../i18n";

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
    /** Ignorée : la recherche de notes dans des coffres Obsidian n'existe plus. Gardée pour que les appelants de apps/android compilent encore. */
    vaults?: ReadonlyArray<unknown>;
    items: DescriptionLinkedItem[];
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

/** Une petite barre posée sur un lien du texte. */
interface InlineLinkPopup {
    link: InlineLink;
    top: number;
    left: number;
}

/** Un lien du texte, ouvert dans sa fenêtre pour être renommé ou retiré. */
interface InlineLinkEdit {
    link: InlineLink;
    label: string;
    target: string;
    error: string | null;
}

/** De quelle sorte est cette adresse — ce que l'hôte a besoin de savoir. */
function inlineLinkKind(target: string): DescriptionLinkedItem["kind"] {
    if (/^obsidian:\/\//i.test(target)) return "note";
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "web";
    return "attachment";
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

function DescriptionToolbar({
    attachmentDisabled,
    onAttach,
    onFormat,
}: {
    attachmentDisabled: boolean;
    onAttach: () => void;
    onFormat: (command: DescriptionFormatCommand) => void;
}) {
    const button = (
        label: string,
        icon: React.ReactNode,
        command: DescriptionFormatCommand
    ) => (
        <button
            type="button"
            className="nc-description-tool"
            aria-label={label}
            data-nc-tooltip={label}
            data-format-command={command}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onFormat(command)}
        >
            {icon}
        </button>
    );

    return (
        <div
            className="nc-description-toolbar"
            role="toolbar"
            aria-label={t("Description formatting")}
        >
            {button(t("Bold"), <Bold size={16} strokeWidth={2} />, "bold")}
            {button(
                t("Italic"),
                <Italic size={16} strokeWidth={2} />,
                "italic"
            )}
            {button(
                t("Underline"),
                <Underline size={16} strokeWidth={2} />,
                "underline"
            )}
            <span className="nc-description-tool-separator" role="separator" />
            {button(
                t("Numbered list"),
                <ListOrdered size={16} strokeWidth={2} />,
                "ordered-list"
            )}
            {button(
                t("Bulleted list"),
                <List size={16} strokeWidth={2} />,
                "bullet-list"
            )}
            {button(
                t("Checklist item"),
                <ListTodo size={16} strokeWidth={2} />,
                "checklist"
            )}
            <span className="nc-description-tool-separator" role="separator" />
            <button
                type="button"
                className="nc-description-tool"
                aria-label={t("Attachment")}
                data-nc-tooltip={t("Attachment")}
                data-format-command="attachment"
                disabled={attachmentDisabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onAttach}
            >
                <Paperclip size={16} strokeWidth={2} />
            </button>
            {button(
                t("Clear formatting"),
                <RemoveFormatting size={16} strokeWidth={2} />,
                "clear"
            )}
        </div>
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
                data-nc-tooltip={item.target}
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
                    data-nc-tooltip={t("Edit link")}
                    disabled={!editable || !eventId || !onRenameLink}
                    onClick={beginEdit}
                >
                    <PencilIcon size={16} />
                </button>
                <button
                    type="button"
                    aria-label={t("Copy link")}
                    data-nc-tooltip={t("Copy link")}
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
    items,
    onRemoveLink,
    onRenameLink,
    onOpenLink,
    onCopyLink,
    onPickAttachment,
    onReadAttachment,
}: DescriptionSectionProps) {
    const sectionRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<DescriptionEditorHandle>(null);
    /** Whether the person has put the caret in the text at least once: before
     *  that, a toolbar or dialog insert goes to the end, not to offset 0. */
    const touchedRef = React.useRef(false);
    /** La dernière pression sur la rangée est-elle partie du texte ? */
    const pressedInTextRef = React.useRef(false);
    const descriptionRef = React.useRef(description);
    descriptionRef.current = description;
    const [error, setError] = React.useState<string | null>(null);
    const [attaching, setAttaching] = React.useState(false);
    const [attachmentError, setAttachmentError] = React.useState<string | null>(
        null
    );
    const links = items.filter((item) => item.kind !== "attachment");
    const attachments = items.filter((item) => item.kind === "attachment");
    /** Le lien dont la petite barre est ouverte, et où elle est posée. */
    const [linkMenu, setLinkMenu] = React.useState<InlineLinkPopup | null>(
        null
    );
    /** Le lien en cours de renommage, tel que la fenêtre le tient. */
    const [linkEdit, setLinkEdit] = React.useState<InlineLinkEdit | null>(null);
    const [linkCopied, setLinkCopied] = React.useState(false);

    /* Un appui ailleurs referme la petite barre — elle est posee sur le lien,
       pas ancree a lui : rien d'autre ne la ferait disparaitre. */
    React.useEffect(() => {
        if (!linkMenu) return;
        const close = (event: PointerEvent) => {
            const node = event.target;
            if (
                node instanceof Element &&
                node.closest(".nc-description-inline-actions")
            ) {
                return;
            }
            setLinkMenu(null);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [linkMenu]);

    /* Un appui hors de la fenêtre du lien la referme, comme la croix : elle
       est posée au milieu de l'écran, sans voile, et rien d'autre ne dirait
       qu'on l'a quittée. */
    React.useEffect(() => {
        if (!linkEdit) return;
        const close = (event: PointerEvent) => {
            const node = event.target;
            if (
                node instanceof Element &&
                node.closest(".nc-description-inline-link-dialog")
            ) {
                return;
            }
            setLinkEdit(null);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [linkEdit]);

    /** The caret goes to the end the first time something is written before
     *  the person has ever clicked into the text. */
    const ensureCaret = () => {
        if (touchedRef.current) return;
        touchedRef.current = true;
        const end = descriptionRef.current.length;
        editorRef.current?.setSelection(end, end);
    };

    /**
     * A link is text, `[name](address)`, written where the caret is. Returns
     * the written link with its offsets in the whole text.
     */
    const insertMarkdown = (markdown: string): InlineLink | null => {
        const editor = editorRef.current;
        if (!editor) return null;
        ensureCaret();
        const { from } = editor.getSelection();
        const parsed = readInlineLinks(markdown)[0];
        editor.replaceSelection(markdown);
        onCommit();
        return parsed
            ? { ...parsed, start: from + parsed.start, end: from + parsed.end }
            : null;
    };

    /** A bare address pasted over the caret becomes a titled link. */
    const handlePaste = (text: string): boolean => {
        if (!editable) return false;
        const markdown = urlMarkdown(text);
        if (!markdown) return false;
        return insertMarkdown(markdown) !== null;
    };

    /* Le texte avec un lien réécrit ou retiré. Pas de curseur à replacer : la
       fenêtre s'est ouverte à la souris, et la ligne s'est refermée en la
       laissant partir. */
    const applyDescription = (next: string) => {
        descriptionRef.current = next;
        setDescription(next);
        onCommit();
    };

    /** Un clic sur un lien : on y va. C'est tout ce qu'un lien fait. */
    const openInlineLink = (link: InlineLink) => {
        setLinkMenu(null);
        void onOpenLink?.({
            id: `inline:${link.start}`,
            label: link.label,
            target: link.target,
            kind: inlineLinkKind(link.target),
        });
    };

    /**
     * La fenêtre du lien : son nom, son adresse, et de quoi le retirer.
     *
     * Le nom n'est pré-rempli que s'il en est un : celui qui n'est que
     * l'adresse, ou l'abrégé qu'on en tire faute de titre, n'apprend rien et
     * laisserait croire qu'il a été choisi.
     */
    const editInlineLink = (link: InlineLink) => {
        setLinkMenu(null);
        const automatic = labelFor(link.target);
        const named =
            link.label && link.label !== link.target && link.label !== automatic
                ? link.label
                : "";
        setLinkEdit({
            link,
            label: named,
            target: link.target,
            error: null,
        });
    };

    const dismissInlineLink = () => setLinkEdit(null);

    const showInlineLinkMenu = (link: InlineLink, anchor: DOMRect) => {
        setLinkEdit(null);
        setLinkCopied(false);
        const width = 74;
        const height = 40;
        const left = Math.max(
            8,
            Math.min(anchor.left, window.innerWidth - width - 8)
        );
        const top =
            anchor.top - height >= 8 ? anchor.top - height : anchor.bottom + 6;
        setLinkMenu({ link, top, left });
    };

    const copyInlineLink = async (link: InlineLink) => {
        try {
            if (onCopyLink) await onCopyLink(link.target);
            else await navigator.clipboard.writeText(link.target);
            setLinkCopied(true);
            window.setTimeout(() => setLinkCopied(false), 1400);
        } catch {
            setError(t("Could not copy link"));
        }
        setLinkMenu(null);
    };

    const confirmInlineLink = () => {
        if (!linkEdit) return;
        const markdown = urlMarkdown(linkEdit.target);
        const destination = markdown ? markdownTarget(markdown) : null;
        if (!destination) {
            setLinkEdit({
                ...linkEdit,
                error: t("That does not look like a link"),
            });
            return;
        }
        const written = inlineLinkMarkdown(
            linkEdit.label.trim() || labelFor(destination),
            destination
        );
        const text = descriptionRef.current;
        applyDescription(
            text.slice(0, linkEdit.link.start) +
                written +
                text.slice(linkEdit.link.end)
        );
        setLinkEdit(null);
    };

    /**
     * Le lien s'en va d'un coup, et la ligne avec lui quand elle ne disait que
     * ça — sans quoi retirer un lien laisserait une ligne vide à effacer à la
     * main.
     */
    const removeInlineLink = () => {
        if (!linkEdit) return;
        const text = descriptionRef.current;
        const { start, end } = linkEdit.link;
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const breakAfter = text.indexOf("\n", end);
        const lineEnd = breakAfter === -1 ? text.length : breakAfter;
        const rest = (
            text.slice(lineStart, start) + text.slice(end, lineEnd)
        ).trim();
        let from = start;
        let to = end;
        if (!rest) {
            from = lineStart;
            to = breakAfter === -1 ? lineEnd : breakAfter + 1;
            if (breakAfter === -1 && lineStart > 0) from = lineStart - 1;
        }
        applyDescription(text.slice(0, from) + text.slice(to));
        setLinkEdit(null);
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

    const formatDescription = (command: DescriptionFormatCommand) => {
        const editor = editorRef.current;
        if (!editor) return;
        ensureCaret();
        editor.applyFormat(command);
        editor.focus();
    };

    return (
        <div
            ref={sectionRef}
            className="nc-description-section nc-panel-section"
            onFocusCapture={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest(".cm-editor")) {
                    touchedRef.current = true;
                }
            }}
        >
            <DescriptionAddLinkDialog
                hostRef={sectionRef}
                editable={editable}
                items={[...items, ...readInlineLinks(description)]}
                onEditExisting={() => {
                    const editor = editorRef.current;
                    if (!editor) return false;
                    const { from, to } = editor.getSelection();
                    /* Dedans, pas contre : juste avant `[` ou juste après `)`,
                       Ctrl+K ajoute un lien à côté. */
                    const link = readInlineLinks(descriptionRef.current).find(
                        (candidate) =>
                            candidate.start <= from &&
                            to <= candidate.end &&
                            from < candidate.end &&
                            to > candidate.start
                    );
                    if (!link) return false;
                    editInlineLink(link);
                    return true;
                }}
                onInsert={(markdown) => {
                    const inserted = insertMarkdown(markdown);
                    if (inserted) editInlineLink(inserted);
                }}
            />
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

            {attachmentError && (
                <div className="nc-description-link-error" role="alert">
                    {attachmentError}
                </div>
            )}
            {error && (
                <div className="nc-description-link-error" role="alert">
                    {error}
                </div>
            )}

            <div
                /* Locked and empty, the row has nothing to offer: no prompt
                   (the placeholder only exists when editable) and no hover
                   outline. An event from an ICS link nearly always carries a
                   description, but when it has none the row must not present
                   itself as a field to fill in. */
                className={`nc-panel-row nc-panel-row-desc nc-description-composer${
                    !editable && !description
                        ? " nc-panel-row-desc--silent"
                        : ""
                }`}
                onMouseDownCapture={(event) => {
                    const target = event.target;
                    pressedInTextRef.current =
                        target instanceof Element &&
                        target.closest(".cm-editor") !== null;
                }}
                onClick={(event) => {
                    if (!editable) return;
                    /* Une sélection tirée depuis le texte et lâchée à côté
                       finit en clic sur la rangée : ce clic-là n'est pas un
                       clic à côté du texte, et la sélection doit rester. */
                    if (pressedInTextRef.current) return;
                    const target = event.target;
                    if (!(target instanceof Element)) return;
                    // The toolbar made the visual Description surface much
                    // taller than the text itself. Treat the whole
                    // non-interactive surface as the field so a real
                    // click/tap always activates keyboard input.
                    if (
                        target.closest(
                            ".cm-editor, button, a, input, textarea, select, [role='button'], [role='link']"
                        )
                    ) {
                        return;
                    }
                    const editor = editorRef.current;
                    if (!editor) return;
                    const end = descriptionRef.current.length;
                    editor.focus();
                    editor.setSelection(end, end);
                }}
            >
                <span className="nc-panel-row-icon">
                    <LinesIcon />
                </span>
                <div className="nc-panel-row-content">
                    {editable && (
                        <DescriptionToolbar
                            attachmentDisabled={
                                !eventId || !onPickAttachment || attaching
                            }
                            onAttach={() => void attach()}
                            onFormat={formatDescription}
                        />
                    )}
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
                    <DescriptionEditor
                        ref={editorRef}
                        value={description}
                        editable={editable}
                        placeholder={
                            editable ? t("Add a description") : undefined
                        }
                        onChange={(text) => {
                            // Keep the imperative copy in lockstep with typing:
                            // dialogs read it before the next React render.
                            descriptionRef.current = text;
                            setDescription(text);
                        }}
                        onBlur={onCommit}
                        onToggle={onCommit}
                        onOpenLink={openInlineLink}
                        onLinkMenu={showInlineLinkMenu}
                        onPaste={handlePaste}
                    />
                </div>
            </div>

            {linkCopied && (
                <span className="nc-description-link-status" role="status">
                    {t("Link copied")}
                </span>
            )}

            {linkMenu &&
                ReactDOM.createPortal(
                    <div
                        className="nc-description-link-actions nc-description-inline-actions"
                        data-nc-popup-portal="true"
                        style={{ top: linkMenu.top, left: linkMenu.left }}
                    >
                        <button
                            type="button"
                            aria-label={t("Edit link")}
                            data-nc-tooltip={t("Edit link")}
                            disabled={!editable}
                            onClick={() => editInlineLink(linkMenu.link)}
                        >
                            <PencilIcon size={16} />
                        </button>
                        <button
                            type="button"
                            aria-label={t("Copy link")}
                            data-nc-tooltip={t("Copy link")}
                            onClick={() => void copyInlineLink(linkMenu.link)}
                        >
                            <CopyIcon size={16} />
                        </button>
                    </div>,
                    portalTarget()
                )}

            {linkEdit &&
                ReactDOM.createPortal(
                    <div
                        className="nc-description-link-dialog nc-description-inline-link-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("Edit link")}
                        data-nc-popup-portal="true"
                        style={{
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                dismissInlineLink();
                            } else if (event.key === "Enter") {
                                event.preventDefault();
                                event.stopPropagation();
                                confirmInlineLink();
                            }
                        }}
                    >
                        <div className="nc-description-link-dialog-head">
                            <strong>{t("Edit link")}</strong>
                            <button
                                type="button"
                                className="nc-description-link-dialog-close"
                                aria-label={t("Close")}
                                data-nc-tooltip={t("Close")}
                                onClick={dismissInlineLink}
                            >
                                <XIcon size={15} />
                            </button>
                        </div>
                        <input
                            autoFocus
                            value={linkEdit.label}
                            aria-label={t("Link text")}
                            placeholder={t("Link text")}
                            onChange={(event) =>
                                setLinkEdit({
                                    ...linkEdit,
                                    label: event.target.value,
                                    error: null,
                                })
                            }
                        />
                        <input
                            value={linkEdit.target}
                            aria-label={t("Link address")}
                            placeholder={t("Link address")}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(event) =>
                                setLinkEdit({
                                    ...linkEdit,
                                    target: event.target.value,
                                    error: null,
                                })
                            }
                        />
                        {linkEdit.error && (
                            <div
                                className="nc-description-link-dialog-error"
                                role="alert"
                            >
                                {linkEdit.error}
                            </div>
                        )}
                        <div className="nc-description-link-dialog-actions">
                            <button
                                type="button"
                                className="nc-description-link-confirm"
                                disabled={!linkEdit.target.trim()}
                                onClick={confirmInlineLink}
                            >
                                {t("Confirm")}
                            </button>
                            <button
                                type="button"
                                className="nc-description-link-remove"
                                onClick={removeInlineLink}
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
