import { useRef } from 'react';
import { Point, Path } from '../../types';
import { VEC } from '../../utils/vectorUtils';
import { generateId, ToolHookProps } from './types';
import { curveToPolyline, quadraticCurveToPolyline, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { simplifyPath } from '../../utils/pathUtils';

export const useEraserTool = ({ isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, settings, showNotification, t }: ToolHookProps) => {
    const pathsAtDragStart = useRef<Path[]>([]);
    const eraserPath = useRef<Point[]>([]);
    const checkablePointsCache = useRef<Map<string, Point[]>>(new Map());
    const notificationShown = useRef(false);

    const start = (point: Point) => {
        setIsDrawing(true);
        pathsAtDragStart.current = JSON.parse(JSON.stringify(currentPaths));
        eraserPath.current = [point];
        notificationShown.current = false;

        checkablePointsCache.current.clear();
        pathsAtDragStart.current.forEach(path => {
            if (path.type === 'outline' || path.type === 'dot' || path.points.length < 2) {
                checkablePointsCache.current.set(path.id, path.points);
                return;
            }

            let pointsToCheck: Point[];
            if ((path.type === 'pen' || path.type === 'calligraphy') && path.points.length > 2) {
                pointsToCheck = curveToPolyline(path.points);
            } else if (path.type === 'curve' && path.points.length === 3) {
                pointsToCheck = quadraticCurveToPolyline(path.points);
            } else {
                pointsToCheck = path.points;
            }
            
            if (['line', 'circle', 'ellipse'].includes(path.type)) {
                const interpolatedPoints: Point[] = [];
                const isClosed = path.type === 'circle' || path.type === 'ellipse';
                const totalPoints = pointsToCheck.length;

                for (let j = 0; j < (isClosed ? totalPoints : totalPoints - 1); j++) {
                    const p1 = pointsToCheck[j];
                    const p2 = pointsToCheck[(j + 1) % totalPoints];
                    interpolatedPoints.push(p1);
                    const segmentDist = VEC.len(VEC.sub(p1, p2));
                    const numSteps = Math.ceil(segmentDist / 5);
                    if (numSteps > 1) {
                        for (let i = 1; i < numSteps; i++) {
                            interpolatedPoints.push(VEC.add(p1, VEC.scale(VEC.sub(p2, p1), i / numSteps)));
                        }
                    }
                }
                if (!isClosed && totalPoints > 0) {
                    interpolatedPoints.push(pointsToCheck[totalPoints - 1]);
                }
                pointsToCheck = interpolatedPoints;
            }

            checkablePointsCache.current.set(path.id, pointsToCheck);
        });
    };

    const move = (point: Point) => {
        if (!isDrawing) return;
        
        const lastPoint = eraserPath.current[eraserPath.current.length - 1];
        const eraserRadius = settings.strokeThickness / 2;

        const dist = VEC.len(VEC.sub(point, lastPoint));
        const steps = Math.max(1, Math.floor(dist / (eraserRadius / 2)));
        for (let i = 1; i <= steps; i++) {
            eraserPath.current.push(VEC.add(lastPoint, VEC.scale(VEC.sub(point, lastPoint), i / steps)));
        }

        const isPointInEraserArea = (p: Point) => eraserPath.current.some(erasePoint => VEC.len(VEC.sub(p, erasePoint)) <= eraserRadius);
        
        let svgEncounteredThisMove = false;
        const newPaths: Path[] = [];

        pathsAtDragStart.current.forEach(path => {
            if (path.type === 'outline') {
                const bbox = getAccurateGlyphBBox([path], 0);
                if (bbox) {
                    const eraserIntersectsBbox = eraserPath.current.some(p => 
                        p.x >= bbox.x - eraserRadius && p.x <= bbox.x + bbox.width + eraserRadius &&
                        p.y >= bbox.y - eraserRadius && p.y <= bbox.y + bbox.height + eraserRadius
                    );
                    if (eraserIntersectsBbox) {
                        svgEncounteredThisMove = true;
                    }
                }
                newPaths.push(path);
                return;
            }

            if (path.type === 'dot') {
                if (path.points.length > 0) {
                    const center = path.points[0];
                    const dotRadius = path.points.length > 1 ? VEC.len(VEC.sub(path.points[1], center)) : settings.strokeThickness / 2;
                    const isErased = eraserPath.current.some(erasePoint => VEC.len(VEC.sub(center, erasePoint)) <= eraserRadius + dotRadius);
                    if (!isErased) {
                        newPaths.push(path);
                    }
                }
                return;
            }

            const pointsToCheck = checkablePointsCache.current.get(path.id) || [];

            if (pointsToCheck.length === 0) {
                if(path.points.length === 0) newPaths.push(path);
                return;
            }

            let wasErased = false;
            const segments: Point[][] = [];
            let currentSegment: Point[] = [];

            for (const pt of pointsToCheck) {
                if (!isPointInEraserArea(pt)) {
                    currentSegment.push(pt);
                } else {
                    wasErased = true;
                    if (currentSegment.length > 1) {
                        segments.push(currentSegment);
                    }
                    currentSegment = [];
                }
            }
            if (currentSegment.length > 1) {
                segments.push(currentSegment);
            }

            if (!wasErased) {
                newPaths.push(path);
            } else {
                segments.forEach(seg => {
                    newPaths.push({ ...path, type: 'pen', points: seg, id: generateId() });
                });
            }
        });

        if (svgEncounteredThisMove && !notificationShown.current) {
            showNotification(t('errorEraserOnSvg'), 'info');
            notificationShown.current = true;
        }

        setCurrentPaths(newPaths);
    };

    const end = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        const pathIdsAtStart = new Set(pathsAtDragStart.current.map(p => p.id));
        
        const optimizedPaths = currentPaths.map(p => {
            if (!pathIdsAtStart.has(p.id) && p.points.length > 1 && settings.pathSimplification > 0) {
                const simplifiedPoints = simplifyPath(p.points, settings.pathSimplification);
                return { ...p, points: simplifiedPoints };
            }
            return p;
        });
        
        onPathsChange(optimizedPaths);
        
        pathsAtDragStart.current = [];
        eraserPath.current = [];
        checkablePointsCache.current.clear();
    };

    return { start, move, end };
};
