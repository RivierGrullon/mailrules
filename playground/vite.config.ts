import { defineConfig } from 'vite';
export default defineConfig({
  base: '/mailrules/',
  resolve: { dedupe: ['react', 'react-dom', 'zod'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          framework: ['react', 'react-dom', 'react-hook-form'],
          forms: ['zod', '@hookform/resolvers/zod'],
        },
      },
    },
  },
});
