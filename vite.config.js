// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Heavy vendors get their own long-cached chunks
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("/react/")) return "react";
        },
      },
    },
  },
});
