
import { useCallback, useMemo } from 'react';
import { Path, Point } from '../../types';
import { generateId } from '../drawingTools/types';
import { VEC } from '../../utils/vectorUtils';

interface UseCanvasOperationsProps {
    currentPaths: Path[];
    handlePathsChange: (paths: Path[]) => void;
    selectedPathIds: Set<string>;
    setSelectedPathIds: (ids: Set<string>) => void;
    clipboard: Path[] | null;
    clipboardDispatch: any;
    showNotification: (msg: string) => void;
    t: (key: string) => string;
}

export const useCanvasOperations = ({
    currentPaths, handlePathsChange, selectedPathIds, setSelectedPathIds,
    clipboard, clipboardDispatch, showNotification, t
}: UseCanvasOperationsProps) => {

    const handleCopy = useCallback(() => {
        if (currentPaths.length === 0) return;
        let pathsToCopy: Path[];
        if (selectedPathIds.size === 0) {
            pathsToCopy = currentPaths;
            showNotification(t('copiedGlyph'));
        } else {
            pathsToCopy = currentPaths.filter(p => selectedPathIds.has(p.id));
            showNotification(t('copiedSelection'));
        }
        clipboardDispatch({ type: 'SET_CLIPBOARD', payload: JSON.parse(JSON.stringify(pathsToCopy)) });
    }, [currentPaths, selectedPathIds, clipboardDispatch, showNotification, t]);

    const handleCut = useCallback(() => {
        if (selectedPathIds.size === 0) return;
        const pathsToCut = currentPaths.filter(p => selectedPathIds.has(p.id));
        clipboardDispatch({ type: 'SET_CLIPBOARD', payload: JSON.parse(JSON.stringify(pathsToCut)) });
        const newPaths = currentPaths.filter(p => !selectedPathIds.has(p.id));
        handlePathsChange(newPaths);
        setSelectedPathIds(new Set());
        showNotification(t('cutSelection'));
    }, [selectedPathIds, currentPaths, clipboardDispatch, handlePathsChange, setSelectedPathIds, showNotification, t]);

    const handlePaste = useCallback(() => {
        if (!clipboard) return;
        const pastedPaths = clipboard.map(p => ({
            ...p,
            id: generateId(),
            points: p.points.map(pt => ({ x: pt.x + 10, y: pt.y + 10 })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + 10, y: seg.point.y + 10 }}))) : undefined
        }));
        const newPaths = [...currentPaths, ...pastedPaths];
        handlePathsChange(newPaths);
        const newSelectedIds = new Set(pastedPaths.map(p => p.id));
        setSelectedPathIds(newSelectedIds);
        showNotification(t('pastedSelection'));
    }, [clipboard, currentPaths, handlePathsChange, setSelectedPathIds, showNotification, t]);

    const handleDeleteSelection = useCallback(() => {
        if (selectedPathIds.size > 0) {
            const newPaths = currentPaths.filter(p => !selectedPathIds.has(p.id));
            handlePathsChange(newPaths);
            setSelectedPathIds(new Set());
        }
    }, [selectedPathIds, currentPaths, handlePathsChange, setSelectedPathIds]);

    const moveSelection = useCallback((delta: Point) => {
        const movedPaths = currentPaths.map(p => {
            if (selectedPathIds.has(p.id)) {
                return {
                    ...p,
                    points: p.points.map(pt => VEC.add(pt, delta)),
                    segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({
                        ...seg,
                        point: VEC.add(seg.point, delta)
                    }))) : undefined,
                };
            }
            return p;
        });
        handlePathsChange(movedPaths);
    }, [currentPaths, selectedPathIds, handlePathsChange]);

    const handleGroup = useCallback(() => {
        const newGroupId = generateId();
        const newPaths = currentPaths.map(p => selectedPathIds.has(p.id) ? { ...p, groupId: newGroupId } : p);
        handlePathsChange(newPaths);
        showNotification(t('groupedSuccess'));
    }, [currentPaths, selectedPathIds, handlePathsChange, showNotification, t]);

    const handleUngroup = useCallback(() => {
        const affectedGroupIds = new Set<string>();
        currentPaths.forEach(p => { if (selectedPathIds.has(p.id) && p.groupId) affectedGroupIds.add(p.groupId); });
        const newPaths = currentPaths.map(p => (p.groupId && affectedGroupIds.has(p.groupId) ? (({ groupId, ...rest }) => rest)(p) : p));
        handlePathsChange(newPaths);
        showNotification(t('ungroupedSuccess'));
    }, [currentPaths, selectedPathIds, handlePathsChange, showNotification, t]);

    const canGroup = useMemo(() => {
        if (selectedPathIds.size < 2) return false;
        const selectedPaths = currentPaths.filter(p => selectedPathIds.has(p.id));
        if (selectedPaths.length < 2) return false;
        const firstGroupId = selectedPaths[0].groupId;
        return !firstGroupId || selectedPaths.some(p => p.groupId !== firstGroupId);
    }, [selectedPathIds, currentPaths]);

    const canUngroup = useMemo(() => {
        if (selectedPathIds.size === 0) return false;
        return currentPaths.some(p => selectedPathIds.has(p.id) && p.groupId);
    }, [selectedPathIds, currentPaths]);

    return {
        handleCopy, handleCut, handlePaste, handleDeleteSelection, moveSelection,
        handleGroup, handleUngroup, canGroup, canUngroup
    };
};
