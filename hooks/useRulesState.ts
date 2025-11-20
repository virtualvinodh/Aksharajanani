import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';
import { useLayout } from '../contexts/LayoutContext';

export type RuleType = 'ligature' | 'contextual' | 'multiple' | 'single';
export type DistRuleType = 'simple' | 'contextual';

export const useRulesState = () => {
    const { t } = useLocale();
    const { settings } = useSettings();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();
    const { showNotification } = useLayout();
    const { fontRules, manualFeaCode, isFeaEditMode } = rulesState;

    const [localRules, setLocalRules] = useState(() => JSON.parse(JSON.stringify(fontRules)));
    const [activeFeature, setActiveFeature] = useState<string | null>(null);
    const [expandedLookups, setExpandedLookups] = useState<Set<string>>(new Set());
    const isInitialLookupsLoad = useRef(true);

    const [addingRuleType, setAddingRuleType] = useState<RuleType | null>(null);
    const [editingRule, setEditingRule] = useState<{ key: string, type: RuleType } | null>(null);
    const [addingDistRuleType, setAddingDistRuleType] = useState<DistRuleType | null>(null);

    const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<{ context: 'feature' | 'lookup', name: string, ruleKey: string, ruleType: RuleType | DistRuleType } | null>(null);
    
    const autosaveTimeout = useRef<number | null>(null);
    
    useEffect(() => {
        setLocalRules(JSON.parse(JSON.stringify(fontRules)));
    }, [fontRules]);
    
    const saveChanges = useCallback(() => {
        rulesDispatch({ type: 'SET_FONT_RULES', payload: localRules });
    }, [localRules, rulesDispatch]);


    useEffect(() => {
        if (!settings?.isAutosaveEnabled) {
          return;
        }
        if (JSON.stringify(localRules) === JSON.stringify(fontRules)) {
            rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
            return;
        }
        rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: true });
        if (autosaveTimeout.current) {
            clearTimeout(autosaveTimeout.current);
        }
        autosaveTimeout.current = window.setTimeout(() => {
            saveChanges();
            rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
        }, 1000);
        return () => {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
        };
    }, [localRules, fontRules, rulesDispatch, settings?.isAutosaveEnabled, saveChanges]);

    const scriptTag = useMemo(() => Object.keys(localRules).find(key => key !== 'groups' && key !== 'lookups'), [localRules]);
    const groups = useMemo(() => localRules.groups || {}, [localRules]);
    const lookups = useMemo(() => localRules.lookups || {}, [localRules]);
    const features = useMemo(() => (scriptTag && localRules[scriptTag] ? Object.keys(localRules[scriptTag]) : []), [localRules, scriptTag]);

    useEffect(() => {
        // This effect ensures that when the lookups are first loaded, they are all expanded.
        // It won't re-expand them on subsequent updates if the user has manually collapsed some.
        if (isInitialLookupsLoad.current && Object.keys(lookups).length > 0) {
            setExpandedLookups(new Set(Object.keys(lookups)));
            isInitialLookupsLoad.current = false;
        }
    }, [lookups]);

    useEffect(() => {
        if (features.length > 0 && (!activeFeature || !features.includes(activeFeature))) {
          setActiveFeature(features[0]);
        }
    }, [features, activeFeature]);

    const getRuleGroupKey = (type: RuleType) => ({ ligature: 'liga', contextual: 'context', multiple: 'multi', single: 'single' })[type];

    const handleDeleteRule = (context: 'feature' | 'lookup', name: string, ruleKeyToDelete: string, ruleType: RuleType) => {
        setRuleToDelete({ context, name, ruleKey: ruleKeyToDelete, ruleType });
        setIsDeleteConfirmOpen(true);
    };

    const handleConfirmDelete = () => {
        if (!ruleToDelete) return;
        const { context, name, ruleKey, ruleType } = ruleToDelete;
        
        setLocalRules(prevRules => {
            const newRules = JSON.parse(JSON.stringify(prevRules));
            const ruleGroup = getRuleGroupKey(ruleType as RuleType);
            let targetObject;
            if (context === 'feature') {
                targetObject = newRules[scriptTag!]?.[name]?.[ruleGroup];
            } else {
                targetObject = newRules.lookups?.[name]?.[ruleGroup];
            }

            if (targetObject && ruleKey in targetObject) {
                delete targetObject[ruleKey];
                // Clean up empty rule groups if necessary
            }
            return newRules;
        });
        
        setIsDeleteConfirmOpen(false);
        setRuleToDelete(null);
    };

    const handleSaveNewRule = (contextName: string, newRule: any, ruleType: RuleType, context: 'feature' | 'lookup' = 'feature') => {
        if (!contextName) return;
        setLocalRules(prevRules => {
            const newRules = JSON.parse(JSON.stringify(prevRules));
            const ruleGroup = getRuleGroupKey(ruleType);
            
            let targetObject;
            if (context === 'feature') {
                if (!newRules[scriptTag!][contextName]) newRules[scriptTag!][contextName] = {};
                targetObject = newRules[scriptTag!][contextName];
            } else {
                if (!newRules.lookups) newRules.lookups = {};
                if (!newRules.lookups[contextName]) newRules.lookups[contextName] = {};
                targetObject = newRules.lookups[contextName];
            }

            if (!targetObject[ruleGroup]) targetObject[ruleGroup] = {};

            if (ruleType === 'ligature') targetObject.liga[newRule.ligatureName] = newRule.componentNames;
            else if (ruleType === 'contextual') targetObject.context[newRule.replacementName] = newRule.rule;
            else if (ruleType === 'multiple') targetObject.multi[newRule.outputString] = newRule.inputName;
            else if (ruleType === 'single') targetObject.single[newRule.outputName] = newRule.inputName;

            return newRules;
        });
        setAddingRuleType(null);
    };

    const handleUpdateRule = (contextName: string, oldKey: string, updatedRule: any, ruleType: RuleType, context: 'feature' | 'lookup' = 'feature') => {
        if (!contextName) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroup = getRuleGroupKey(ruleType);

            let targetObject;
             if (context === 'feature') {
                targetObject = newRules[scriptTag!][contextName];
            } else {
                targetObject = newRules.lookups?.[contextName];
            }
            
            if (targetObject?.[ruleGroup]?.[oldKey]) delete targetObject[ruleGroup][oldKey];
            
            if (ruleType === 'ligature') targetObject[ruleGroup][updatedRule.ligatureName] = updatedRule.componentNames;
            else if (ruleType === 'contextual') targetObject[ruleGroup][updatedRule.replacementName] = updatedRule.rule;
            else if (ruleType === 'multiple') targetObject[ruleGroup][updatedRule.outputString] = updatedRule.inputName;
            else if (ruleType === 'single') targetObject[ruleGroup][updatedRule.outputName] = updatedRule.inputName;
            
            return newRules;
        });
        setEditingRule(null);
    };
    
    const handleConfirmAddFeature = (tag: string) => {
        if (!scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules[scriptTag]) newRules[scriptTag] = {};
            newRules[scriptTag][tag] = { children: [{ type: 'inline' }] }; // Initialize with children array
            return newRules;
        });
        setActiveFeature(tag);
    };

    // --- New Lookup Handlers ---
    const handleAddLookup = (name: string): boolean => {
        const trimmedName = name.trim();
        if (!trimmedName || lookups[trimmedName]) {
            showNotification('Invalid or duplicate lookup name.', 'error');
            return false;
        }
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules.lookups) newRules.lookups = {};
            newRules.lookups[trimmedName] = {};
            return newRules;
        });
        setExpandedLookups(prev => new Set(prev).add(trimmedName));
        return true;
    };

    const handleUpdateLookup = (oldName: string, newName: string): boolean => {
        const trimmedNewName = newName.trim();
        if (!trimmedNewName || (trimmedNewName !== oldName && lookups[trimmedNewName])) {
            showNotification('Invalid or duplicate lookup name.', 'error');
            return false;
        }
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (newRules.lookups?.[oldName]) {
                newRules.lookups[trimmedNewName] = newRules.lookups[oldName];
                delete newRules.lookups[oldName];
                // Also update any features referencing the old name
                if (newRules[scriptTag!]) {
                    Object.keys(newRules[scriptTag!]).forEach(featureTag => {
                        const feature = newRules[scriptTag!][featureTag];
                        if (feature.children) {
                            feature.children = feature.children.map((child: any) => 
                                (child.type === 'lookup' && child.name === oldName) ? { ...child, name: trimmedNewName } : child
                            );
                        }
                    });
                }
            }
            return newRules;
        });
        setExpandedLookups(prev => {
            if (prev.has(oldName)) {
                const newSet = new Set(prev);
                newSet.delete(oldName);
                newSet.add(trimmedNewName);
                return newSet;
            }
            return prev;
        });
        return true;
    };

    const handleDeleteLookup = (name: string) => {
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (newRules.lookups?.[name]) {
                delete newRules.lookups[name];
                 if (newRules[scriptTag!]) {
                    Object.keys(newRules[scriptTag!]).forEach(featureTag => {
                        const feature = newRules[scriptTag!][featureTag];
                        if (feature.children) {
                            feature.children = feature.children.filter((child: any) => child.type !== 'lookup' || child.name !== name);
                        }
                    });
                }
            }
            return newRules;
        });
        setExpandedLookups(prev => {
            const newSet = new Set(prev);
            newSet.delete(name);
            return newSet;
        });
    };
    
    const handleToggleLookupExpansion = (key: string) => {
        setExpandedLookups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const handleAddLookupReference = (featureName: string, lookupName: string) => {
        if (!featureName || !lookupName) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const feature = newRules[scriptTag!]?.[featureName];
            if (feature) {
                if (!feature.children) feature.children = [];
                feature.children.push({ type: 'lookup', name: lookupName });
            }
            return newRules;
        });
    };
    
    const handleRemoveLookupReference = (featureName: string, index: number) => {
        if (!featureName) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const feature = newRules[scriptTag!]?.[featureName];
            if (feature && feature.children) {
                feature.children.splice(index, 1);
            }
            return newRules;
        });
    };

    const handleReorderFeatureItem = (featureName: string, fromIndex: number, toIndex: number) => {
        if (!featureName) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const feature = newRules[scriptTag!]?.[featureName];
            if (feature && feature.children) {
                const [movedItem] = feature.children.splice(fromIndex, 1);
                feature.children.splice(toIndex, 0, movedItem);
            }
            return newRules;
        });
    };


    const activeLigatureRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.liga) ? localRules[scriptTag][activeFeature].liga : {}, [localRules, scriptTag, activeFeature]);
    const activeContextualRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.context) ? localRules[scriptTag][activeFeature].context : {}, [localRules, scriptTag, activeFeature]);
    const activeMultipleRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.multi) ? localRules[scriptTag][activeFeature].multi : {}, [localRules, scriptTag, activeFeature]);
    const activeSingleRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature]?.single) ? localRules[scriptTag][activeFeature].single : {}, [localRules, scriptTag, activeFeature]);
    const activeDistRules = useMemo(() => (scriptTag && activeFeature && localRules[scriptTag]?.[activeFeature] && activeFeature === 'dist') ? localRules[scriptTag][activeFeature] : { simple: {}, contextual: [] }, [localRules, scriptTag, activeFeature]);

    const handleEditDistRule = (ruleData: any, type: 'simple' | 'contextual') => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (newRules[scriptTag]?.[activeFeature]?.[type]) {
                 if (type === 'simple') {
                    // This handles editing a simple rule, including changing its target character (key).
                    if (ruleData.oldKey && ruleData.oldKey !== ruleData.newKey) {
                        delete newRules[scriptTag][activeFeature][type][ruleData.oldKey];
                    }
                    newRules[scriptTag][activeFeature][type][ruleData.newKey] = ruleData.value;
                } else { // contextual
                    newRules[scriptTag][activeFeature][type][ruleData.index] = ruleData.rule;
                }
            }
            return newRules;
        });
    };

    const handleSaveDistRule = (rule: any, type: 'simple' | 'contextual') => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules[scriptTag]) newRules[scriptTag] = {};
            if (!newRules[scriptTag][activeFeature]) newRules[scriptTag][activeFeature] = {};
            if (!newRules[scriptTag][activeFeature][type]) {
                 newRules[scriptTag][activeFeature][type] = (type === 'simple' ? {} : []);
            }
            
            if (type === 'simple') {
                newRules[scriptTag][activeFeature][type][rule.key] = rule.value;
            } else { // contextual
                newRules[scriptTag][activeFeature][type].push(rule);
            }

            return newRules;
        });
        setAddingDistRuleType(null);
    };

    const handleDeleteDistRule = (keyOrIndex: string | number, type: 'simple' | 'contextual') => {
        if (!activeFeature || !scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if(newRules[scriptTag]?.[activeFeature]?.[type]) {
                if (type === 'simple') {
                    delete newRules[scriptTag][activeFeature][type][keyOrIndex as string];
                } else { // contextual
                    newRules[scriptTag][activeFeature][type].splice(keyOrIndex as number, 1);
                }
            }
            return newRules;
        });
    };

    const handleScriptTagChange = (newTag: string) => {
        setLocalRules(prev => {
            const oldTag = Object.keys(prev).find(key => key !== 'groups' && key !== 'lookups');
            if (oldTag && newTag && oldTag !== newTag) {
                const newRules = { ...prev, [newTag]: prev[oldTag] };
                delete newRules[oldTag];
                return newRules;
            }
            return prev;
        });
    };
    
    const handleFeatureTagChange = (oldFeature: string, newFeature: string) => {
        if (!scriptTag) return;
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const scriptData = newRules[scriptTag];
            if (scriptData && scriptData[oldFeature]) {
                scriptData[newFeature] = scriptData[oldFeature];
                delete scriptData[oldFeature];
            }
            return newRules;
        });
        setActiveFeature(newFeature);
    };

    const handleSaveGroup = useCallback(({ originalKey, newKey, members }: { originalKey?: string; newKey: string; members: string[] }) => {
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules.groups) newRules.groups = {};
            if (originalKey && originalKey !== newKey) {
                delete newRules.groups[originalKey];
            }
            newRules.groups[newKey] = members;
            return newRules;
        });
    }, []);

    const handleDeleteGroup = useCallback((key: string) => {
        setLocalRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (newRules.groups?.[key]) {
                delete newRules.groups[key];
                if (Object.keys(newRules.groups).length === 0) {
                    delete newRules.groups;
                }
            }
            return newRules;
        });
    }, []);

    return {
      localRules, scriptTag, features, activeFeature, setActiveFeature,
      addingRuleType, setAddingRuleType, editingRule, setEditingRule,
      addingDistRuleType, setAddingDistRuleType, isAddFeatureModalOpen,
      setIsAddFeatureModalOpen, isDeleteConfirmOpen, setIsDeleteConfirmOpen,
      handleDeleteRule, handleConfirmDelete, handleSaveNewRule, handleUpdateRule,
      handleConfirmAddFeature, activeLigatureRules, activeContextualRules,
      activeMultipleRules, activeSingleRules, activeDistRules,
      handleEditDistRule, handleSaveDistRule, handleDeleteDistRule,
      saveChanges, handleScriptTagChange, handleFeatureTagChange,
      groups, handleSaveGroup, handleDeleteGroup,
      lookups, expandedLookups, handleToggleLookupExpansion, 
      handleAddLookup, handleUpdateLookup, handleDeleteLookup, 
      handleAddLookupReference, handleRemoveLookupReference, handleReorderFeatureItem
    };
};
