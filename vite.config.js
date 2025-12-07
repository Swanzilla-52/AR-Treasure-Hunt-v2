

import { optimizeGLTF } from '@iwsdk/vite-plugin-gltf-optimizer';
import { injectIWER } from '@iwsdk/vite-plugin-iwer';
import { compileUIKit } from '@iwsdk/vite-plugin-uikitml';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    injectIWER({
      device: 'metaQuest3',
      activation: 'always',
      verbose: true 
    }),
    compileUIKit({ sourceDir: 'ui', outputDir: 'public/ui', verbose: true }),
    optimizeGLTF({
      level: 'medium'
    }),
  ],
  server: { host: '0.0.0.0', port: 8081, open: true },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' }
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: { target: 'esnext' }
  },
  publicDir: 'public',
  base: './'
});
