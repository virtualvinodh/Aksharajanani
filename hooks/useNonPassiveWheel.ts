import React, { useEffect, useRef } from 'react';
import { isZoomWheelGesture } from '../utils/domUtils';

/**
 * Attaches a native, non-passive `wheel` listener to the element in `ref`.
 * React's onWheel is passive, so preventDefault() there is ignored and pinch /
 * Ctrl+wheel also zooms the whole page. This listener cancels the browser
 * default for those zoom gestures and then calls `handler`. Plain scroll is
 * not cancelled.
 */
export const useNonPassiveWheel = <T extends HTMLElement>(
    ref: React.RefObject<T>,
    handler: (e: WheelEvent) => void,
) => {
    const handlerRef = useRef(handler);
    useEffect(() => { handlerRef.current = handler; }, [handler]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const listener = (e: WheelEvent) => {
            if (isZoomWheelGesture(e)) e.preventDefault();
            handlerRef.current(e);
        };
        el.addEventListener('wheel', listener, { passive: false });
        return () => el.removeEventListener('wheel', listener);
    }, [ref]);
};
