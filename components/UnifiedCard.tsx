import React, { useMemo } from 'react';
import { Character, UnifiedRenderContext, GlyphData } from '../types';
import CharacterCard from './CharacterCard';
import { useLocale } from '../contexts/LocaleContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { useSettings } from '../contexts/SettingsContext';
import { getUnifiedPaths } from '../services/glyphRenderService';
import { isGlyphComplete } from '../utils/glyphUtils';

// Props it receives from CharacterGrid
interface UnifiedCardProps {
  character: Character;
  onSelect: (character: Character, rect: DOMRect) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (character: Character) => void;
  variant?: 'default' | 'compact' | 'overlay';
  onLongPress?: (character: Character) => void;
  onRegisterRef?: (name: string, el: HTMLElement | null) => void;
}

const UnifiedCard: React.FC<UnifiedCardProps> = (props) => {
  const { character, onLongPress } = props;
  const { t } = useLocale();

  // 1. Gather all data from contexts
  const { glyphDataMap, version: glyphVersion } = useGlyphData();
  const { allCharsByName, characterSets, markAttachmentRules, positioningRules } = useProject();
  const { kerningMap } = useKerning();
  const { markPositioningMap } = usePositioning();
  const { state: rulesState } = useRules();
  const { settings, metrics } = useSettings();
  const groups = rulesState.fontRules?.groups || {};

  // 2. Perform logic calculations using useMemo for performance
  const { resolvedGlyphData, isAvailable, isManuallySet, isConstructed, disabledReason } = useMemo(() => {
    // isAvailable check
    let available = true;
    const missingComponents: string[] = [];
    const sourceChars = character.position || character.kern || character.link;
    if (sourceChars) {
        sourceChars.forEach(name => {
            const comp = allCharsByName.get(name);
            // Check the component exists and is complete: drawn, or itself built (a positioned ϊ is
            // a fine base for ΐ; requiring a drawing of its own kept ΐ and ΰ locked for good).
            if (!comp || comp.unicode === undefined || !isGlyphComplete(comp, glyphDataMap, markPositioningMap, kerningMap, allCharsByName)) {
                missingComponents.push(name);
            }
        });
        available = missingComponents.length === 0;
    }

    const reason = !available && missingComponents.length > 0 
        ? t('unifiedCardDisabledReason', { components: missingComponents.join(', ') }) 
        : undefined;

    // isManuallySet check
    let manuallySet = true; // Default to true for standard glyphs
    if (available) {
        if (character.position) {
            const base = allCharsByName.get(character.position[0]);
            const mark = allCharsByName.get(character.position[1]);
            if (base?.unicode !== undefined && mark?.unicode !== undefined) {
                manuallySet = markPositioningMap.has(`${base.unicode}-${mark.unicode}`);
            }
        } else if (character.kern) {
            const left = allCharsByName.get(character.kern[0]);
            const right = allCharsByName.get(character.kern[1]);
            if (left?.unicode !== undefined && right?.unicode !== undefined) {
                manuallySet = kerningMap.has(`${left.unicode}-${right.unicode}`);
            }
        }
    }
    
    const constructed = !!(character.position || character.kern);
    
    const renderCtx: UnifiedRenderContext = {
      glyphDataMap,
      allCharsByName,
      markPositioningMap,
      kerningMap,
      characterSets: characterSets || [],
      groups,
      metrics: metrics || undefined,
      markAttachmentRules,
      strokeThickness: settings?.strokeThickness || 15,
      positioningRules
    };

    // Path resolution
    const resolvedPaths = getUnifiedPaths(character, renderCtx);
    const resolvedData: GlyphData | undefined = resolvedPaths.length > 0 ? { paths: resolvedPaths } : undefined;

    return { resolvedGlyphData: resolvedData, isAvailable: available, isManuallySet: manuallySet, isConstructed: constructed, disabledReason: reason };
  }, [character, glyphDataMap, allCharsByName, markPositioningMap, kerningMap, characterSets, groups, metrics, markAttachmentRules, positioningRules, settings?.strokeThickness, glyphVersion]);

  // 3. Render CharacterCard with all the resolved props
  return (
    <CharacterCard
      {...props}
      glyphData={resolvedGlyphData}
      isAvailable={isAvailable}
      isManuallySet={isManuallySet}
      isConstructed={isConstructed}
      disabledReason={disabledReason}
      onLongPress={onLongPress}
    />
  );
};

export default React.memo(UnifiedCard);