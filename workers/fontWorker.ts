/// <reference lib="webworker" />
/**
 * Font outline generation worker (stage 1 of export).
 *
 * Bundled by Vite as a module worker (see `new Worker(new URL(...), { type: 'module' })` in
 * services/fontService.ts), so opentype.js and paper.js come from the app's own dependencies
 * instead of unpinned CDN URLs, and export stage 1 works offline.
 */
import { createFont } from '../services/fontBuilder';
import { GlyphData } from '../types';

self.onmessage = (e: MessageEvent) => {
    try {
        const { glyphDataArray, shouldExportEmptyMapArray, settings, fontRules, metrics, characterSets, isEditMode } = e.data;
        const glyphData = new Map<number, GlyphData>(glyphDataArray);
        const shouldExportEmptyMap = new Map<number, boolean>(shouldExportEmptyMapArray);
        const shouldExportEmpty = (unicode: number) => shouldExportEmptyMap.get(unicode) || false;

        // Minimal 't' function for error messages inside the worker
        const t = (key: string) => key;

        const fontObject = createFont(glyphData, settings, t, fontRules, metrics, characterSets, isEditMode, shouldExportEmpty);
        const fontBuffer: ArrayBuffer = fontObject.toArrayBuffer();

        // Post the buffer back as a transferable object for efficiency
        self.postMessage({ success: true, fontBuffer }, [fontBuffer]);
    } catch (error) {
        self.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
        self.close();
    }
};
