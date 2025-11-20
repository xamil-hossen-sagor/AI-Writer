// Minimal ambient module declaration to avoid TypeScript errors when vite
// type declarations are not installed in the environment.
// This keeps this config file usable without requiring external @types.
declare module 'vite' {
  export function defineConfig(config: any): any;
  export function loadEnv(mode: string, envDir: string, prefix?: string): Record<string, string>;
  // Intentionally avoid exporting a default in this ambient declaration
  // to prevent "Exports and export assignments are not permitted in module augmentations" errors
}

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
