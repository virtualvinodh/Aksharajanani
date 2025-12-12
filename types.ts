
export interface Point {
  x: number;
  y: number;
}

export type PathType = 'pen' | 'line' | 'circle' | 'dot' | 'curve' | 'ellipse' | 'calligraphy' | 'outline';

export interface Segment {
  point: Point;
  handleIn: Point;
  handleOut: Point;
}

export interface Path {
  id: string;
  type: PathType;
  points: Point[];
  angle?: number; // For calligraphy pen
  segmentGroups?: Segment[][]; // For outline type
  groupId?: string;
}

export interface GlyphData {
  paths: Path[];
  _cache?: {
    bbox?: {
      data: BoundingBox | null;
      strokeThickness: number;
    };
  };
}

export interface ImageTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // in radians
}

export interface TransformState {
  rotate: number; // degrees
  scale: number;  // multiplier
  flipX?: boolean;
  flipY?: boolean;
}

export interface Character {
  unicode?: number;
  name: string;
  lsb?: number;
  rsb?: number;
  glyphClass?: 'base' | 'ligature' | 'mark';
  composite?: string[];
  link?: string[];
  sourceLink?: string[]; // To remember original link after unlinking
  compositeTransform?: [number, number] | (number | 'absolute' | 'touching')[][]; // [scale, yOffset] or [[scale, yOffset, 'absolute'?], ...]
  isCustom?: boolean;
  advWidth?: number | string;
  isPuaAssigned?: boolean;
  option?: string;
  desc?: string;
  if?: string;
  hidden?: boolean;
}

export interface CharacterSet {
  nameKey: string;
  characters: Character[];
}

export type RecommendedKerning = [string, string, string | number] | [string, string];

export interface PositioningRules {
  base: string[];
  mark: string[];
  gpos?: string;
  gsub?: string;
  ligatureMap?: {
    [baseCharName: string]: {
      [markCharName: string]: string; // ligature name
    };
  };
  movement?: 'horizontal' | 'vertical';
}

export type AttachmentPoint = 'topLeft' | 'topCenter' | 'topRight' | 'midLeft' | 'midRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';

export interface MarkAttachmentRules {
  [baseCharName: string]: {
    [markCharName:string]: [AttachmentPoint, AttachmentPoint] | [AttachmentPoint, AttachmentPoint, string, string];
  };
}

export interface AttachmentClass {
  name?: string;
  members: string[];
  exceptions?: string[];
  applies?: string[];
}


// FIX: Added `groups` to the CharacterDefinition union type.
// This resolves a TypeScript error where a find and cast operation for a `groups` property was failing because the type was missing from the union.
export type CharacterDefinition = CharacterSet | { recommendedKerning: RecommendedKerning[] } | { positioning: PositioningRules[] } | { markAttachment: MarkAttachmentRules } | { markAttachmentClass: AttachmentClass[] } | { baseAttachmentClass: AttachmentClass[] } | { groups: Record<string, string[]> };

export interface AppSettings {
  strokeThickness: number;
  contrast: number;
  pathSimplification: number;
  fontName: string;
  showGridOutlines: boolean;
  isAutosaveEnabled: boolean;
  editorMode: 'simple' | 'advanced';
  isPrefillEnabled?: boolean;
  showHiddenGlyphs: boolean;
  showUnicodeValues: boolean;
  preferKerningTerm?: boolean;
  // Font Meta Data
  manufacturer?: string;
  designer?: string;
  description?: string;
  vendorURL?: string;
  designerURL?: string;
  licenseDescription?: string;
  licenseInfoURL?: string;
  testPage?: TestPageConfig;
  isDebugKerningEnabled?: boolean;
  customSampleText?: string;
}

export type KerningMap = Map<string, number>;
export type MarkPositioningMap = Map<string, Point>;

export interface ProjectData {
  projectId?: number;
  scriptId?: string;
  name?: string; // Display name for the project file (distinct from fontName)
  settings: AppSettings;
  glyphs: [number, GlyphData][];
  kerning?: [string, number][];
  markPositioning?: [string, Point][];
  characterSets?: CharacterSet[];
  fontRules?: any;
  isFeaEditMode?: boolean;
  manualFeaCode?: string;
  metrics?: FontMetrics;
  savedAt?: string;
  
  // Unified Model Additions:
  // These fields allow the project to be self-contained without relying on external static JSONs.
  positioningRules?: PositioningRules[];
  markAttachmentRules?: MarkAttachmentRules;
  markAttachmentClasses?: AttachmentClass[];
  baseAttachmentClasses?: AttachmentClass[];
  recommendedKerning?: RecommendedKerning[];
  // Although fontRules contains groups, we sometimes track them separately in UI state
  groups?: Record<string, string[]>; 
  guideFont?: GuideFont;
}

export interface ProjectSnapshot {
  id?: number; // Auto-incremented ID
  projectId: number;
  data: ProjectData;
  timestamp: number;
  name?: string; // Optional user-friendly name
}

export interface FontMetrics {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    defaultAdvanceWidth: number;
    topLineY: number; // Canvas Y coordinate for top guide
    baseLineY: number; // Canvas Y coordinate for base guide
    styleName: string;
    spaceAdvanceWidth: number;
    defaultLSB: number;
    defaultRSB: number;
    superTopLineY?: number;
    subBaseLineY?: number;
}

// FIX: Export BoundingBox interface for use in other components.
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScriptDefaults {
    fontName: string;
    strokeThickness: number;
    contrast?: number;
    pathSimplification: number;
    showGridOutlines: boolean;
    isAutosaveEnabled: boolean;
    editorMode: 'simple' | 'advanced';
    isPrefillEnabled: boolean;
    showHiddenGlyphs?: boolean;
    showUnicodeValues?: boolean;
    preferKerningTerm?: boolean;
}

export interface Range {
    min: number;
    max: number;
    step?: number;
}

export interface SliderRange extends Range {
    step: number;
}

export interface ToolRanges {
    strokeThickness: Range;
    pathSimplification: Range;
    contrast: Range;
}

export interface TestPageConfig {
    fontSize: {
        default: number;
    };
    lineHeight: {
        default: number;
    };
}

export interface GuideFont {
  fontName: string;
  fontUrl: string;
  stylisticSet: string;
}

export interface ScriptConfig {
  id:string;
  nameKey: string;
  charactersPath: string;
  rulesPath: string;
  rulesFeaPath?: string;
  rulesFeaContent?: string;
  metrics: FontMetrics;
  sampleText: string;
  defaults: ScriptDefaults;
  grid: {
    characterNameSize: number;
  };
  guideFont: GuideFont;
  testPage: TestPageConfig;
  // Optional pre-loaded data for custom scripts
  characterSetData?: CharacterDefinition[];
  rulesData?: any;
  support?: string;
  supportMessage?: string;
  kerning?: string;
  touchingConsonants?: string;
}

export interface ScriptsFile {
    defaultScriptId: string;
    scripts: ScriptConfig[];
}

export type Theme = 'light' | 'dark';

export type Locale = 'en' | 'ta' | 'de' | 'es' | 'fr' | 'hi' | 'kn' | 'ml' | 'si' | 'te';

export interface LocaleInfo {
  code: Locale;
  nativeName: string;
}

export type Tool = 'pen' | 'eraser' | 'line' | 'dot' | 'circle' | 'curve' | 'select' | 'pan' | 'edit' | 'ellipse' | 'calligraphy' | 'slice';

export interface UnicodeBlock {
  name: string;
  start: number;
  end: number;
}

export type FilterMode = 'none' | 'all' | 'completed' | 'incomplete';
