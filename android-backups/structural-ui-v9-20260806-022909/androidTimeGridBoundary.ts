type NeoAndroidWindow = Window & {
    NeoAndroid?: unknown;
    __neoMidnightBoundaryV76?: boolean;
};

const neoWindow =
    window as NeoAndroidWindow;

const scrollerSelector =
    ".nc-main-scroller";

const dayRowSelector =
    ".nc-days-row";

const dockSelector =
    ".nc-mobile-agenda-bar";

function isAndroidRuntime(): boolean {
    return (
        Boolean(neoWindow.NeoAndroid) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body?.classList.contains(
            "nc-platform-android"
        ) === true
    );
}

function visibleDockTop(
    scroller: HTMLElement
): number {
    const scrollerRect =
        scroller.getBoundingClientRect();

    const dock =
        document.querySelector<HTMLElement>(
            dockSelector
        );

    if (!dock) {
        return scrollerRect.bottom;
    }

    const style =
        window.getComputedStyle(dock);

    if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity) === 0
    ) {
        return scrollerRect.bottom;
    }

    const dockRect =
        dock.getBoundingClientRect();

    return Math.max(
        scrollerRect.top + 1,
        Math.min(
            scrollerRect.bottom,
            dockRect.top
        )
    );
}

function findGrid(): {
    scroller: HTMLElement;
    dayRow: HTMLElement;
} | null {
    const scroller =
        document.querySelector<HTMLElement>(
            scrollerSelector
        );

    if (!scroller) {
        return null;
    }

    const dayRow =
        scroller.querySelector<HTMLElement>(
            dayRowSelector
        );

    if (!dayRow) {
        return null;
    }

    return {
        scroller,
        dayRow,
    };
}

function installBoundary(): void {
    if (
        !isAndroidRuntime() ||
        neoWindow.__neoMidnightBoundaryV76
    ) {
        return;
    }

    neoWindow.__neoMidnightBoundaryV76 =
        true;

    let activeScroller:
        | HTMLElement
        | null = null;

    let activeDayRow:
        | HTMLElement
        | null = null;

    let animationFrame = 0;
    let correcting = false;
    let resizeObserver:
        | ResizeObserver
        | null = null;

    const bindCurrentGrid = (): boolean => {
        const found = findGrid();

        if (!found) {
            return false;
        }

        if (
            activeScroller === found.scroller &&
            activeDayRow === found.dayRow
        ) {
            return true;
        }

        if (activeScroller) {
            activeScroller.removeEventListener(
                "scroll",
                requestClamp
            );

            activeScroller.removeEventListener(
                "touchmove",
                requestClamp
            );

            activeScroller.removeEventListener(
                "touchend",
                requestClamp
            );

            activeScroller.removeEventListener(
                "pointerup",
                requestClamp
            );
        }

        resizeObserver?.disconnect();

        activeScroller =
            found.scroller;

        activeDayRow =
            found.dayRow;

        activeScroller.dataset.neoMidnightBoundary =
            "v7.6";

        activeScroller.addEventListener(
            "scroll",
            requestClamp,
            {
                passive: true,
            }
        );

        activeScroller.addEventListener(
            "touchmove",
            requestClamp,
            {
                passive: true,
            }
        );

        activeScroller.addEventListener(
            "touchend",
            requestClamp,
            {
                passive: true,
            }
        );

        activeScroller.addEventListener(
            "pointerup",
            requestClamp,
            {
                passive: true,
            }
        );

        resizeObserver =
            new ResizeObserver(
                requestClamp
            );

        resizeObserver.observe(
            activeScroller
        );

        resizeObserver.observe(
            activeDayRow
        );

        const dock =
            document.querySelector<HTMLElement>(
                dockSelector
            );

        if (dock) {
            resizeObserver.observe(dock);
        }

        return true;
    };

    const clampNow = (): void => {
        animationFrame = 0;

        if (!bindCurrentGrid()) {
            return;
        }

        const scroller =
            activeScroller!;

        const dayRow =
            activeDayRow!;

        const dockTop =
            visibleDockTop(
                scroller
            );

        const rowRect =
            dayRow.getBoundingClientRect();

        /*
         * The real end of the day is the rendered bottom edge of
         * .nc-days-row. Sticky headers, all-day content, legacy padding,
         * safe areas and the bottom dock are deliberately excluded.
         *
         * At the maximum valid scroll position:
         *     dayRow.bottom === dock.top
         */
        const overflowPastMidnight =
            dockTop -
            rowRect.bottom;

        if (
            overflowPastMidnight <= 0.5 ||
            scroller.scrollTop <= 0
        ) {
            return;
        }

        const correctedScrollTop =
            Math.max(
                0,
                scroller.scrollTop -
                    overflowPastMidnight
            );

        if (
            Math.abs(
                correctedScrollTop -
                    scroller.scrollTop
            ) <= 0.5
        ) {
            return;
        }

        correcting = true;

        scroller.scrollTop =
            correctedScrollTop;

        scroller.style.setProperty(
            "--nc-scroll-y",
            `${correctedScrollTop}px`
        );

        window.requestAnimationFrame(
            () => {
                correcting = false;
            }
        );
    };

    function requestClamp(): void {
        if (
            correcting ||
            animationFrame
        ) {
            return;
        }

        animationFrame =
            window.requestAnimationFrame(
                clampNow
            );
    }

    const mutationObserver =
        new MutationObserver(
            () => {
                bindCurrentGrid();
                requestClamp();
            }
        );

    mutationObserver.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true,
        }
    );

    window.addEventListener(
        "resize",
        requestClamp
    );

    window.addEventListener(
        "neo-calendar-insets-changed",
        requestClamp
    );

    bindCurrentGrid();
    requestClamp();

    window.setTimeout(
        requestClamp,
        100
    );

    window.setTimeout(
        requestClamp,
        350
    );

    window.setTimeout(
        requestClamp,
        900
    );

    console.info(
        "[NeoMidnightBoundaryV76] installed"
    );
}

if (
    document.readyState === "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        installBoundary,
        {
            once: true,
        }
    );
} else {
    installBoundary();
}

export {};