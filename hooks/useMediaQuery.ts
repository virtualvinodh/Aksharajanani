import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    
    mediaQueryList.addEventListener('change', listener);
    
    // Re-check on mount just in case it changed between initial state and effect run
    if (mediaQueryList.matches !== matches) {
        setMatches(mediaQueryList.matches);
    }

    return () => mediaQueryList.removeEventListener('change', listener);
  }, [query]);

  return matches;
};

/**
 * True on screens too short to keep the linked-glyph strips open by default
 * (most laptops). Each expanded strip takes ~100px from the canvas, so they
 * start collapsed there; the user can still open them.
 */
export const isShortViewport = (): boolean => window.matchMedia('(max-height: 899px)').matches;
