import React from 'react';

/**
 * Renders the small subset of markdown used in locale strings (help, about, tutorial and hints)
 * as React elements. Never use dangerouslySetInnerHTML for locale text; use this instead.
 *
 * Supported:
 * - `**bold**`
 * - `*italic*` (the opening `*` must be followed by a non-space, so a "* " list bullet stays as text)
 * - `` `code` ``
 *
 * Bold and italic may contain code and each other. Anything else (including unmatched markers)
 * is rendered as plain text. Line breaks are left as-is; give the container `whitespace-pre-line`
 * when the text has them.
 */

// Leftmost match wins; at the same position code beats bold, and bold beats italic.
const INLINE_PATTERN = /`([^`]+)`|\*\*([\s\S]+?)\*\*|\*(?=[^\s*])([^*\n]*?[^\s*])\*/g;

const CODE_CLASS = 'bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400 mx-0.5';
const STRONG_CLASS = 'font-semibold text-gray-800 dark:text-gray-200';

const parseInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const pattern = new RegExp(INLINE_PATTERN.source, 'g');

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
        const key = `${keyPrefix}${match.index}`;
        const [, code, bold, italic] = match;
        if (code !== undefined) {
            nodes.push(<code key={key} className={CODE_CLASS}>{code}</code>);
        } else if (bold !== undefined) {
            nodes.push(<strong key={key} className={STRONG_CLASS}>{parseInline(bold, `${key}-`)}</strong>);
        } else {
            nodes.push(<em key={key}>{parseInline(italic, `${key}-`)}</em>);
        }
        lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
};

export const renderFormattedText = (text: string | null | undefined): React.ReactNode => {
    if (!text) return null;
    return <>{parseInline(text, '')}</>;
};
