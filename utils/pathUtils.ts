
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

  // Use a Uint8Array as a bitmask to mark points to keep. 
  // 1 = keep, 0 = discard.
  const keepPoint = new Uint8Array(points.length);
  keepPoint[0] = 1; // Always keep first
  keepPoint[points.length - 1] = 1; // Always keep last

  // Stack for iterative processing: [startIndex, endIndex]
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    
    let dmax = 0;
    let index = 0;
    
    for (let i = start + 1; i < end; i++) {
      const d = getPerpendicularDistance(points[i], points[start], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }
    
    if (dmax > epsilon) {
      keepPoint[index] = 1;
      // Push sub-segments to stack
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }

  // Filter the original array based on the bitmask
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keepPoint[i]) {
      result.push(points[i]);
    }
  }
  
  return result;
};
