/* Removal matches on the capture flag, and the object form is the one every
   runtime agrees on: Node's EventTarget does not read a bare `true` as the
   `{capture: true}` a listener was added with, so the pair would never meet. */
const CAPTURE = { capture: true } as const;

/**
 * Eat the compatibility click that a press we already acted on still owes us.
 *
 * A press that removes what sits under the finger leaves the browser with a
 * click left to deliver, and the browser hit-tests again when it delivers it:
 * it lands on whatever the vanished element was covering. `preventDefault()` on
 * the press does not suppress that click — only swallowing it does.
 *
 * The guard is meant to outlive whatever armed it. Closing usually unmounts the
 * component, and a guard torn down with it would be gone before the click it
 * exists to eat; it disarms itself instead.
 *
 * @param windowMs How long to stay armed. A press does not always produce a
 * click (a drag, a cancelled touch), and a listener left armed would eat the
 * next real one. A mouse hands the click over within the same task; Chrome on
 * Android takes a few milliseconds after `touchend`, which is what the default
 * covers.
 * @returns A disposer, for the rare caller that outlives the window itself.
 */
export function swallowNextClick(windowMs = 350): () => void {
    const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
        clearTimeout(timer);
    };

    document.addEventListener("click", swallow, {
        capture: true,
        once: true,
    });
    const timer = setTimeout(() => {
        document.removeEventListener("click", swallow, CAPTURE);
    }, windowMs);

    return () => {
        clearTimeout(timer);
        document.removeEventListener("click", swallow, CAPTURE);
    };
}
