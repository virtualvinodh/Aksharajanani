import { extractFea as extractFeaFromPython } from './pythonFontService';

export const extractFea = async (
    fontBlob: Blob,
    showNotification?: (message: string, type?: 'success' | 'info') => void,
    t?: (key: string) => string
): Promise<string> => {
    return extractFeaFromPython(fontBlob, showNotification, t);
};
