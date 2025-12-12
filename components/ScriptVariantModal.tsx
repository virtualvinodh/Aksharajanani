
import React, { useState, useEffect } from 'react';
import { Character, ScriptConfig } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

export interface VariantGroup {
  optionKey: string;
  variants: Character[];
  description: string;
}

interface ScriptVariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedVariants: Map<string, string>) => void;
  script: ScriptConfig;
  variantGroups: VariantGroup[];
}

const ScriptVariantModal: React.FC<ScriptVariantModalProps> = ({ isOpen, onClose, onConfirm, script, variantGroups }) => {
  const { t } = useLocale();
  const [selections, setSelections] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (isOpen) {
      const initialSelections = new Map<string, string>();
      variantGroups.forEach(group => {
        // Default to the first variant in each group
        if (group.variants.length > 0) {
          initialSelections.set(group.optionKey, group.variants[0].name);
        }
      });
      setSelections(initialSelections);
    }
  }, [isOpen, variantGroups]);

  const handleSelectionChange = (optionKey: string, name: string) => {
    setSelections(new Map(selections).set(optionKey, name));
  };

  const handleConfirm = () => {
    onConfirm(selections);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('configureVariantsForScript', { scriptName: t(script.nameKey) })}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">
            {t('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">
            {t('startProject')}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {variantGroups.map(group => (
          <div key={group.optionKey}>
            <h3
              className="font-semibold text-lg text-gray-800 dark:text-gray-200 mb-2"
              style={{
                fontFamily: script.guideFont?.fontName ? `'${script.guideFont.fontName}', sans-serif` : 'sans-serif',
                fontFeatureSettings: script.guideFont?.stylisticSet || 'normal',
              }}
            >
              {group.optionKey}
            </h3>
            <div className="space-y-2">
              {group.variants.map(variant => (
                <label key={variant.name} className="flex items-center p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name={group.optionKey}
                    value={variant.name}
                    checked={selections.get(group.optionKey) === variant.name}
                    onChange={() => handleSelectionChange(group.optionKey, variant.name)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:checked:bg-indigo-500"
                  />
                  <span
                    className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-100"
                    style={{
                        fontFamily: script.guideFont?.fontName ? `'${script.guideFont.fontName}', sans-serif` : 'sans-serif',
                        fontFeatureSettings: script.guideFont?.stylisticSet || 'normal',
                    }}
                  >
                    {variant.desc?.split(':')[1] || variant.desc}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default ScriptVariantModal;
