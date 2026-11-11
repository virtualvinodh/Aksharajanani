


let worker: Worker | null = null;
const requestMap = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void; timer: ReturnType<typeof setTimeout> }>();
let requestId = 0;
let isPyodideReady = false;
let pyodideReadyPromise: Promise<void> | null = null;
let pyodideReadyResolve: (() => void) | null = null;
let pyodideReadyReject: ((reason: Error) => void) | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;

// Downloading Pyodide and the Python packages can be slow on a poor connection; a single
// compile/patch/extract is normally seconds. Past these limits we give up and report it.
const INIT_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

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
        print("[Python] Patching 'glyf' (Targeting TTF)...")
        delta_glyf = delta_font['glyf']
        delta_names = set(delta_glyf.keys())
        if 'glyf' in base_font:
            # Merge per glyph (E4): glyphs the delta doesn't have under the same name keep their
            # base outline instead of making the save fail with a KeyError.
            base_glyf = base_font['glyf']
            for g_name in base_order:
                if g_name in delta_names:
                    base_glyf[g_name] = delta_glyf[g_name]
        else:
            from fontTools.ttLib.tables._g_l_y_f import Glyph as _EmptyGlyph
            for g_name in base_order:
                if g_name not in delta_names:
                    delta_glyf[g_name] = _EmptyGlyph()
            base_font['glyf'] = delta_glyf
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
    # Merge advances per glyph (E4): glyphs missing from the delta keep their base metrics
    # instead of breaking the save. (hhea's numberOfHMetrics is recomputed on save.)
    print("[Python] Merging 'hmtx'; swapping 'hhea' and 'maxp'...")
    base_hmtx = base_font['hmtx']
    delta_metrics = delta_font['hmtx'].metrics
    for g_name in base_order:
        if g_name in delta_metrics:
            base_hmtx.metrics[g_name] = delta_metrics[g_name]
    base_font['hhea'] = delta_font['hhea']
    
    # Only swap maxp if we are NOT converting CFF->TTF (which would mean base is TTF but delta is CFF)
    # If base is TTF, we want maxp 1.0. If delta is CFF, it has maxp 0.5.
    if not ('glyf' in base_font and 'CFF ' in delta_font):
        base_font['maxp'] = delta_font['maxp'] # Contains numGlyphs and table version

    # 4. Table Swap: CMAP
    # We update the cmap to ensure any NEW unicode points assigned in the editor are reachable.
    # Merge into the base cmap (E4) instead of replacing it: the base's secondary code points
    # (e.g. 'space' for both U+0020 and U+00A0) are kept, delta mappings are only added for glyphs
    # the base has, and private-use code points that the importer assigned to unencoded glyphs
    # (any PUA code the base didn't already map) are left out.
    print("[Python] Merging 'cmap'...")
    base_glyph_set = set(base_order)

    def _is_pua(code):
        return 0xE000 <= code <= 0xF8FF or 0xF0000 <= code <= 0xFFFFD or 0x100000 <= code <= 0x10FFFD

    base_mappings = {}
    for table in base_font['cmap'].tables:
        if table.isUnicode():
            base_mappings.update(table.cmap)
    merged = dict(base_mappings)
    for table in delta_font['cmap'].tables:
        if not table.isUnicode():
            continue
        for code, name in table.cmap.items():
            if name not in base_glyph_set:
                continue
            if _is_pua(code) and code not in base_mappings:
                continue
            merged[code] = name

    has_full_table = False
    for table in base_font['cmap'].tables:
        if not table.isUnicode():
            continue
        if table.format in (12, 13):
            table.cmap = dict(merged)
            has_full_table = True
        elif table.format == 0:
            table.cmap = {c: n for c, n in merged.items() if c <= 0xFF}
        else:
            table.cmap = {c: n for c, n in merged.items() if c <= 0xFFFF}
    if not has_full_table and any(c > 0xFFFF for c in merged):
        from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
        full = CmapSubtable.newSubtable(12)
        full.platformID, full.platEncID, full.language = 3, 10, 0
        full.cmap = dict(merged)
        base_font['cmap'].tables.append(full)
    
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
    // Pinned to an exact wheel (content-addressed URL + hash), like fontTools above, so a new
    // PyPI release can't change font compilation underneath us. Its other dependency, lxml,
    // comes from Pyodide's own package set.
    const fontfeatures_url = "https://files.pythonhosted.org/packages/87/26/a0369ad3be7c74fa13cd2dc687c083b26d65380310957f5736c1a32395b0/fontfeatures-1.9.0-py3-none-any.whl#sha256=d7fcf48b77fa4f61fdffb5e28d588be05255fff0b54693c62de4013b129c3f1b";
    await micropip.install(fontfeatures_url);

    
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

/**
 * Tears the worker down after a failure so the next request starts a fresh one, and fails
 * everything that was waiting on it (instead of leaving export/import hanging forever).
 */
function resetWorker(reason: Error) {
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }
    if (pyodideReadyReject) pyodideReadyReject(reason);
    pyodideReadyResolve = null;
    pyodideReadyReject = null;
    pyodideReadyPromise = null;
    isPyodideReady = false;
    requestMap.forEach(request => { clearTimeout(request.timer); request.reject(reason); });
    requestMap.clear();
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

const compilerUnavailable = (detail?: string) =>
    new Error(`The font compiler could not start${detail ? ` (${detail})` : ''}. Check your internet connection and try again.`);

export function initializePyodide() {
    if (worker) return;

    console.log("Initializing Python worker...");
    worker = createWorker();

    pyodideReadyPromise = new Promise<void>((resolve, reject) => {
        pyodideReadyResolve = resolve;
        pyodideReadyReject = reject;
    });
    // Nobody may be waiting yet (it is started on app load); don't report that as unhandled.
    pyodideReadyPromise.catch(() => {});

    initTimer = setTimeout(() => {
        console.error("Python worker did not become ready in time.");
        resetWorker(compilerUnavailable('timed out'));
    }, INIT_TIMEOUT_MS);

    worker.onmessage = (event) => {
        const { type, payload } = event.data;

        if (type === 'result') {
            const { id, blobBuffer, feaError, extractedFea } = payload;
            const request = requestMap.get(id);
            if (request) {
                clearTimeout(request.timer);
                if (extractedFea !== undefined) {
                    request.resolve(extractedFea);
                } else {
                    const blob = new Blob([blobBuffer], { type: 'font/opentype' });
                    request.resolve({ blob, feaError });
                }
                requestMap.delete(id);
            }
        } else if (type === 'error') {
            const { id, message } = payload;
            const request = requestMap.get(id);
            if (request) {
                clearTimeout(request.timer);
                request.reject(new Error(message));
                requestMap.delete(id);
            } else {
                console.error("Python Worker Error:", message);
            }
        } else if (type === 'init_error') {
            console.error("Python Worker Init Error:", payload.message);
            resetWorker(compilerUnavailable(payload.message));
        } else if (type === 'status') {
            console.log(`Python worker status: ${payload}`);
            if (payload === 'ready') {
                isPyodideReady = true;
                if (initTimer) { clearTimeout(initTimer); initTimer = null; }
                if (pyodideReadyResolve) pyodideReadyResolve();
                pyodideReadyResolve = null;
                pyodideReadyReject = null;
            }
        }
    };
    
    worker.onerror = (error) => {
        console.error("Unhandled Python Worker error:", error);
        resetWorker(isPyodideReady
            ? new Error(`The font compiler stopped unexpectedly${error.message ? ` (${error.message})` : ''}. Please try again.`)
            : compilerUnavailable(error.message || undefined));
    };

    worker.postMessage({ type: 'init' });
}

/** Starts the worker if needed and waits until Python is ready; rejects if it can't start. */
async function ensurePyodideReady(onWait?: () => void): Promise<Worker> {
    if (!worker || !pyodideReadyPromise) initializePyodide();
    if (!isPyodideReady) {
        onWait?.();
        await pyodideReadyPromise;
    }
    if (!worker) throw compilerUnavailable();
    return worker;
}

/** Sends one job to the worker; rejects (and restarts the worker next time) if it never answers. */
function sendRequest<T>(activeWorker: Worker, type: string, payload: Record<string, unknown>, transfer: Transferable[], mapResult: (res: any) => T = res => res): Promise<T> {
    const currentId = requestId++;
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            if (!requestMap.has(currentId)) return;
            console.error(`Python worker request '${type}' timed out.`);
            // Python runs one job at a time, so a stuck job blocks everything after it.
            resetWorker(new Error('The font compiler took too long and was stopped. Please try again.'));
        }, REQUEST_TIMEOUT_MS);
        requestMap.set(currentId, { resolve: (res) => resolve(mapResult(res)), reject, timer });
        activeWorker.postMessage({ type, payload: { id: currentId, ...payload } }, transfer);
    });
}

export async function extractFea(
    fontBlob: Blob,
    showNotification?: (message: string, type?: 'success' | 'info') => void,
    t?: (key: string) => string
): Promise<string> {
    const activeWorker = await ensurePyodideReady(() => { if (showNotification && t) showNotification(t('preparingPythonEnv'), 'info'); });
    if (showNotification && t) showNotification(t('extractingFea'), 'info');
    const fontBuffer = await fontBlob.arrayBuffer();
    return sendRequest<string>(activeWorker, 'extract', { fontBuffer }, [fontBuffer]);
}

export async function patchFont(
    baseFontBlob: Blob,
    deltaFontBlob: Blob,
    showNotification: (message: string, type?: 'success' | 'info') => void,
    t: (key: string) => string
): Promise<Blob> {
    const activeWorker = await ensurePyodideReady(() => showNotification(t('preparingPythonEnv'), 'info'));
    showNotification(t('patchingFont'), 'info');
    const baseFontBuffer = await baseFontBlob.arrayBuffer();
    const deltaFontBuffer = await deltaFontBlob.arrayBuffer();
    return sendRequest<Blob>(activeWorker, 'patch', { baseFontBuffer, deltaFontBuffer }, [baseFontBuffer, deltaFontBuffer], res => res.blob);
}

export async function compileFeaturesAndPatch(
    fontBlob: Blob,
    feaContent: string,
    showNotification: (message: string, type?: 'success' | 'info') => void,
    t: (key: string) => string
): Promise<{ blob: Blob; feaError: string | null }> {
    const activeWorker = await ensurePyodideReady(() => showNotification(t('preparingPythonEnv'), 'info'));
    showNotification(t('applyingOtfFeatures'), 'info');
    const fontBuffer = await fontBlob.arrayBuffer();
    return sendRequest<{ blob: Blob; feaError: string | null }>(activeWorker, 'compile', { fontBuffer, feaContent }, [fontBuffer]);
}
