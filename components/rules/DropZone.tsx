import React, { useState } from 'react';
import { Character, GlyphData } from '../../types';
import GlyphTile from '../GlyphTile';
import { ClearIcon } from '../../constants';

interface DropZoneProps {
    onDrop: (name: string) => void;
    onClear?: () => void;
    char: Character | null;
    glyphData: GlyphData | undefined;
    strokeThickness: number;
    prompt: string;
}

const DropZone: React.FC<DropZoneProps> = ({ onDrop, onClear, char, glyphData, strokeThickness, prompt }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const charName = e.dataTransfer.getData("text/plain");
        if (charName) {
            onDrop(charName);
        }
    };
    
    return (
        <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`relative w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${isDragOver ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/50' : 'border-gray-300 dark:border-gray-600'}`}
        >
            {char ? (
                <>
                <GlyphTile character={char} glyphData={glyphData} strokeThickness={strokeThickness} />
                {onClear && (
                    <button onClick={onClear} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                        <ClearIcon />
                    </button>
                )}
                </>
            ) : (
                <span className="text-xs text-gray-500 text-center p-1">{prompt}</span>
            )}
        </div>
    );
};

export default React.memo(DropZone);