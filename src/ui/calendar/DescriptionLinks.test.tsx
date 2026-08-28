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

describe("the description editing toolbar", () => {
    afterEach(() => applyLanguage("fr"));

    it("keeps every editing action icon-only and in the requested order", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(
            <DescriptionSection
                {...baseProps}
                items={[]}
                onPickAttachment={async () => {}}
            />
        );
        const labels = [
            "Gras",
            "Italique",
            "Souligné",
            "Liste numérotée",
            "Liste à puces",
            "Élément à vérifier",
            "Pièce jointe",
            "Effacer la mise en forme",
        ];

        expect(html).toContain('role="toolbar"');
        expect(html).not.toContain("nc-panel-row-attachment");
        expect(html).not.toContain("nc-panel-row-label");
        labels.forEach((label) => {
            expect(html).toContain(`aria-label="${label}"`);
            expect(html).toContain(`data-tooltip="${label}"`);
        });
        const positions = labels.map((label) =>
            html.indexOf(`aria-label="${label}"`)
        );
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it("keeps the same toolbar when the description already has a checklist", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(
            <DescriptionSection
                {...baseProps}
                description={"- [ ] Vérifier le dossier"}
                items={[]}
                onPickAttachment={async () => {}}
            />
        );

        expect(html).toContain('role="toolbar"');
        expect(html).toContain('aria-label="Pièce jointe"');
        expect(html).toContain("nc-panel-checklist");
    });

    it("keeps formatting available on drafts while disabling attachments", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(
            <DescriptionSection
                {...baseProps}
                eventId={null}
                items={[]}
                onPickAttachment={async () => {}}
            />
        );

        expect(html).toMatch(/aria-label="Gras"(?![^>]*disabled)[^>]*>/);
        expect(html).toMatch(/aria-label="Pièce jointe"[^>]*disabled=""[^>]*>/);
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
        expect(html).not.toContain('role="toolbar"');
        expect(html).not.toContain("Maintenir pour supprimer");
    });
});
