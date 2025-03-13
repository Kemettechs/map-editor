import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@luma.gl/core", "@luma.gl/engine", "@luma.gl/webgl"],
  },
  resolve: {
    alias: {
      "@luma.gl/core": path.resolve(__dirname, "node_modules/@luma.gl/core"),
      "@luma.gl/engine": path.resolve(
        __dirname,
        "node_modules/@luma.gl/engine"
      ),
    },
  },
});
