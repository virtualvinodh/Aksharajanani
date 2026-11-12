// Prints the app's own default mark placement for letter + mark pairs of a project, using the
// same code the app uses (calculateDefaultMarkOffset, getAccurateGlyphBBox). Used by
// rulecheck.py to check that pairs synced with a hand-moved one moved by the same amount.
//   npx tsx tools/font/app-defaults.ts project.json base1:mark1 base2:mark2 …   (names)
import { readFileSync } from 'fs';
import { calculateDefaultMarkOffset } from '../../services/positioningHeuristicsService';
import { getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { expandMembers } from '../../services/groupExpansionService';

const [projectPath, ...pairs] = process.argv.slice(2);
const project = JSON.parse(readFileSync(projectPath, 'utf8'));
const chars = project.characterSets.flatMap((s: { characters?: unknown[] }) => s.characters || []);
const byName = new Map(chars.map((c: { name: string }) => [c.name, c]));
const glyphs = new Map(project.glyphs.map(([k, v]: [string | number, unknown]) => [Number(k), v]));
const groups = { ...(project.fontRules?.groups || {}), ...(project.groups || {}) };
const stroke = project.settings?.strokeThickness ?? 15;
const out: Record<string, { x: number; y: number } | null> = {};
for (const pair of pairs) {
    const [b, m] = pair.split(':');
    const base: any = byName.get(b), mark: any = byName.get(m);
    const cp = (c: any) => (c?.unicode ?? ([...c.name].length === 1 ? c.name.codePointAt(0) : undefined));
    const bg: any = glyphs.get(cp(base)), mg: any = glyphs.get(cp(mark));
    if (!base || !mark || !bg || !mg) { out[pair] = null; continue; }
    // The pair's rule may allow only horizontal or vertical movement (as positioningService does).
    const rule = (project.positioningRules || []).find((r: any) =>
        expandMembers(r.base, groups, project.characterSets).includes(b) && expandMembers(r.mark || [], groups, project.characterSets).includes(m));
    const constraint = rule?.movement === 'horizontal' || rule?.movement === 'vertical' ? rule.movement : 'none';
    out[pair] = calculateDefaultMarkOffset(base, mark, getAccurateGlyphBBox(bg.paths, stroke), getAccurateGlyphBBox(mg.paths, stroke),
        project.markAttachmentRules, project.metrics, project.characterSets, false, groups, constraint);
}
console.log(JSON.stringify(out));
