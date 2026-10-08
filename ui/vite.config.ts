import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

// Bundle the entire UI (JS + CSS) into a single index.html under
// Content/WebUI so CEF can load it straight off disk via file://.
export default defineConfig({
    plugins: [react(), viteSingleFile()],
    build: {
        outDir: resolve(__dirname, '../Content/WebUI'),
        emptyOutDir: true,
        assetsInlineLimit: 100_000_000, // inline everything
        chunkSizeWarningLimit: 100_000_000,
    },
});
