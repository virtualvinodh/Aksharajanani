
import { Point } from '../types';

// Ramer-Douglas-Peucker Path Simplification
const getPerpendicularDistance = (point: Point, lineStart: Point, lineEnd: Point): number => {
  const { x: x0, y: y0 } = point;
  const { x: x1, y: y1 } = lineStart;
  const { x: x2, y: y2 } = lineEnd;
  const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
  return denominator === 0 ? 0 : numerator / denominator;
};

export const simplifyPath = (points: Point[], epsilon: number): Point[] => {
  if (points.length < 3) return points;
  let dmax = 0, index = 0, end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = getPerpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) { index = i; dmax = d; }
  }
  if (dmax > epsilon) {
    const recResults1 = simplifyPath(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyPath(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else { return [points[0], points[end]]; }
};
