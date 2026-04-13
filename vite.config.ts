import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],

    // ✅ GitHub Pages base path
    base: '/Sarkari-Seva-Guide/',

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ""),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },

    server: {
      hmr: true, // disable mat kar abhi
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
