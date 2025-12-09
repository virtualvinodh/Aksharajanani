
import React, { useState, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface AddGlyphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (charData: { unicode?: number; name: string }) => void;
  onCheckExists: (unicode: number) => boolean;
  onCheckNameExists: (name: string) => boolean;
  initialName?: string;
}

// Map common names to their standard unicode points
const STANDARD_NAME_MAP: Record<string, number> = {
    'space': 32,
    'nbsp': 160,
    'zwnj': 8204,
    'zwj': 8205
};


const AddGlyphModal: React.FC<AddGlyphModalProps> = ({ isOpen, onClose, onAdd, onCheckExists, onCheckNameExists, initialName }) => {
  const { t } = useLocale();
  const [inputType, setInputType] = useState<'char' | 'codepoint'>('char');
  const [charValue, setCharValue] = useState('');
  const [codepointValue, setCodepointValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const formId = "add-glyph-form";

  useEffect(() => {
    if (isOpen) {
      setCharValue(initialName || '');
      setCodepointValue('');
      setError(null);
      setInputType('char');
    }
  }, [isOpen, initialName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let unicode: number | undefined;
    let name: string;

    try {
      if (inputType === 'char') {
        name = charValue.trim();
        if (!name) {
          setError(t('errorNameRequired'));
          return;
        }
        if (onCheckNameExists(name)) {
          setError(t('errorNameExists'));
          return;
        }

        if ([...name].length === 1) {
          unicode = name.codePointAt(0)!;
          if (onCheckExists(unicode)) {
            setError(t('errorUnicodeFromCharExists', { char: name, codepoint: unicode.toString(16).toUpperCase() }));
            return;
          }
        } else {
          // Check standard name map first
          const lowerName = name.toLowerCase();
          if (STANDARD_NAME_MAP[lowerName]) {
             unicode = STANDARD_NAME_MAP[lowerName];
             if (onCheckExists(unicode)) {
                 // If the standard ID is taken, we fall back to undefined (which will trigger a PUA assignment)
                 // or we could show an error. Let's show an error if it's a standard name collision.
                 setError(t('errorUnicodeFromCharExists', { char: name, codepoint: unicode.toString(16).toUpperCase() }));
                 return;
             }
          } else {
             // For multi-character strings that aren't in the standard map, unicode will be undefined.
             // It will be assigned a PUA codepoint later in useAppActions.
             unicode = undefined;
          }
        }
        onAdd({ unicode, name });

      } else { // 'codepoint' input
        const hex = codepointValue.startsWith('U+') ? codepointValue.substring(2) : codepointValue;
        if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) {
          setError(t('errorInvalidCodepoint'));
          return;
        }
        unicode = parseInt(hex, 16);
        if (isNaN(unicode) || unicode > 0x10FFFF || unicode < 0) {
            setError(t('errorInvalidCodepoint'));
            return;
        }
        if (onCheckExists(unicode)) {
            setError(t('errorGlyphExists', { codepoint: unicode.toString(16).toUpperCase().padStart(4, '0'), name: String.fromCodePoint(unicode) }));
            return;
        }
        
        // Try to derive a name if it's a single printable char, otherwise just use the code
        // Or if it's a known name like 'space'
        name = String.fromCodePoint(unicode);
        
        // Reverse lookup for standard names to be helpful (optional but nice)
        const knownName = Object.keys(STANDARD_NAME_MAP).find(key => STANDARD_NAME_MAP[key] === unicode);
        if (knownName) {
            name = knownName;
        }

        if (onCheckNameExists(name)) {
            // If the default name (the char itself) exists, we might still proceed if the unicode is different,
            // but here we are adding BY codepoint, so collision on name is tricky.
            // If 'space' exists (id=32) and we try to add U+0020, onCheckExists would catch it.
            // If we try to add U+E000 and name it 'space', checkNameExists catches it.
            setError(t('errorNameExists'));
            return;
        }

        onAdd({ unicode, name });
      }

    } catch (err) {
      setError(t('errorInvalidCodepoint'));
    }
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('addGlyphModalTitle')}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
          <button type="submit" form={formId} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">{t('addGlyphAction')}</button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <div className="mb-4">
          <div className="flex rounded-md shadow-sm">
            <button type="button" onClick={() => setInputType('char')} className={`px-4 py-2 text-sm font-medium rounded-l-md transition-colors ${inputType === 'char' ? 'bg-indigo-600 text-white z-10 border border-indigo-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'}`}>{t('addByCharacter')}</button>
            <button type="button" onClick={() => setInputType('codepoint')} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-md transition-colors ${inputType === 'codepoint' ? 'bg-indigo-600 text-white z-10 border border-indigo-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'}`}>{t('addByCodepoint')}</button>
          </div>
        </div>
        
        {inputType === 'char' ? (
          <div>
            <label htmlFor="char-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('characterLabel')}</label>
            <input id="char-input" type="text" value={charValue} onChange={e => setCharValue(e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-3xl text-center font-bold" autoFocus />
            <p className="text-xs text-gray-500 mt-1">Type a single character or a name (e.g. "space", "zwj").</p>
          </div>
        ) : (
          <div>
            <label htmlFor="codepoint-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('codepointLabel')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">U+</span>
              <input id="codepoint-input" type="text" value={codepointValue} onChange={e => setCodepointValue(e.target.value.toUpperCase())} className="w-full pl-9 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 font-mono" autoFocus placeholder="0041" />
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  );
};

export default React.memo(AddGlyphModal);
