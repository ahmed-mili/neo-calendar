import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    DescriptionSection,
    editableDescriptionLinkLabel,
} from "./DescriptionSection";
import { applyLanguage } from "../i18n";

const noOp = () => {};
const baseProps = {
    description: "",
    editable: true,
    setDescription: noOp,
    onCommit: noOp,
    eventId: "Calendrier/2026-08-27.md",
    vaults: [],
};

describe("the compact links and attachments flow", () => {
    afterEach(() => applyLanguage("fr"));

    it("keeps attachments as their own compact action", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(
            <DescriptionSection
                {...baseProps}
                items={[]}
                onPickAttachment={async () => {}}
            />
        );

        expect(html).toContain("Pièce-jointe");
        expect(html).not.toContain("Ajouter des liens et des fichiers");
        expect(html).toContain("nc-panel-row-attachment");
    });

    it("renders persisted web links inside the description", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(
            <DescriptionSection
                {...baseProps}
                items={[
                    {
                        id: "web:https://calendar.google.com/calendar/u/0/r?pli=1",
                        label: "calendar.google.com/calendar/u/0/r?pli=1",
                        target: "https://calendar.google.com/calendar/u/0/r?pli=1",
                        kind: "web",
                    },
                ]}
                onRenameLink={async () => {}}
                onRemoveLink={async () => {}}
                onCopyLink={async () => {}}
            />
        );

        expect(html).toContain("nc-description-link");
        expect(html).toContain(
            "https://calendar.google.com/calendar/u/0/r?pli=1"
        );
        expect(html).toContain('aria-label="Modifier le lien"');
        expect(html).toContain('aria-label="Copier le lien"');
    });

    it("leaves the text field empty when the link has no custom label", () => {
        expect(
            editableDescriptionLinkLabel({
                id: "web:https://example.com",
                label: "https://example.com",
                target: "https://example.com",
                kind: "web",
            })
        ).toBe("");
    });

    it("keeps read-only attachments visible without mutation controls", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(
            <DescriptionSection
                {...baseProps}
                editable={false}
                items={[
                    {
                        id: "attachment:file.pdf",
                        label: "file.pdf",
                        target: "attachments/file.pdf",
                        kind: "attachment",
                    },
                ]}
                onRemoveLink={async () => {}}
            />
        );

        expect(html).toContain("file.pdf");
        expect(html).not.toContain("Maintenir pour supprimer");
    });
});
