import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import basicSsl from '@vitejs/plugin-basic-ssl';

dotenv.config();

// Set VITE_HTTPS=true untuk enable HTTPS self-signed (butuh untuk kamera HP via IP public).
// Default HTTP agar akses http://IP:5173 langsung jalan tanpa warning sertifikat.
const useHttps = process.env.VITE_HTTPS === 'true';

export default defineConfig({
  plugins: useHttps ? [basicSsl()] : [],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    // HMR butuh host yang benar saat akses via IP public
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
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
