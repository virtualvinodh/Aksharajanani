import { UnicodeBlock } from '../types';

declare var UnicodeProperties: any;

let blockCache: UnicodeBlock[] | null = null;

export const getUnicodeBlocks = async (): Promise<UnicodeBlock[]> => {
  if (blockCache) {
    return blockCache;
  }

  try {
    const response = await fetch('/data/unicode_blocks.json');
    if (!response.ok) {
        throw new Error(`Failed to fetch Unicode blocks data: ${response.statusText}`);
    }
    const blocks: UnicodeBlock[] = await response.json();
    
    blockCache = blocks;
    return blocks;
  } catch (error) {
    console.error("Error fetching or parsing Unicode blocks:", error);
    return [];
  }
};

export const getAssignedCodepointsInBlock = (block: UnicodeBlock): number[] => {
  if (typeof UnicodeProperties === 'undefined') {
    console.error("UnicodeProperties library is not loaded.");
    return [];
  }
  const assignedCps: number[] = [];
  // Exclude categories that do not represent valid, drawable characters for a standard font.
  // Cn: Unassigned, Cc: Control, Cs: Surrogate, Co: Private Use
  const excludedCategories = new Set(["Cn", "Cc", "Cs", "Co"]);

  for (let cp = block.start; cp <= block.end; cp++) {
    const category = UnicodeProperties.getCategory(cp);
    if (!excludedCategories.has(category)) {
      assignedCps.push(cp);
    }
  }
  return assignedCps;
};