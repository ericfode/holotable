import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { atlasKit } from './vite.atlas.ts';
import { KIT_LICENSES, kitLicenses } from './vite.licenses.ts';

// The viewer kit: src/kit/index.tsx as a self-contained library (React, styles and all), for embedding in other pages.
//   npm run build:kit  ->  dist-kit/swu-viewer-kit.js (IIFE, global SWUViewer) and dist-kit/swu-viewer-kit.mjs (ES module),
//   plus dist-kit/swu-viewer-kit.licenses.txt (the bundled packages' licenses; each kit file's first line names it)
export default defineConfig({
    // Tailwind's generated styles are in the kit with no module of their own
    plugins: [react(), tailwindcss(), atlasKit(), kitLicenses({ extra: ['tailwindcss'] })],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
        outDir: 'dist-kit',
        lib: {
            entry: 'src/kit/index.tsx',
            name: 'SWUViewer',
            formats: ['iife', 'es'],
            fileName: (f) => (f === 'iife' ? 'swu-viewer-kit.js' : 'swu-viewer-kit.mjs')
        },
        rolldownOptions: {
            // after minifying, so the line stays
            output: { postBanner: `/*! Holotable viewer kit (MIT). Third-party licenses: ${KIT_LICENSES} */` }
        },
        chunkSizeWarningLimit: 4000
    }
});
