import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import basicSsl from '@vitejs/plugin-basic-ssl';

dotenv.config();

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
