import * as React from "react";
import * as ReactDOM from "react-dom";
import { App, Modal } from "obsidian";

/**
 * Builds the modal's contents. Receives a `close` callback so the React tree can
 * dismiss the modal it's mounted in (after a submit, say) without knowing about
 * Obsidian at all.
 */
type RenderCallback = (
    close: () => void
) => Promise<ReturnType<typeof React.createElement>>;

/** An Obsidian modal whose body is a React tree. */
export default class ReactModal extends Modal {
    private render: RenderCallback;

    constructor(app: App, render: RenderCallback) {
        super(app);
        this.render = render;
    }

    async onOpen() {
        ReactDOM.render(await this.render(() => this.close()), this.contentEl);
    }

    onClose() {
        // React 17: unmount by hand, or the tree leaks when the modal closes.
        ReactDOM.unmountComponentAtNode(this.contentEl);
    }
}
