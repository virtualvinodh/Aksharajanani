import { AppSettings } from '../types';

/**
 * Settings saved by older versions had `editorMode: 'simple' | 'advanced'`. The modes are
 * gone (the app uses progressive disclosure); the only thing the flag still did was show
 * "Kerning" instead of "Spacing" for 'advanced' projects, which `preferKerningTerm` now
 * does on its own. This keeps those projects' labels unchanged and drops the old field.
 */
export const migrateLegacySettings = <T extends Partial<AppSettings>>(settings: T): T => {
    const legacy = settings as T & { editorMode?: string };
    if (legacy.editorMode === 'advanced' && legacy.preferKerningTerm === undefined) {
        legacy.preferKerningTerm = true;
    }
    delete legacy.editorMode;
    return settings;
};
