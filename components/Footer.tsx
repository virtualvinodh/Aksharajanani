
import React from 'react';

interface FooterProps {
    hideOnMobile?: boolean;
    /** Hide on screens shorter than 1000px, where every pixel of height goes to the canvas. */
    hideOnShortScreens?: boolean;
}

const Footer: React.FC<FooterProps> = ({ hideOnMobile, hideOnShortScreens }) => {
    return (
        <footer className={`w-full text-center p-4 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 ${hideOnMobile ? 'hidden sm:block' : ''} ${hideOnShortScreens ? '[@media(max-height:999px)]:hidden!' : ''}`}>
            © 2025 <a href="https://www.virtualvinodh.com">Vinodh Rajan</a> vinodh@virtualvinodh.com
        </footer>
    );
};

export default React.memo(Footer);
