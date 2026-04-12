import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],

    // 🔥 IMPORTANT FIX (GitHub Pages ke liye)
    base: '/REPO-NAME/',   // 👈 yahan apna repo naam daal

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // HMR disabled logic same rakha
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
