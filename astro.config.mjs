import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// In production nginx serves the static build and proxies /api to the Bun API.
// In dev (`bun run dev` / `bun run demo`) Vite proxies /api to API_URL.
const API_URL = process.env.API_URL || 'http://localhost:4000';

export default defineConfig({
  site: process.env.PUBLIC_URL || 'http://localhost:4321',
  server: { host: process.env.HOST || '127.0.0.1', port: Number(process.env.FRONT_PORT || 4321) },
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: { '/api': { target: API_URL, changeOrigin: true } },
    },
  },
});
