import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderFormattedText } from './formattedText';

const html = (text: string | null | undefined) => renderToStaticMarkup(<p>{renderFormattedText(text)}</p>);
const stripClasses = (markup: string) => markup.replace(/ class="[^"]*"/g, '');

describe('renderFormattedText', () => {
    it('renders **bold** as <strong>', () => {
        expect(stripClasses(html('The **Pen Tool** is active.'))).toBe('<p>The <strong>Pen Tool</strong> is active.</p>');
    });

    it('renders `code` and *italic*', () => {
        expect(stripClasses(html('Press `Ctrl + S` to save *now*.'))).toBe('<p>Press <code>Ctrl + S</code> to save <em>now</em>.</p>');
    });

    it('renders code inside bold', () => {
        expect(stripClasses(html('**Use `n̄` here**'))).toBe('<p><strong>Use <code>n̄</code> here</strong></p>');
    });

    it('keeps "* " list bullets and unmatched markers as text', () => {
        expect(stripClasses(html('* **Drawing:** shapes\n* 2 * 3'))).toBe('<p>* <strong>Drawing:</strong> shapes\n* 2 * 3</p>');
        expect(stripClasses(html('a **b'))).toBe('<p>a **b</p>');
    });

    it('escapes HTML instead of rendering it', () => {
        expect(html('<img src=x onerror=alert(1)> **ok**')).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('renders nothing for empty input', () => {
        expect(html('')).toBe('<p></p>');
        expect(html(undefined)).toBe('<p></p>');
    });
});
