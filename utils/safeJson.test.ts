import { describe, it, expect } from 'vitest';
import { safeJsonParse, isSafeKey } from './safeJson';
describe('safeJson', () => {
  it('drops prototype keys at every depth and keeps data', () => {
    const r: any = safeJsonParse('{"a":1,"__proto__":{"polluted":true},"b":{"constructor":{"x":1},"c":[{"prototype":2,"d":3}]}}');
    expect(r).toEqual({ a: 1, b: { c: [{ d: 3 }] } });
    expect(Object.assign({}, r).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });
  it('isSafeKey', () => {
    expect(['liga', 'akhn'].every(isSafeKey)).toBe(true);
    expect(['__proto__', 'constructor', 'prototype', undefined, 3].some(isSafeKey)).toBe(false);
  });
});
