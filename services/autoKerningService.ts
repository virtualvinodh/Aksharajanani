// The pair-measuring code lives in workers/autoKerningWorker.js (a bundled module worker).
let worker: Worker | null = null;

export const initAutoKernWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL('../workers/autoKerningWorker.js', import.meta.url), { type: 'module' });
    return worker;
};

export const terminateAutoKernWorker = () => {
    if (worker) {
        worker.terminate();
        worker = null;
    }
};
