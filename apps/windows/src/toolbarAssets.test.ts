import * as fs from "fs";
import * as path from "path";

const toolbarDirectory = path.join(__dirname, "assets", "toolbar");
const suppliedIcons = [
    ["chevron-down.svg", "DesktopTitlebar.css"],
    ["chevron-left.svg", "DesktopTitlebar.css"],
    ["chevron-right.svg", "DesktopTitlebar.css"],
    ["close.svg", "DesktopWindowShell.css"],
    ["edit.svg", "DesktopTitlebar.css"],
    ["maximize.svg", "DesktopWindowShell.css"],
    ["minimize.svg", "DesktopWindowShell.css"],
    ["search.svg", "DesktopTitlebar.css"],
    ["settings.svg", "DesktopTitlebar.css"],
    ["sidebar.svg", "DesktopTitlebar.css"],
] as const;

test("toolbar assets are exactly the ten supplied SVG glyphs", () => {
    expect(fs.readdirSync(toolbarDirectory).sort()).toEqual(
        suppliedIcons.map(([icon]) => icon).sort()
    );
});

test("Windows chrome uses every supplied SVG toolbar icon", () => {
    suppliedIcons.forEach(([icon, source]) => {
        expect(fs.existsSync(path.join(toolbarDirectory, icon))).toBe(true);
        expect(fs.readFileSync(path.join(__dirname, source), "utf8")).toContain(
            icon
        );
    });
});
