import path from 'path';
import fs from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The app fetches these at runtime (`/scripts.json`, `/data/*`, `/locales/**`).
 * The dev server serves them from the project root, but `vite build` only emits
 * bundled assets, so copy them into the output directory after bundling.
 */
const RUNTIME_ASSETS = ['scripts.json', 'data', 'locales'];
const RUNTIME_ASSET_EXTENSIONS = new Set(['.json', '.txt']);

function copyRuntimeAssets(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const entry of RUNTIME_ASSETS) {
        const src = path.resolve(root, entry);
        if (!fs.existsSync(src)) {
          throw new Error(`copy-runtime-assets: missing ${entry}`);
        }
        fs.cpSync(src, path.join(outDir, entry), {
          recursive: true,
          // Skip helper scripts (e.g. data/*.js); only ship data files.
          filter: (file) =>
            fs.statSync(file).isDirectory() || RUNTIME_ASSET_EXTENSIONS.has(path.extname(file)),
        });
      }
    },
  };
}

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), copyRuntimeAssets()],
      resolve: {
        alias: [
          { find: '@', replacement: path.resolve(__dirname, '.') },
          // paper's default build is paper-full, which bundles a JavaScript parser (acorn) for
          // PaperScript. The app never uses PaperScript, and paper-core has the same API.
          { find: /^paper$/, replacement: 'paper/dist/paper-core.js' },
        ],
      },
      build: {
        rollupOptions: {
          output: {
            // Long-lived libraries in their own chunks, so app updates don't re-download them.
            manualChunks(id) {
              if (!id.includes('/node_modules/')) return undefined;
              if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
              if (id.includes('/node_modules/paper/')) return 'paper';
              if (id.includes('/node_modules/opentype.js/')) return 'opentype';
              if (id.includes('/node_modules/react-virtuoso/')) return 'virtuoso';
              return undefined;
            },
          },
        },
      },
    };
});
