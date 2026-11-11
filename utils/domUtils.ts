
/**
 * True when a keyboard event target is a text-entry element (input, textarea,
 * select or contentEditable), so global shortcuts like Backspace/Delete
 * should leave the key to the field.
 */
export const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!target) return false;
    const el = target as Partial<HTMLElement>;
    if (el.isContentEditable) return true;
    const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/**
 * True for wheel events the browser would treat as page zoom: trackpad pinch
 * (reported as a wheel event with ctrlKey set) and Ctrl+wheel.
 */
export const isZoomWheelGesture = (e: Pick<WheelEvent, 'ctrlKey'>): boolean => e.ctrlKey;
