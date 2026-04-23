import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Env variables load karne ke liye
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // 1. Base path ko hamesha slash ke saath rakhein (Jo aapne sahi likha hai)
    base: '/Sarkari-Seva-Guide/',

    plugins: [react()],

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ""),
    },

    resolve: {
      alias: {
        // 2. Alias ko hamesha absolute path banayein
        '@': path.resolve(__dirname, './src'), 
      },
    },

    // 3. Build settings (Optional par zaroori)
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    }
  };
});
