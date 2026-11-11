import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOptionalJson, fetchOptionalText } from './optionalFetch';

const respond = (body: string, init: ResponseInit = {}) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, init));

describe('optionalFetch', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns the file when it exists', async () => {
        respond('{"DFLT":{}}', { headers: { 'content-type': 'application/json' } });
        expect(await fetchOptionalJson('/data/rules_x.json')).toEqual({ DFLT: {} });
        respond('Hello', { headers: { 'content-type': 'text/plain' } });
        expect(await fetchOptionalText('/data/sample_x.txt')).toBe('Hello');
    });

    it('treats the SPA index.html fallback as absent', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        respond('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } });
        expect(await fetchOptionalJson('/data/positioning_x.json')).toBeNull();
        // Some hosts send HTML without the right content-type.
        respond('<!DOCTYPE html>\n<html lang="en"></html>', { headers: { 'content-type': 'application/octet-stream' } });
        expect(await fetchOptionalText('/data/sample_x.txt')).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    it('treats 404, network errors and empty files as absent', async () => {
        respond('Not found', { status: 404 });
        expect(await fetchOptionalJson('/data/a.json')).toBeNull();
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
        expect(await fetchOptionalText('/data/a.txt')).toBeNull();
        respond('', { headers: { 'content-type': 'application/json' } });
        expect(await fetchOptionalJson('/data/a.json')).toBeNull();
    });

    it('warns about an existing but malformed JSON file', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        respond('{ broken', { headers: { 'content-type': 'application/json' } });
        expect(await fetchOptionalJson('/data/a.json')).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
    });
});
