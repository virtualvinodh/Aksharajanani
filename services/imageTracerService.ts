// Requires paper.js and imagetracer.js loaded globally
declare var ImageTracer: any;
import paper from 'paper';

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
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error("Could not get canvas context for tracing."));
            }
            ctx.drawImage(img, 0, 0);

            let traceInput: string | ImageData = imageSrc;

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

            ImageTracer.imageToSVG(traceInput, async (svgstr: string) => {
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
                    let paths = Array.from(pathElements);
                    if (removeBackground && paths.length > 1) {
                        paths.sort((a, b) => (b.getAttribute('d')?.length || 0) - (a.getAttribute('d')?.length || 0));
                        paths.shift();
                    }

                    // --- Use Paper.js for geometric union/subtraction ---
                    const paperCanvas = document.createElement('canvas');
                    paper.setup(paperCanvas);

                    // Convert all paths to Paper.js geometry
                    const paperPaths: (paper.Path | paper.CompoundPath)[] = [];
                    for (const p of paths) {
                        const d = p.getAttribute('d');
                        if (!d) continue;
                        const paperPath = new paper.CompoundPath(d);
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

                    // Convert the unified Paper.js path back to SVG data
                    const boundsRect = new paper.Path.Rectangle(paper.view.bounds);
                    const inverted = boundsRect.subtract(unified as paper.CompoundPath);
                    unified.remove();
                    unified = inverted;

                    const unifiedPath = unified as paper.CompoundPath;
                    let exportPath = unifiedPath.pathData;

                    if (exportPath) {
                        // Split by 'z' to separate subpaths
                        let subpaths = exportPath.split(/z/).map(s => s.trim()).filter(Boolean);

                        // Remove the first subpath
                        if (subpaths.length > 1) {
                            subpaths.shift();
                        }

                        // Reconstruct path with 'z' at the end of each subpath
                        exportPath = subpaths.map(s => s + 'z').join('');
                    }

                    // --- Build output SVG ---
                    const newSvgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    newSvgElement.setAttribute('width', originalSvgElement.getAttribute('width') || '100');
                    newSvgElement.setAttribute('height', originalSvgElement.getAttribute('height') || '100');
                    newSvgElement.setAttribute('viewBox', originalSvgElement.getAttribute('viewBox') || `0 0 ${img.width} ${img.height}`);
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
                    console.log(svgOutline);

                } catch (err) {
                    reject(new Error("Failed to merge traced paths into continuous outline."));
                }
            }, aggressiveOptions);
        };

        img.onerror = () => reject(new Error("Error loading image for tracing."));
        img.src = imageSrc;
    });
};