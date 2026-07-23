import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT/BASE_PATH are required for `vite dev` / `vite preview`, but not for
// `vite build` (e.g. Vercel). Throw only when actually serving.
const isServe =
  process.argv.some((a) => a === 'serve' || a === 'preview') ||
  process.env.npm_lifecycle_event === 'dev' ||
  process.env.npm_lifecycle_event === 'serve';

const rawPort = process.env.PORT;

if (isServe && !rawPort) {
  throw new Error('PORT environment variable is required but was not provided.');
}

const port = Number(rawPort ?? '5173');

if (isServe && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: { strict: true },
    proxy: {
      // Proxy Tendra API to avoid CORS in dev.
      // BASE_PATH is e.g. "/tendra-screener" in Replit, "/" on Vercel.
      // Browser calls <BASE_PATH>/tendra-proxy/api/... → Vite forwards to tendra.fun/api/...
      [`${basePath.replace(/\/$/, '')}/tendra-proxy`]: {
        target: 'https://tendra.fun',
        changeOrigin: true,
        rewrite: (p) =>
          p.replace(
            new RegExp(`^${basePath.replace(/\/$/, '')}/tendra-proxy`),
            '',
          ),
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
