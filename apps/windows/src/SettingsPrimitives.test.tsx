import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    SettingsGroup,
    SettingsRow,
    SettingsToggleRow,
    SettingsChoiceRow,
} from "./SettingsPrimitives";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("SettingsGroup", () => {
    it("names the group for assistive technology", () => {
        const markup = html(
            <SettingsGroup title="Affichage">
                <SettingsRow label="Semaine" />
            </SettingsGroup>
        );

        expect(markup).toContain("Affichage");
        expect(markup).toContain('aria-label="Affichage"');
    });

    it("carries a group without a visible title", () => {
        const markup = html(
            <SettingsGroup>
                <SettingsRow label="Profil" />
            </SettingsGroup>
        );

        expect(markup).toContain("Profil");
    });
});

describe("SettingsRow", () => {
    // The value sits at the right edge, opposite its label: the eye runs down
    // one column of names and one column of answers instead of zig-zagging.
    it("shows the current value beside the label", () => {
        const markup = html(<SettingsRow label="Thème" value="Sombre" />);

        expect(markup).toContain("Thème");
        expect(markup).toContain("Sombre");
    });

    it("is a button only when it does something", () => {
        expect(html(<SettingsRow label="Version" />)).not.toContain("<button");
        expect(
            html(<SettingsRow label="Thème" onClick={() => undefined} />)
        ).toContain("<button");
    });
});

describe("SettingsToggleRow", () => {
    it("reports its state rather than looking switched on", () => {
        const on = html(
            <SettingsToggleRow
                label="Format 24 h"
                checked
                onChange={() => undefined}
            />
        );

        expect(on).toContain('role="switch"');
        expect(on).toContain('aria-checked="true"');
    });

    it("reports being off", () => {
        const off = html(
            <SettingsToggleRow
                label="Format 24 h"
                checked={false}
                onChange={() => undefined}
            />
        );

        expect(off).toContain('aria-checked="false"');
    });
});

describe("SettingsChoiceRow", () => {
    it("shows the label of the selected option, not its value", () => {
        const markup = html(
            <SettingsChoiceRow
                label="Premier jour"
                value="1"
                options={[
                    { value: "0", label: "Dimanche" },
                    { value: "1", label: "Lundi" },
                ]}
                onOpen={() => undefined}
                onChange={() => undefined}
            />
        );

        expect(markup).toContain("Lundi");
        expect(markup).not.toContain(">1<");
    });

    it("falls back to nothing rather than showing a raw value it cannot name", () => {
        const markup = html(
            <SettingsChoiceRow
                label="Premier jour"
                value="9"
                options={[{ value: "1", label: "Lundi" }]}
                onOpen={() => undefined}
                onChange={() => undefined}
            />
        );

        expect(markup).not.toContain(">9<");
    });

    // The list is a page of its own, so the row has to say it leads somewhere.
    it("carries a chevron because it opens a page", () => {
        const markup = html(
            <SettingsChoiceRow
                label="Premier jour"
                value="1"
                options={[{ value: "1", label: "Lundi" }]}
                onOpen={() => undefined}
                onChange={() => undefined}
            />
        );

        expect(markup).toContain("nc-set-row__trailing");
    });
});
