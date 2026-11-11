import { describe, it, expect } from 'vitest';
import { migrateLegacySettings } from './legacySettings';

describe('migrateLegacySettings', () => {
  it("keeps 'advanced' projects on the Kerning label", () => {
    expect(migrateLegacySettings({ editorMode: 'advanced' } as never)).toEqual({ preferKerningTerm: true });
  });
  it("leaves 'simple' projects on the Spacing label", () => {
    expect(migrateLegacySettings({ editorMode: 'simple' } as never)).toEqual({});
  });
  it("respects a preference the user already set", () => {
    expect(migrateLegacySettings({ editorMode: 'advanced', preferKerningTerm: false } as never)).toEqual({ preferKerningTerm: false });
  });
});
