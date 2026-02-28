


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

def patch_font(base_data, delta_data):
    """
    Patches the base_font with shapes and metrics from delta_font.
    Preserves GSUB, GPOS, GDEF, OS/2, name, etc. from base_font.
    """
    print("[Python] Loading base and delta fonts...")
    # Convert JsProxy objects to Python bytes/memoryview
    base_bytes = base_data.to_py()
    delta_bytes = delta_data.to_py()
    
    base_font = TTFont(io.BytesIO(base_bytes))
    delta_font = TTFont(io.BytesIO(delta_bytes))

    # 1. Align Glyph Order (Crucial for preserving GID integrity)
    base_order = base_font.getGlyphOrder()
    print(f"[Python] Base glyph count: {len(base_order)}")

     # 1. Align Glyph Order (Crucial for preserving GID integrity)
    delta_order = delta_font.getGlyphOrder()
    print(f"[Python] Delta glyph count: {len(delta_order)}")   

    # We DO NOT set the delta font's order to match the base immediately.
    # Doing so can cause IndexError if delta_font has more glyphs (e.g. from PUA) 
    # and we try to decompile tables like hmtx that rely on the original count.
    # Instead, we copy tables by object/name, and let base_font filter what it needs
    # based on its own preserved order.
    # delta_font.setGlyphOrder(base_order)

    # 2. Table Swap: Shapes
    if 'glyf' in delta_font:
        print("[Python] Swapping 'glyf' and 'loca' tables (Targeting TTF)...")
        base_font['glyf'] = delta_font['glyf']
        base_font['loca'] = delta_font['loca']
        import struct
        base_font.sfntVersion = struct.pack(">BBBB", 0, 1, 0, 0) # Ensure TTF signature
        # If base was CFF, remove it
        if 'CFF ' in base_font:
            print("[Python] Removing 'CFF ' table from base font...")
            del base_font['CFF ']
    elif 'CFF ' in delta_font:
         if 'glyf' in base_font:
             print("[Python] Format Mismatch: Base=TTF, Delta=CFF. Converting Delta glyphs to TTF...")
             from fontTools.pens.ttGlyphPen import TTGlyphPen
             from fontTools.pens.cu2quPen import Cu2QuPen
             import struct
             
             base_font.sfntVersion = struct.pack(">BBBB", 0, 1, 0, 0)
             base_glyf = base_font['glyf']
             delta_glyph_set = delta_font.getGlyphSet()
             
             for g_name in base_order:
                 if g_name in delta_glyph_set:
                     try:
                         # Convert CFF (cubic) to TTF (quadratic)
                         tt_pen = TTGlyphPen(delta_glyph_set)
                         cu2qu_pen = Cu2QuPen(tt_pen, max_err=1.0, reverse_direction=True)
                         
                         delta_glyph_set[g_name].draw(cu2qu_pen)
                         base_glyf[g_name] = tt_pen.glyph()
                     except Exception as e:
                         print(f"[Python] Error converting glyph {g_name}: {e}")
         else:
             print("[Python] Patching CFF CharStrings (Targeting CFF)...")
             
             # Access the Top DICT of the CFF font (usually at index 0)
             try:
                 base_cff = base_font['CFF '].cff
                 delta_cff = delta_font['CFF '].cff
                 
                 base_top_dict = base_cff.topDictIndex[0]
                 delta_top_dict = delta_cff.topDictIndex[0]
                 
                 base_charstrings = base_top_dict.CharStrings
                 delta_charstrings = delta_top_dict.CharStrings
                 
                 # Patch individual CharStrings
                 for g_name in base_order:
                     if g_name in delta_charstrings:
                         base_charstrings[g_name] = delta_charstrings[g_name]
                         
                 base_font.sfntVersion = "OTTO" # Ensure CFF signature
                 if 'glyf' in base_font: del base_font['glyf']
                 if 'loca' in base_font: del base_font['loca']
             except Exception as e:
                 print(f"[Python] Error patching CFF: {e}")
                 # Fallback: If surgical patching fails, try full replacement
                 print("[Python] Fallback: Swapping entire CFF table...")
                 base_font['CFF '] = delta_font['CFF ']
                 base_font.sfntVersion = "OTTO"
                 if 'glyf' in base_font: del base_font['glyf']
                 if 'loca' in base_font: del base_font['loca']
    
    # 3. Table Swap: Metrics
    print("[Python] Swapping 'hmtx', 'hhea', and 'maxp' tables...")
    base_font['hmtx'] = delta_font['hmtx']
    base_font['hhea'] = delta_font['hhea'] # Contains numberOfHMetrics
    
    # Only swap maxp if we are NOT converting CFF->TTF (which would mean base is TTF but delta is CFF)
    # If base is TTF, we want maxp 1.0. If delta is CFF, it has maxp 0.5.
    if not ('glyf' in base_font and 'CFF ' in delta_font):
        base_font['maxp'] = delta_font['maxp'] # Contains numGlyphs and table version

    # 4. Table Swap: CMAP
    # We update the cmap to ensure any NEW unicode points assigned in the editor are reachable.
    print("[Python] Swapping 'cmap' table...")
    
    # Sanitize CMAP: Only keep mappings for glyphs that exist in base_font
    # This prevents KeyErrors if delta_font has extra glyphs (like .notdef.1) not in base_font
    base_glyph_set = set(base_order)
    new_cmap_table = delta_font['cmap']
    
    for table in new_cmap_table.tables:
        # Create a filtered dictionary
        filtered_cmap = {
            code: name for code, name in table.cmap.items() 
            if name in base_glyph_set
        }
        table.cmap = filtered_cmap
        
    base_font['cmap'] = new_cmap_table
    
    # 5. Table Swap: OS/2 (Required for metrics consistency)
    print("[Python] Swapping 'OS/2' table...")
    base_font['OS/2'] = delta_font['OS/2']
    
    # 6. Table Swap: head (Required for UPM consistency)
    print("[Python] Swapping 'head' table to match UPM...")
    base_font['head'] = delta_font['head']

    # 7. Table Swap: post (Optional)
    # opentype.js generates a standard post table.
    print("[Python] Swapping 'post' table...")
    base_font['post'] = delta_font['post']

    # Ensure Unicode CMAP exists
    base_font = _add_unicode_cmap_to_font_object(base_font)

    # 8. Save
    out_buffer = io.BytesIO()
    base_font.save(out_buffer)
    return out_buffer.getvalue()

def extract_fea(font_data):
    """Extracts a basic FEA structure from the font."""
    try:
        from fontFeatures.ttLib import unparse
        from fontFeatures.optimizer import Optimizer
        font_bytes = font_data.to_py()
        font = TTFont(io.BytesIO(font_bytes))
        
        features = unparse(font)
        Optimizer(features).optimize(level=1)
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
    const fonttools_url = "https://www.piwheels.org/simple/fonttools/fonttools-4.61.1-py3-none-any.whl#sha256=018b2aa0b159683474b21d3a96e53f870115700525445e84c15726bbc2b552ef";
    await micropip.install(fonttools_url);
    
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
    } else if (type === 'patch') {
        const { baseFontBuffer, deltaFontBuffer, id } = payload;
        if (!pyodide) {
             self.postMessage({ type: 'error', payload: { id, message: 'Pyodide not initialized yet.' } });
             return;
        }
        try {
            const patchFont = pyodide.globals.get('patch_font');
            const resultProxy = patchFont(baseFontBuffer, deltaFontBuffer);
            const patchedFontData = resultProxy.toJs();
            resultProxy.destroy();

            self.postMessage({
                type: 'result',
                payload: {
                    id,
                    blobBuffer: patchedFontData.buffer,
                }
            }, [patchedFontData.buffer]);
        } catch (error) {
            self.postMessage({
                type: 'error',
                payload: {
                    id,
                    message: error instanceof Error ? error.message : 'Unknown patching error'
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

export async function patchFont(
    baseFontBlob: Blob,
    deltaFontBlob: Blob,
    showNotification: (message: string, type?: 'success' | 'info') => void,
    t: (key: string) => string
): Promise<Blob> {
    if (!worker || !pyodideReadyPromise) {
        initializePyodide();
    }
    
    if (!isPyodideReady) {
        showNotification(t('preparingPythonEnv'), 'info');
        await pyodideReadyPromise;
    }

    showNotification(t('patchingFont'), 'info');

    const baseFontBuffer = await baseFontBlob.arrayBuffer();
    const deltaFontBuffer = await deltaFontBlob.arrayBuffer();
    const currentId = requestId++;

    return new Promise((resolve, reject) => {
        requestMap.set(currentId, { resolve: (res) => resolve(res.blob), reject });
        worker!.postMessage({
            type: 'patch',
            payload: {
                id: currentId,
                baseFontBuffer,
                deltaFontBuffer
            }
        }, [baseFontBuffer, deltaFontBuffer]);
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
