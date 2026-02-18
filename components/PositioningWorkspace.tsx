import React, { useState, useEffect } from 'react';
import PositioningPage from './PositioningPage';
import { MarkAttachmentRules, PositioningRules, AttachmentClass } from '../../types';
import { useRules } from '../contexts/RulesContext';
import ProgressIndicator from './ProgressIndicator';
import PositioningCelebrationOverlay from './PositioningCelebrationOverlay';
import { useLayout } from '../contexts/LayoutContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { usePositioning } from '../contexts/PositioningContext';

interface PositioningWorkspaceProps {
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    positioningProgress: { completed: number; total: number };
}

const PositioningWorkspace: React.FC<PositioningWorkspaceProps> = (props) => {
    const { state: rulesState } = useRules();
    const { positioningProgress, ...positioningPageProps } = props;
    
    const { checkAndSetFlag, setWorkspace } = useLayout();
    const { glyphDataMap } = useGlyphData();
    const { markPositioningMap } = usePositioning();

    const [showCelebration, setShowCelebration] = useState(false);

    useEffect(() => {
        if (positioningProgress.total > 0 && positioningProgress.completed === positioningProgress.total) {
             const hasCelebrated = checkAndSetFlag('positioning_complete_celebration');
             if (!hasCelebrated) {
                 setShowCelebration(true);
             }
        }
    }, [positioningProgress.completed, positioningProgress.total, checkAndSetFlag]);

    const handleProceed = () => {
        setShowCelebration(false);
        setWorkspace('kerning');
    };
    
    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator
                    completed={positioningProgress.completed}
                    total={positioningProgress.total}
                    progressTextKey="positioningProgress"
                />
            </div>
            <div className="flex-grow overflow-hidden">
                <PositioningPage 
                    {...positioningPageProps}
                    fontRules={rulesState.fontRules}
                />
            </div>
            
            {showCelebration && (
                <PositioningCelebrationOverlay
                    glyphDataMap={glyphDataMap}
                    markPositioningMap={markPositioningMap}
                    onProceed={handleProceed}
                    onClose={() => setShowCelebration(false)}
                />
            )}
        </div>
    );
};

export default React.memo(PositioningWorkspace);