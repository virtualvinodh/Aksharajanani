import { useLayoutEffect, useRef } from 'react';

/**
 * Lays out a vertical side toolbar (a CSS grid element) in the fewest columns
 * that keep it no taller than its parent element.
 *
 * The side toolbars sit next to the canvas, whose height depends on the window.
 * On laptop-height screens a single tall column used to run past the canvas and
 * get clipped or covered by the panels below it. Starting at `min`, columns are
 * added until the toolbar fits, up to `max` and as long as there is room to
 * the left; if it still does not fit, the toolbar scrolls as a last resort.
 *
 * The parent must have a definite height (e.g. `absolute top-0 bottom-0`).
 */
export function useFitColumns<T extends HTMLElement>(min: number, max: number, enabled = true) {
    const ref = useRef<T>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        const container = el?.parentElement;
        if (!enabled || !el || !container) return;

        // The toolbar grows leftwards from the canvas edge; it must not cross the
        // nearest clipping ancestor (e.g. into the character grid in split view).
        let clipAncestor: HTMLElement | null = null;
        for (let p = container.parentElement; p; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== 'visible') { clipAncestor = p; break; }
        }

        const fit = () => {
            const available = container.clientHeight;
            if (available <= 0) return;
            const leftLimit = clipAncestor ? clipAncestor.getBoundingClientRect().left : 0;
            const setCols = (n: number) => { el.style.gridTemplateColumns = `repeat(${n}, auto)`; };
            let cols = min;
            for (;;) {
                setCols(cols);
                if (cols > min && el.getBoundingClientRect().left < leftLimit) { setCols(--cols); break; }
                if (el.scrollHeight <= available || cols >= max) break;
                cols++;
            }
            el.style.overflowY = el.scrollHeight > available ? 'auto' : '';
        };

        fit();
        // The container's height follows the canvas; its width follows the toolbar,
        // so re-fitting on width changes settles immediately on the same result.
        // The clipping ancestor is observed too: when the editor panel widens
        // (e.g. maximised over the grid) the canvas height stays the same but
        // there is suddenly room for more columns.
        const ro = new ResizeObserver(fit);
        ro.observe(container);
        if (clipAncestor) ro.observe(clipAncestor);
        return () => {
            ro.disconnect();
            el.style.gridTemplateColumns = '';
            el.style.overflowY = '';
        };
    }, [min, max, enabled]);

    return ref;
}
