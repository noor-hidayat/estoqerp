import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import basicSsl from '@vitejs/plugin-basic-ssl';

dotenv.config();

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
  },
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
