import { defineConfig } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
      'next/link': '/src/shims/next-link.tsx',
      'next/navigation': '/src/shims/next-navigation.tsx',
      'next/server': '/src/shims/next.ts',
      'next/headers': '/src/shims/next.ts',
      'next': '/src/shims/next.ts',
    },
  },
});
