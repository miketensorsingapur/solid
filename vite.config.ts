import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Сборка складывает JS и CSS внутрь dist/index.html — файл открывается двойным кликом.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
});
