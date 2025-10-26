import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Path resolution
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Build configuration for code splitting
  build: {
    // Increase chunk size warning limit to 3000 KB
    chunkSizeWarningLimit: 3000,

    rollupOptions: {
      output: {
        // Manual chunks for better code splitting
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }

          // Monaco Editor - split into separate chunks
          if (id.includes('node_modules/monaco-editor/')) {
            return 'monaco-editor';
          }
          if (id.includes('node_modules/@monaco-editor/')) {
            return 'monaco-react';
          }

          // Radix UI - split into smaller chunks
          if (id.includes('node_modules/@radix-ui/')) {
            if (id.includes('react-dialog') || id.includes('react-dropdown-menu')) {
              return 'radix-overlay';
            }
            if (id.includes('react-select') || id.includes('react-tabs')) {
              return 'radix-navigation';
            }
            return 'radix-base';
          }

          // Tauri
          if (id.includes('node_modules/@tauri-apps/')) {
            return 'tauri';
          }

          // Charts
          if (id.includes('node_modules/recharts/')) {
            return 'recharts';
          }

          // Framer Motion
          if (id.includes('node_modules/framer-motion/')) {
            return 'framer-motion';
          }

          // Syntax highlighting
          if (id.includes('node_modules/react-syntax-highlighter/')) {
            return 'syntax-vendor';
          }

          // Markdown editor
          if (id.includes('node_modules/@uiw/react-md-editor/')) {
            return 'editor-vendor';
          }

          // DnD Kit
          if (id.includes('node_modules/@dnd-kit/')) {
            return 'dnd-kit';
          }

          // Virtual scrolling
          if (id.includes('node_modules/@tanstack/react-virtual/')) {
            return 'virtual';
          }

          // Utilities
          if (id.includes('node_modules/date-fns/') ||
              id.includes('node_modules/clsx/') ||
              id.includes('node_modules/tailwind-merge/')) {
            return 'utils';
          }

          // Lucide icons
          if (id.includes('node_modules/lucide-react/')) {
            return 'lucide-icons';
          }

          // Other large node_modules
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
        },
      },
    },
  },
}));
