import { defineConfig } from "vite";

import commonersConfig from "./commoners.config.js";

// https://vitejs.dev/config/
export default defineConfig({
  clearScreen: false,
  server: {
    port: commonersConfig.frontend.port,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13", // Tauri supports es2021
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,  // don't minify for debug builds
    sourcemap: !!process.env.TAURI_DEBUG, // produce sourcemaps for debug builds
  },
});
