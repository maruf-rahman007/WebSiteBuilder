import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * WebContainers require a cross-origin isolated page (SharedArrayBuffer).
 * Every environment that serves this app must send these two headers.
 */
const crossOriginIsolation = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:8787';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      headers: crossOriginIsolation,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    preview: {
      port: 4173,
      headers: crossOriginIsolation,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      // The lazily loaded workspace chunk (CodeMirror + xterm) is large by nature.
      chunkSizeWarningLimit: 1200,
    },
  };
});
