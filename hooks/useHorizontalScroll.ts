import { useState, useCallback, useEffect, RefObject } from 'react';

export const useHorizontalScroll = (scrollRef: RefObject<HTMLDivElement>) => {
    const [visibility, setVisibility] = useState({ left: false, right: false });

    const checkVisibility = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const tolerance = 1;
        const canScrollLeft = el.scrollLeft > tolerance;
        const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - tolerance;
        setVisibility({ left: canScrollLeft, right: canScrollRight });
    }, [scrollRef]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        checkVisibility();
        const resizeObserver = new ResizeObserver(checkVisibility);
        resizeObserver.observe(el);
        el.addEventListener('scroll', checkVisibility, { passive: true });

        return () => {
            if (el) {
                resizeObserver.unobserve(el);
                el.removeEventListener('scroll', checkVisibility);
            }
        };
    }, [checkVisibility, scrollRef]);

    const handleScroll = (direction: 'left' | 'right') => {
        const el = scrollRef.current;
        if (!el) return;
        const scrollAmount = el.clientWidth * 0.8;
        el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    };

    return { visibility, handleScroll };
};
