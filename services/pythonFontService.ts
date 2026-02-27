
declare var loadPyodide: any;

let worker: Worker | null = null;
const requestMap = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>();
let requestId = 0;
let isPyodideReady = false;
let pyodideReadyPromise: Promise<void> | null = null;
let pyodideReadyResolve: (() => void) | null = null;

const workerCode = `
// Self-contained worker code
importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');

let pyodide = null;

const pythonCode = \`
from fontTools.ttLib import TTFont
from fontTools.feaLib.parser import Parser
from fontTools.feaLib.builder import Builder
import io

def _add_unicode_cmap_to_font_object(font):
    """Internal helper that adds a Unicode cmap to a TTFont object."""
    cmap_table = font["cmap"]
    if any(t.platformID == 0 for t in cmap_table.tables):
        return font  # Unicode cmap already exists

    win_cmap = next((t for t in cmap_table.tables if t.platformID == 3 and t.platEncID == 1 and t.format == 4), None)
    if not win_cmap:
        return font  # No suitable Windows cmap to copy from

    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

    # Add format 4 for BMP
    new_subtable_4 = CmapSubtable.newSubtable(4)
    new_subtable_4.platformID = 0
    new_subtable_4.platEncID = 3
    new_subtable_4.language = win_cmap.language
    new_subtable_4.cmap = win_cmap.cmap.copy()
    cmap_table.tables.append(new_subtable_4)

    # Add format 12 for full Unicode range if a source exists
    win_cmap_12 = next((t for t in cmap_table.tables if t.platformID == 3 and t.platEncID == 10 and t.format == 12), None)
    if win_cmap_12:
        new_subtable_12 = CmapSubtable.newSubtable(12)
        new_subtable_12.platformID = 0
        new_subtable_12.platEncID = 4
        new_subtable_12.language = win_cmap_12.language
        new_subtable_12.cmap = win_cmap_12.cmap.copy()
        cmap_table.tables.append(new_subtable_12)

    return font

def compile_fea_and_patch(font_data, fea_text):
    """Compiles FEA features, applies them, and adds a Unicode cmap."""
    font_bytes = font_data.to_py()
    font = TTFont(io.BytesIO(font_bytes))
    
    fea_error = ""

    # Compile and apply FEA if provided
    if fea_text and fea_text.strip():
        try:
            # The Parser needs the feature text and the glyph order from the font
            parser = Parser(io.StringIO(fea_text), glyphNames=font.getGlyphOrder())
            # The parser returns a document (AST root)
            doc = parser.parse()
            # The Builder gets the font and the whole document
            builder = Builder(font, doc)
            builder.build()
        except Exception as e:
            fea_error = str(e)
            print(f"FEA compilation failed: {e}")

    # Add Unicode CMAP
    font = _add_unicode_cmap_to_font_object(font)
    
    # Save the modified font
    buffer = io.BytesIO()
    font.save(buffer)
    
    # Return a dictionary with font data and any error message
    return { "font_data": buffer.getvalue(), "fea_error": fea_error }

def extract_fea(font_data):
    """Extracts a basic FEA structure from the font."""
    try:
        from fontFeatures.ttLib import unparse
        font_bytes = font_data.to_py()
        font = TTFont(io.BytesIO(font_bytes))
        
        features = unparse(font)
        fea_code = features.asFea()
        
        if not fea_code or not fea_code.strip():
            return "# No OpenType features found in the imported font."
            
        return fea_code
    except Exception as e:
        return f"# Error extracting FEA: {str(e)}"
\`;

async function initializePyodide() {
    self.postMessage({ type: 'status', payload: 'loadingPyodide' });
    pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
    });

    self.postMessage({ type: 'status', payload: 'loadingMicropip' });
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");

    self.postMessage({ type: 'status', payload: 'installingFonttools' });
    // await micropip.install('fonttools');
    fonttools_url = "https://www.piwheels.org/simple/fonttools/fonttools-4.61.1-py3-none-any.whl#sha256=018b2aa0b159683474b21d3a96e53f870115700525445e84c15726bbc2b552ef"
    await micropip.install(fonttools_url)    
    
    self.postMessage({ type: 'status', payload: 'installingFontFeatures' });
    await micropip.install('fontFeatures');

    
    micropip.destroy();
    
    pyodide.runPython(pythonCode);
    self.postMessage({ type: 'status', payload: 'ready' });
}

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === 'init') {
        try {
            await initializePyodide();
        } catch (error) {
            self.postMessage({
                type: 'init_error',
                payload: { message: error instanceof Error ? error.message : 'Unknown worker initialization error' }
            });
        }
    } else if (type === 'compile') {
        const { fontBuffer, feaContent, id } = payload;
        if (!pyodide) {
             self.postMessage({ type: 'error', payload: { id, message: 'Pyodide not initialized yet.' } });
             return;
        }
        try {
            const compileAndPatch = pyodide.globals.get('compile_fea_and_patch');
            const resultProxy = compileAndPatch(fontBuffer, feaContent);
            const resultMap = resultProxy.toJs({ BigInt64Array: true });
            resultProxy.destroy();

            const patchedFontData = resultMap.get('font_data');
            const feaError = resultMap.get('fea_error');

            self.postMessage({
                type: 'result',
                payload: {
                    id,
                    blobBuffer: patchedFontData.buffer,
                    feaError: feaError || null,
                }
            }, [patchedFontData.buffer]);
        } catch (error) {
            self.postMessage({
                type: 'error',
                payload: {
                    id,
                    message: error instanceof Error ? error.message : 'Unknown compilation error'
                }
            });
        }
    } else if (type === 'extract') {
        const { fontBuffer, id } = payload;
        if (!pyodide) {
             self.postMessage({ type: 'error', payload: { id, message: 'Pyodide not initialized yet.' } });
             return;
        }
        try {
            const extractFea = pyodide.globals.get('extract_fea');
            const result = extractFea(fontBuffer);
            
            self.postMessage({
                type: 'result',
                payload: {
                    id,
                    extractedFea: result
                }
            });
        } catch (error) {
            self.postMessage({
                type: 'error',
                payload: {
                    id,
                    message: error instanceof Error ? error.message : 'Unknown extraction error'
                }
            });
        }
    }
};
`;

function createWorker() {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    return new Worker(workerUrl);
}

export function initializePyodide() {
    if (worker) return;

    console.log("Initializing Python worker...");
    worker = createWorker();

    pyodideReadyPromise = new Promise(resolve => {
        pyodideReadyResolve = resolve;
    });

    worker.onmessage = (event) => {
        const { type, payload } = event.data;

        if (type === 'result') {
            const { id, blobBuffer, feaError, extractedFea } = payload;
            if (requestMap.has(id)) {
                if (extractedFea !== undefined) {
                    requestMap.get(id)!.resolve(extractedFea);
                } else {
                    const blob = new Blob([blobBuffer], { type: 'font/opentype' });
                    requestMap.get(id)!.resolve({ blob, feaError });
                }
                requestMap.delete(id);
            }
        } else if (type === 'error') {
            const { id, message } = payload;
            if (requestMap.has(id)) {
                requestMap.get(id)!.reject(new Error(message));
                requestMap.delete(id);
            } else {
                console.error("Python Worker Error:", message);
            }
        } else if (type === 'init_error') {
            console.error("Python Worker Init Error:", payload.message);
            isPyodideReady = false;
        } else if (type === 'status') {
            console.log(`Python worker status: ${payload}`);
            if (payload === 'ready') {
                isPyodideReady = true;
                if (pyodideReadyResolve) pyodideReadyResolve();
            }
        }
    };
    
    worker.onerror = (error) => {
        console.error("Unhandled Python Worker error:", error);
        isPyodideReady = false;
        requestMap.forEach(request => request.reject(error));
        requestMap.clear();
    };

    worker.postMessage({ type: 'init' });
}

export async function extractFea(
    fontBlob: Blob,
    showNotification?: (message: string, type?: 'success' | 'info') => void,
    t?: (key: string) => string
): Promise<string> {
    if (!worker || !pyodideReadyPromise) {
        initializePyodide();
    }
    
    if (!isPyodideReady) {
        if (showNotification && t) showNotification(t('preparingPythonEnv'), 'info');
        await pyodideReadyPromise;
    }

    if (showNotification && t) showNotification(t('extractingFea'), 'info');

    const fontBuffer = await fontBlob.arrayBuffer();
    const currentId = requestId++;

    return new Promise((resolve, reject) => {
        requestMap.set(currentId, { resolve, reject });
        worker!.postMessage({
            type: 'extract',
            payload: {
                id: currentId,
                fontBuffer
            }
        }, [fontBuffer]);
    });
}

export async function compileFeaturesAndPatch(
    fontBlob: Blob,
    feaContent: string,
    showNotification: (message: string, type?: 'success' | 'info') => void,
    t: (key: string) => string
): Promise<{ blob: Blob; feaError: string | null }> {
    if (!worker || !pyodideReadyPromise) {
        // This function is now called on app load, so this should not happen.
        // But as a fallback, we initialize it here.
        initializePyodide();
    }
    
    if (!isPyodideReady) {
        showNotification(t('preparingPythonEnv'), 'info');
        await pyodideReadyPromise;
    }

    showNotification(t('applyingOtfFeatures'), 'info');

    const fontBuffer = await fontBlob.arrayBuffer();
    const currentId = requestId++;

    return new Promise((resolve, reject) => {
        requestMap.set(currentId, { resolve, reject });
        worker!.postMessage({
            type: 'compile',
            payload: {
                id: currentId,
                fontBuffer,
                feaContent
            }
        }, [fontBuffer]);
    });
}
