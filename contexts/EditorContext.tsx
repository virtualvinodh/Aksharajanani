
import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { Path, Point, ImageTransform } from '../types';

interface EditorContextType {
  currentPaths: Path[];
  setCurrentPaths: React.Dispatch<React.SetStateAction<Path[]>>;
  history: Path[][];
  historyIndex: number;
  handlePathsChange: (newPaths: Path[]) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  currentTool: string;
  setCurrentTool: React.Dispatch<React.SetStateAction<string>>;
  
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  viewOffset: Point;
  setViewOffset: React.Dispatch<React.SetStateAction<Point>>;
  
  selectedPathIds: Set<string>;
  setSelectedPathIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isImageSelected: boolean;
  setIsImageSelected: React.Dispatch<React.SetStateAction<boolean>>;

  backgroundImage: string | null;
  setBackgroundImage: React.Dispatch<React.SetStateAction<string | null>>;
  backgroundImageOpacity: number;
  setBackgroundImageOpacity: React.Dispatch<React.SetStateAction<number>>;
  imageTransform: ImageTransform | null;
  setImageTransform: React.Dispatch<React.SetStateAction<ImageTransform | null>>;
  
  calligraphyAngle: 45 | 30 | 15;
  setCalligraphyAngle: React.Dispatch<React.SetStateAction<45 | 30 | 15>>;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

const MAX_HISTORY_STACK = 50;

export const EditorProvider: React.FC<{ children: ReactNode; initialPaths: Path[] }> = ({ children, initialPaths }) => {
    const [currentPaths, setCurrentPaths] = useState<Path[]>(initialPaths);
    const [history, setHistory] = useState<Path[][]>([initialPaths]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [currentTool, setCurrentTool] = useState('pen');
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
    const [isImageSelected, setIsImageSelected] = useState(false);
    
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
    const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
    const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
    
    const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);

    const handlePathsChange = useCallback((newPaths: Path[]) => {
        let newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPaths);
        
        // Limit stack size
        if (newHistory.length > MAX_HISTORY_STACK) {
            newHistory = newHistory.slice(newHistory.length - MAX_HISTORY_STACK);
        }

        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentPaths(newPaths);
    }, [history, historyIndex]);

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setCurrentPaths(history[newIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setCurrentPaths(history[newIndex]);
        }
    };

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    const value = {
        currentPaths, setCurrentPaths, history, historyIndex, handlePathsChange, handleUndo, handleRedo, canUndo, canRedo,
        currentTool, setCurrentTool, zoom, setZoom, viewOffset, setViewOffset,
        selectedPathIds, setSelectedPathIds, isImageSelected, setIsImageSelected,
        backgroundImage, setBackgroundImage, backgroundImageOpacity, setBackgroundImageOpacity,
        imageTransform, setImageTransform, calligraphyAngle, setCalligraphyAngle
    };
    
    return (
        <EditorContext.Provider value={value}>
            {children}
        </EditorContext.Provider>
    );
};

export const useEditor = (): EditorContextType => {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return context;
};
