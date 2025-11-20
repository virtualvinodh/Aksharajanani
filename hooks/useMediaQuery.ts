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
