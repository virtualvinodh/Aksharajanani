import { describe, it, expect } from 'vitest';
import { isEditableTarget, isZoomWheelGesture } from './domUtils';

const el = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable }) as unknown as EventTarget;

describe('domUtils', () => {
  describe('isEditableTarget', () => {
    it('is true for inputs, textareas and selects', () => {
      expect(isEditableTarget(el('INPUT'))).toBe(true);
      expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
      expect(isEditableTarget(el('SELECT'))).toBe(true);
    });

    it('ignores tag-name case', () => {
      expect(isEditableTarget(el('input'))).toBe(true);
    });

    it('is true for contentEditable elements', () => {
      expect(isEditableTarget(el('DIV', true))).toBe(true);
    });

    it('is false for other elements, window-like targets and null', () => {
      expect(isEditableTarget(el('CANVAS'))).toBe(false);
      expect(isEditableTarget(el('BODY'))).toBe(false);
      expect(isEditableTarget({} as EventTarget)).toBe(false);
      expect(isEditableTarget(null)).toBe(false);
    });
  });

  describe('isZoomWheelGesture', () => {
    it('treats ctrl+wheel (and trackpad pinch) as zoom', () => {
      expect(isZoomWheelGesture({ ctrlKey: true })).toBe(true);
    });

    it('leaves plain scroll alone', () => {
      expect(isZoomWheelGesture({ ctrlKey: false })).toBe(false);
    });
  });
});
