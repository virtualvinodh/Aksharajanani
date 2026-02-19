
import React from 'react';
import PositioningPage from './PositioningPage';
import { MarkAttachmentRules, PositioningRules, AttachmentClass } from '../../types';
import { useRules } from '../contexts/RulesContext';
import ProgressIndicator from './ProgressIndicator';

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
        </div>
    );
};

export default React.memo(PositioningWorkspace);
