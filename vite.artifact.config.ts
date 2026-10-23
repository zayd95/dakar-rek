import { defineConfig } from 'vite';
import { buildId } from './buildId';
/** The build packed into ONE html file for a private preview (scripts/pack-artifact.mjs): every dynamic import (MapLibre's lazy chunk) is inlined, nothing is fetched at run time. */
export default defineConfig({ base: './', define: { __BUILD_ID__: JSON.stringify(`${buildId()}-apercu`) }, build: { target: 'es2022', outDir: process.env.ART_OUT ?? 'dist-art', emptyOutDir: true, chunkSizeWarningLimit: 9000, rollupOptions: { output: { inlineDynamicImports: true } } } });
