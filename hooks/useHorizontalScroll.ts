import { useState, useCallback, useEffect } from 'react';

export const useHorizontalScroll = (dependencies: any[] = []) => {
    const [node, setNode] = useState<HTMLElement | null>(null);
    const [visibility, setVisibility] = useState({ left: false, right: false });

    // Use a callback ref to reliably detect when the element is mounted/unmounted
    const scrollRef = useCallback((element: HTMLElement | null) => {
        if (element !== null) {
            setNode(element);
        }
    }, []);

    const checkVisibility = useCallback(() => {
        if (!node) return;
        const tolerance = 1; // 1px tolerance for sub-pixel rendering issues
        const canScrollLeft = node.scrollLeft > tolerance;
        const canScrollRight = Math.abs(node.scrollWidth - node.clientWidth - node.scrollLeft) > tolerance;
        
        setVisibility(prev => {
            if (prev.left === canScrollLeft && prev.right === canScrollRight) {
                return prev;
            }
            return { left: canScrollLeft, right: canScrollRight };
        });
    }, [node]);

    // Re-check visibility whenever dependencies change (e.g. item count)
    useEffect(() => {
        if (node) {
            checkVisibility();
        }
    }, [node, checkVisibility, ...dependencies]);

    useEffect(() => {
        if (!node) return;

        // Check initially
        checkVisibility();
        
        // Listen for scroll and resize
        const handleEvent = () => requestAnimationFrame(checkVisibility);
        
        node.addEventListener('scroll', handleEvent, { passive: true });
        window.addEventListener('resize', handleEvent);
        
        // Also use ResizeObserver for container size changes
        const resizeObserver = new ResizeObserver(handleEvent);
        resizeObserver.observe(node);

        return () => {
            node.removeEventListener('scroll', handleEvent);
            window.removeEventListener('resize', handleEvent);
            resizeObserver.disconnect();
        };
    }, [node, checkVisibility]);

    const handleScroll = useCallback((direction: 'left' | 'right') => {
        if (!node) return;
        const scrollAmount = node.clientWidth * 0.75;
        node.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }, [node]);

    return { visibility, handleScroll, scrollRef, checkVisibility };
};