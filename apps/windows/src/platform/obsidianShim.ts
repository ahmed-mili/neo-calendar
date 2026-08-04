/** Runtime shims for shared UI modules that only need a tiny part of Obsidian. */
export class Notice {
    private element: HTMLDivElement | null = null;

    constructor(message: string, timeout = 4000) {
        if (typeof document === "undefined") return;
        const element = document.createElement("div");
        element.className = "nc-desktop-notice";
        element.textContent = message;
        document.body.appendChild(element);
        this.element = element;
        window.setTimeout(() => this.hide(), timeout);
    }

    hide(): void {
        this.element?.remove();
        this.element = null;
    }
}

export class TFile {
    path = "";
    basename = "";
}

export class TFolder {
    path = "";
    children: unknown[] = [];
}

export function parseYaml(line: string): Record<string, unknown> | null {
    const colon = line.indexOf(":");
    if (colon <= 0) return null;
    const key = line.slice(0, colon).trim();
    if (!key) return null;
    return { [key]: line.slice(colon + 1).trim() };
}

export class Modal {}
export class Setting {}
export class FuzzySuggestModal<T = unknown> {}
export class Scope {}
export class App {}

export async function request(): Promise<never> {
    throw new Error("Obsidian request() is unavailable in the Windows app.");
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function setIcon(element: HTMLElement, name: string): void {
    element.setAttribute("data-icon", name);
}

export function getIcon(_name: string): SVGElement | null {
    return null;
}

export const Platform = {
    isMobile: false,
    isDesktop: true,
    isDesktopApp: true,
};
