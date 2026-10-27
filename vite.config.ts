import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("@codemirror") || id.includes("@lezer")) {
              return "vendor-codemirror";
            }
            if (id.includes("@glideapps/glide-data-grid") || id.includes("lodash-es")) {
              return "vendor-grid";
            }
            if (id.includes("sql-formatter")) {
              return "vendor-sql-formatter";
            }
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
          }
          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
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
      ignored: ["**/src-tauri/**"],
    },
  },
}));

