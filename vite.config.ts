import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Production is served from https://haris-devo.github.io/renderlab/; dev runs at the root.
export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' || isPreview ? '/renderlab/' : '/'),
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
