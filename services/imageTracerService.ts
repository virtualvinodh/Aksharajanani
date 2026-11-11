
// imagetracerjs is loaded the first time someone traces an image.
const loadImageTracer = () => import('imagetracerjs').then(m => m.default ?? m);
import paper from 'paper';
import { paperScope as sharedPaperScope } from './glyphRenderService';

// Larger images are scaled down before tracing: full-resolution tracing on the main thread is
// slow, and the outline doesn't need more detail than this.
const MAX_TRACE_SIZE = 1200;

interface TraceOptions {
    ltres: number;
    qtres: number;
    pathomit: number;
    numberofcolors?: number;
    strokewidth?: number;
    pathformat?: string;
    colorquantcycles?: number;
}

/**
 * Traces a raster image (data URL) into a single continuous SVG outline path,
 * with all internal holes merged correctly (e.g., 'p', 'o', 'B').
 * 
 * @param imageSrc The data URL of the source image.
 * @param options Tracing parameters for ImageTracer.js.
 * @param removeBackground Whether to attempt background removal before tracing.
 * @returns A promise resolving to an SVG string with a single outline path.
 */
export const traceImageToSVG = (
    imageSrc: string,
    options: TraceOptions,
    removeBackground: boolean
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = async () => {
            const downscale = Math.min(1, MAX_TRACE_SIZE / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * downscale));
            canvas.height = Math.max(1, Math.round(img.height * downscale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error("Could not get canvas context for tracing."));
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            let traceInput: string | ImageData = downscale < 1 ? canvas.toDataURL('image/png') : imageSrc;

            // Optional background removal
            if (removeBackground) {
                try {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;

                    const bgColor = { r: data[0], g: data[1], b: data[2] };
                    const tolerance = 40;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const distance = Math.sqrt(
                            Math.pow(r - bgColor.r, 2) +
                            Math.pow(g - bgColor.g, 2) +
                            Math.pow(b - bgColor.b, 2)
                        );
                        if (distance < tolerance) data[i + 3] = 0;
                    }

                    ctx.putImageData(imageData, 0, 0);
                    traceInput = canvas.toDataURL('image/png');
                } catch (e) {
                    console.warn("Background removal failed, tracing original image:", e);
                }
            }

            // Tracing options for binary outline extraction
            const aggressiveOptions = {
                ...options,
                numberofcolors: 2,
                colorquantcycles: 3
            };

            const ImageTracer = await loadImageTracer();
            ImageTracer.imageToSVG(traceInput, async (svgstr: string) => {
                let scope: paper.PaperScope | null = null;
                try {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgstr, "image/svg+xml");
                    const originalSvgElement = svgDoc.documentElement;

                    const pathElements =
                        originalSvgElement.querySelector('g')?.querySelectorAll('path') ||
                        originalSvgElement.querySelectorAll('path');

                    if (pathElements.length === 0) {
                        resolve('');
                        return;
                    }

                    // Remove the largest background path
                    const paths = Array.from(pathElements);
                    if (removeBackground && paths.length > 1) {
                        paths.sort((a, b) => (b.getAttribute('d')?.length || 0) - (a.getAttribute('d')?.length || 0));
                        paths.shift();
                    }

                    // --- Use Paper.js for geometric union/subtraction ---
                    const paperCanvas = document.createElement('canvas');
                    // Create a new isolated scope to avoid memory leaks in the global scope
                    scope = new paper.PaperScope();
                    scope.setup(paperCanvas);

                    // Convert all paths to Paper.js geometry
                    const paperPaths: (paper.Path | paper.CompoundPath)[] = [];
                    for (const p of paths) {
                        const d = p.getAttribute('d');
                        if (!d) continue;
                        // Create items within the specific scope
                        const paperPath = new scope.CompoundPath(d);
                        paperPath.fillRule = 'evenodd';
                        paperPaths.push(paperPath);
                    }

                    // Combine all shapes into one unified compound path
                    let unified: paper.Item | null = null;
                    for (const shape of paperPaths) {
                        unified = unified ? (unified as paper.PathItem).unite(shape) : shape.clone();
                    }

                    if (!unified) {
                        resolve('');
                        return;
                    }

                    // Invert against the traced image's own area (D2: the detached canvas's view is
                    // the default 300×150, which clipped every larger image).
                    const imageRect = new scope.Rectangle(0, 0, canvas.width, canvas.height);
                    const boundsRect = new scope.Path.Rectangle(imageRect);
                    const inverted = boundsRect.subtract(unified as paper.CompoundPath);
                    unified.remove();
                    unified = inverted;

                    // Drop the outer frame: the subpath that spans the whole image, found by its
                    // bounds rather than assuming it comes first.
                    const isFrame = (item: paper.Item) =>
                        Math.abs(item.bounds.width - imageRect.width) < 1 && Math.abs(item.bounds.height - imageRect.height) < 1 &&
                        Math.abs(item.bounds.x - imageRect.x) < 1 && Math.abs(item.bounds.y - imageRect.y) < 1;
                    const parts = unified instanceof scope.CompoundPath ? [...unified.children] : [unified];
                    const keep = parts.length > 1 ? parts.filter(part => !isFrame(part)) : parts;
                    const exportPath = keep.map(part => (part as paper.Path).pathData).filter(Boolean).join('');

                    // --- Build output SVG ---
                    const newSvgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    newSvgElement.setAttribute('width', originalSvgElement.getAttribute('width') || '100');
                    newSvgElement.setAttribute('height', originalSvgElement.getAttribute('height') || '100');
                    newSvgElement.setAttribute('viewBox', originalSvgElement.getAttribute('viewBox') || `0 0 ${canvas.width} ${canvas.height}`);
                    newSvgElement.setAttribute('xmlns', "http://www.w3.org/2000/svg");

                    const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    outline.setAttribute('d', exportPath);
                    outline.setAttribute('fill', 'none');
                    outline.setAttribute('stroke', '#000000');
                    outline.setAttribute('stroke-width', String(options.strokewidth || 1));
                    outline.setAttribute('stroke-linejoin', 'round');
                    outline.setAttribute('stroke-linecap', 'round');
                    outline.setAttribute('vector-effect', 'non-scaling-stroke');
                    newSvgElement.appendChild(outline);

                    const svgOutline = new XMLSerializer().serializeToString(newSvgElement);

                    resolve(svgOutline);

                } catch {
                    reject(new Error("Failed to merge traced paths into continuous outline."));
                } finally {
                    // Critical: Remove the scope to clean up DOM event listeners and internal registries
                    if (scope) {
                        // PaperScope#remove exists at runtime but is missing from paper's typings.
                        (scope as paper.PaperScope & { remove: () => void }).remove();
                    }
                    // setup() made the tracer's scope the active one; after removing it, every new
                    // shape on the main thread would fail (D1). Switch back to the app's shared scope.
                    sharedPaperScope.activate();
                }
            }, aggressiveOptions);
        };

        img.onerror = () => reject(new Error("Error loading image for tracing."));
        img.src = imageSrc;
    });
};
