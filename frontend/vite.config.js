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
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          charts: ["recharts", "react-grid-layout", "react-resizable"],
          pdf: ["jspdf", "jspdf-autotable"],
          sheet: ["xlsx"],
          scan: ["html5-qrcode", "zxing-wasm"],
          motion: ["framer-motion"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          radix: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-popover"],
        },
      },
    },
  },
});
