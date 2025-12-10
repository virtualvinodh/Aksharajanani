
import React, { createContext, useState, useContext, ReactNode, useCallback, useRef } from 'react';
import { Character, ProjectData, FilterMode } from '../types';

export type Workspace = 'drawing' | 'positioning' | 'kerning' | 'rules' | 'metrics';
type View = 'grid' | 'comparison' | 'settings';

interface ModalState {
  name: 'confirmChangeScript' | 'incompleteWarning' | 'mismatchedScript' | 'testPage' | 'addGlyph' | 'positioningUpdateWarning' | 'feaError' | 'unsavedRules' | 'about' | 'help' | 'restoreSession' | 'testCases' | 'confirmLoadProject' | 'addBlock' | 'importGlyphs' | 'confirmSnapshotRestore' | 'snapshotRestore' | 'saveAs';
  props?: any;
}

interface NotificationState {
  message: string;
  id: number;
  type?: 'success' | 'info' | 'error';
  duration?: number;
  onUndo?: () => void;
}

interface LayoutContextType {
  workspace: Workspace;
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>;
  currentView: View;
  setCurrentView: React.Dispatch<React.SetStateAction<View>>;
  activeTab: number;
  setActiveTab: React.Dispatch<React.SetStateAction<number>>;
  selectedCharacter: Character | null;
  modalOriginRect: DOMRect | null;
  selectCharacter: (character: Character, rect?: DOMRect) => void;
  closeCharacterModal: () => void;
  comparisonCharacters: Character[];
  setComparisonCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  isMoreMenuOpen: boolean;
  setIsMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingFontName: boolean;
  setIsEditingFontName: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Modals & Notifications
  activeModal: ModalState | null;
  openModal: (name: ModalState['name'], props?: any) => void;
  closeModal: () => void;
  notification: NotificationState | null;
  showNotification: (
    message: string,
    type?: 'success' | 'info' | 'error',
    options?: { duration?: number; onUndo?: () => void }
  ) => void;
  closeNotification: () => void;
  
  // Project loading state
  projectToRestore: ProjectData | null;
  setProjectToRestore: React.Dispatch<React.SetStateAction<ProjectData | null>>;

  // Metrics Workspace Selection Persistence
  metricsSelection: Set<number>;
  setMetricsSelection: React.Dispatch<React.SetStateAction<Set<number>>>;
  isMetricsSelectionMode: boolean;
  setIsMetricsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Filtering
  filterMode: FilterMode;
  setFilterMode: React.Dispatch<React.SetStateAction<FilterMode>>;

  // Deep Linking / Navigation Target
  pendingNavigationTarget: string | null;
  setPendingNavigationTarget: React.Dispatch<React.SetStateAction<string | null>>;

  // Session Flags for One-time UX events
  checkAndSetFlag: (key: string) => boolean;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [workspace, setWorkspace] = useState<Workspace>('drawing');
    const [currentView, setCurrentView] = useState<View>('grid');
    const [activeTab, setActiveTab] = useState(0);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [modalOriginRect, setModalOriginRect] = useState<DOMRect | null>(null);
    const [comparisonCharacters, setComparisonCharacters] = useState<Character[]>([]);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isEditingFontName, setIsEditingFontName] = useState(false);

    const [activeModal, setActiveModal] = useState<ModalState | null>(null);
    const [notification, setNotification] = useState<NotificationState | null>(null);
    
    const [projectToRestore, setProjectToRestore] = useState<ProjectData | null>(null);
    
    // New states for improvements
    const [metricsSelection, setMetricsSelection] = useState<Set<number>>(new Set());
    const [isMetricsSelectionMode, setIsMetricsSelectionMode] = useState(false);
    const [pendingNavigationTarget, setPendingNavigationTarget] = useState<string | null>(null);
    const [filterMode, setFilterMode] = useState<FilterMode>('none');

    // Session flags (non-persistent across refreshes)
    const sessionFlags = useRef<Set<string>>(new Set());

    const selectCharacter = useCallback((character: Character, rect?: DOMRect) => {
        setModalOriginRect(rect || null);
        setSelectedCharacter(character);
    }, []);
    const closeCharacterModal = useCallback(() => setSelectedCharacter(null), []);

    const openModal = useCallback((name: ModalState['name'], props?: any) => setActiveModal({ name, props }), []);
    const closeModal = useCallback(() => setActiveModal(null), []);
    
    const showNotification = useCallback((
        message: string,
        type: 'success' | 'info' | 'error' = 'success',
        options?: { duration?: number; onUndo?: () => void }
    ) => {
        setNotification({ message, id: Date.now(), type, ...options });
    }, []);

    const closeNotification = useCallback(() => setNotification(null), []);

    const checkAndSetFlag = useCallback((key: string) => {
        if (sessionFlags.current.has(key)) {
            return true;
        }
        sessionFlags.current.add(key);
        return false;
    }, []);

    const value = {
        workspace, setWorkspace,
        currentView, setCurrentView,
        activeTab, setActiveTab,
        selectedCharacter, modalOriginRect, selectCharacter, closeCharacterModal,
        comparisonCharacters, setComparisonCharacters,
        isMoreMenuOpen, setIsMoreMenuOpen,
        isEditingFontName, setIsEditingFontName,
        activeModal, openModal, closeModal,
        notification, showNotification, closeNotification,
        projectToRestore, setProjectToRestore,
        metricsSelection, setMetricsSelection,
        isMetricsSelectionMode, setIsMetricsSelectionMode,
        pendingNavigationTarget, setPendingNavigationTarget,
        checkAndSetFlag,
        filterMode, setFilterMode
    };

    return (
        <LayoutContext.Provider value={value}>
            {children}
        </LayoutContext.Provider>
    );
};

export const useLayout = (): LayoutContextType => {
    const context = useContext(LayoutContext);
    if (!context) {
        throw new Error('useLayout must be used within a LayoutProvider');
    }
    return context;
};
